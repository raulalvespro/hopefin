// asaas-webhook — recebe os eventos do Asaas e atualiza subscriptions.status.
//
// Segurança: o Asaas manda o header `asaas-access-token` com o token que
// cadastramos no painel/na API. Conferimos contra ASAAS_WEBHOOK_TOKEN.
// Deploy SEM verificação de JWT (o Asaas não manda JWT):
//   supabase functions deploy asaas-webhook --no-verify-jwt
//
// Eventos tratados:
//   PAYMENT_CONFIRMED / PAYMENT_RECEIVED -> status 'active' (+ marca
//     is_lancamento na 1ª ativação, se a assinatura foi feita no preço de lançamento)
//   PAYMENT_OVERDUE                      -> status 'past_due'
//   PAYMENT_DELETED / _REFUNDED / SUBSCRIPTION_DELETED -> 'canceled'
//     (exceto remoção causada pelo cancelamento do usuário: acesso segue até o fim do período)
//
// Sempre responde 200 rápido (o Asaas re-tenta em erro).

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN') || ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Soma 1 mês ou 1 ano à data (fim do período vigente).
function fimPeriodo(ciclo: string, base = new Date()): Date {
  const d = new Date(base)
  if (ciclo === 'anual') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405)

  // Valida o token do Asaas.
  if (!WEBHOOK_TOKEN || req.headers.get('asaas-access-token') !== WEBHOOK_TOKEN) {
    return json({ error: 'não autorizado' }, 401)
  }

  const body = await req.json().catch(() => ({}))
  const event: string = body?.event || ''
  const pay = body?.payment || {}
  const subId: string | null = pay?.subscription || null

  // Registra o evento recebido (log visível no /admin — prompt 8). Nunca falha
  // o webhook por causa do log; atualizamos o desfecho ao final.
  let logId: string | null = null
  try {
    const { data: logRow } = await admin.from('webhook_log')
      .insert({ origem: 'asaas', evento: event, payment_id: pay?.id || null, status: 'recebido', payload: body })
      .select('id').maybeSingle()
    logId = logRow?.id || null
  } catch { /* log é best-effort */ }
  const fecharLog = async (status: string, erro: string | null = null) => {
    if (logId) { try { await admin.from('webhook_log').update({ status, erro }).eq('id', logId) } catch { /* ignore */ } }
  }

  // Sem assinatura vinculada não há o que atualizar (ex.: cobrança avulsa).
  if (!subId) { await fecharLog('ignorado: sem subscription'); return json({ ok: true, ignorado: 'sem subscription' }) }

  const { data: sub } = await admin
    .from('subscriptions').select('*').eq('asaas_subscription_id', subId).maybeSingle()
  if (!sub) { await fecharLog('ignorado: subscription desconhecida'); return json({ ok: true, ignorado: 'subscription desconhecida' }) }

  try {
    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      await admin.from('subscriptions').update({
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: fimPeriodo(sub.ciclo).toISOString(),
        asaas_last_payment_id: pay?.id || sub.asaas_last_payment_id,
      }).eq('id', sub.id)

      // Marca "assinou no preço de lançamento" na 1ª ativação (anual), para o
      // /admin contar quantos pegaram o lançamento. Sem limite de vagas.
      if (!sub.is_lancamento && sub.ciclo === 'anual') {
        const { data: cfg } = await admin
          .from('planos_config').select('*').eq('id', 1).maybeSingle()
        const precosLanc = [cfg?.lanc_anual_pix_centavos, cfg?.lanc_anual_cartao_centavos]
        if (cfg && precosLanc.includes(sub.preco_centavos)) {
          await admin.from('subscriptions')
            .update({ is_lancamento: true, lancamento_em: new Date().toISOString() })
            .eq('id', sub.id)
        }
      }
      await fecharLog('active')
      return json({ ok: true, status: 'active' })
    }

    if (event === 'PAYMENT_OVERDUE') {
      await admin.from('subscriptions').update({ status: 'past_due' }).eq('id', sub.id)
      await fecharLog('past_due')
      return json({ ok: true, status: 'past_due' })
    }

    if (event === 'PAYMENT_DELETED' || event === 'PAYMENT_REFUNDED' || event === 'SUBSCRIPTION_DELETED') {
      // Cancelamento pedido pelo usuário (asaas-cancelar): as remoções no Asaas chegam
      // aqui, mas o acesso segue até o fim do período já pago. O estado final
      // ('canceled') é aplicado por encerrar_assinaturas_canceladas() (cron diário).
      const fim = sub.current_period_end ? new Date(sub.current_period_end) : null
      if (event !== 'PAYMENT_REFUNDED' && sub.cancel_at_period_end && fim && fim > new Date()) {
        await fecharLog('ignorado: cancelamento agendado até o fim do período')
        return json({ ok: true, ignorado: 'cancelamento agendado' })
      }
      await admin.from('subscriptions').update({
        status: 'canceled', canceled_at: new Date().toISOString(),
      }).eq('id', sub.id)
      await fecharLog('canceled')
      return json({ ok: true, status: 'canceled' })
    }

    await fecharLog('ignorado: ' + event)
    return json({ ok: true, ignorado: event })
  } catch (err) {
    console.error('[asaas-webhook]', event, (err as Error)?.message)
    await fecharLog('erro', (err as Error)?.message || 'erro')
    // 200 mesmo em erro evita retries em loop; o erro fica no log.
    return json({ ok: false, erro: (err as Error)?.message })
  }
})
