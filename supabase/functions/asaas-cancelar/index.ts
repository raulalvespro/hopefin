// asaas-cancelar — cancela a assinatura do grupo, a pedido de quem assinou.
// Chamada pelo app (Configurações → Assinatura → Cancelar assinatura).
//
// O que garante "não cobrar mais":
//   1) Marca cancel_at_period_end ANTES de falar com o Asaas — assim os webhooks de
//      remoção (PAYMENT_DELETED / SUBSCRIPTION_DELETED) não derrubam o acesso na hora
//      (ver asaas-webhook).
//   2) Apaga no Asaas todas as cobranças ainda em aberto (PENDING e OVERDUE) da
//      assinatura e DEPOIS a própria assinatura (para não gerar a próxima cobrança).
//   3) Se der erro no Asaas, desfaz a marca e devolve erro — nunca fica "cancelado"
//      no app com a cobrança viva no Asaas.
//
// O acesso segue até current_period_end (período já pago). Depois disso o banco
// (grupo_pode_lancar) bloqueia novos lançamentos e o cron vira status 'canceled'.
// Reembolso (arrependimento, art. 49 CDC) NÃO é automático: é pedido por e-mail.
//
// Requer JWT de usuário. Só quem assinou (titular) pode cancelar.
// Segredos: ASAAS_API_KEY, ASAAS_BASE_URL (opcional). Deploy com verificação de JWT.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { layoutEmail, enviarEmail, esc } from '../_shared/email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ASAAS_KEY = Deno.env.get('ASAAS_API_KEY') || ''
const ASAAS_BASE = Deno.env.get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

class AsaasErro extends Error { constructor(msg: string, public status: number) { super(msg) } }

async function asaas(path: string, init: RequestInit = {}) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    ...init,
    headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new AsaasErro(data?.errors?.[0]?.description || `Asaas HTTP ${res.status}`, res.status)
  return data
}

// Apaga uma cobrança/assinatura; "já não existe" (404) conta como sucesso.
async function apagar(path: string) {
  try { await asaas(path, { method: 'DELETE' }) } catch (e) {
    if (e instanceof AsaasErro && e.status === 404) return
    throw e
  }
}

// E-mail de confirmação (best-effort: se falhar, o cancelamento já está feito e não é desfeito).
async function avisarCancelamento(grupoId: string, titularId: string, email: string | null, nome: string | null, acessoAte: Date | null) {
  if (!email) return
  const ref = new Date().toISOString() // permite novo aviso se a pessoa assinar e cancelar de novo
  const assunto = 'Seu cancelamento no HopeFin foi confirmado'
  const ins = await admin.from('email_log')
    .insert({ grupo_id: grupoId, titular_id: titularId, tipo: 'cancelamento', ref, destino: email, assunto, status: 'enviando' })
    .select('id').maybeSingle()
  if (ins.error || !ins.data) return
  const ola = nome ? `Olá, ${esc(nome.split(' ')[0])}!<br><br>` : ''
  const ate = acessoAte
    ? `Você continua usando o HopeFin normalmente até <strong>${acessoAte.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</strong> (período que já está pago).`
    : 'O acesso para novos lançamentos foi encerrado.'
  const html = layoutEmail({
    titulo: 'Cancelamento confirmado',
    preheader: assunto,
    corpoHtml: `${ola}Recebemos o seu pedido e a assinatura foi cancelada. <strong>Nenhuma nova cobrança será feita.</strong><br><br>${ate}<br><br>` +
      'Seus dados continuam guardados: você pode ver e exportar tudo quando quiser. ' +
      'Se foi nos últimos 7 dias depois do pagamento e você quer o reembolso, é só responder este e-mail.<br><br>' +
      'Mudou de ideia? Você pode assinar de novo a qualquer momento.',
    cta: { texto: 'Ver planos', url: 'https://app.hopefin.com.br/planos' },
  })
  const env = await enviarEmail({ para: email, assunto, html })
  if (env.ok) await admin.from('email_log').update({ status: 'enviado', resend_id: env.id }).eq('id', ins.data.id)
  else await admin.from('email_log').update({ status: 'erro', erro: env.erro }).eq('id', ins.data.id)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405)
  if (!ASAAS_KEY) return json({ error: 'ASAAS_API_KEY não configurada' }, 500)

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: u } = await admin.auth.getUser(jwt)
  if (!u?.user) return json({ error: 'não autenticado' }, 401)

  const { data: perfil } = await admin.from('usuarios').select('grupo_id, nome, email').eq('id', u.user.id).maybeSingle()
  if (!perfil?.grupo_id) return json({ error: 'usuário sem grupo' }, 400)

  const { data: sub } = await admin.from('subscriptions').select('*').eq('grupo_id', perfil.grupo_id).maybeSingle()
  if (!sub) return json({ error: 'sem assinatura' }, 404)
  if (sub.is_cortesia) return json({ error: 'cortesia: não há cobrança para cancelar' }, 400)
  if (sub.titular_id && sub.titular_id !== u.user.id) {
    return json({ error: 'só quem fez a assinatura pode cancelar' }, 403)
  }
  if (sub.status === 'canceled' || sub.status === 'expired') return json({ ok: true, jaCancelada: true })

  const agora = new Date()
  const fimPeriodo = sub.current_period_end ? new Date(sub.current_period_end) : null
  const periodoPagoEmCurso = sub.status === 'active' && !!fimPeriodo && fimPeriodo > agora

  // 1) Marca antes, para os webhooks de remoção não encerrarem o acesso agora.
  await admin.from('subscriptions').update({
    cancel_at_period_end: true, canceled_at: agora.toISOString(),
  }).eq('id', sub.id)

  try {
    if (sub.asaas_subscription_id) {
      // 2) Cobranças em aberto primeiro, assinatura depois.
      for (const status of ['PENDING', 'OVERDUE']) {
        const lista = await asaas(`/subscriptions/${sub.asaas_subscription_id}/payments?status=${status}&limit=100`)
        for (const p of lista?.data || []) await apagar(`/payments/${p.id}`)
      }
      await apagar(`/subscriptions/${sub.asaas_subscription_id}`)
    }
  } catch (err) {
    // 3) Falhou: desfaz a marca. Nada fica "cancelado" com cobrança viva.
    console.error('[asaas-cancelar]', (err as Error)?.message)
    await admin.from('subscriptions').update({
      cancel_at_period_end: sub.cancel_at_period_end, canceled_at: sub.canceled_at,
    }).eq('id', sub.id)
    return json({ error: 'Não foi possível cancelar agora. Nada foi alterado — tente de novo em instantes.' }, 502)
  }

  // Sem checkout concluído (ainda em teste): só limpa o vínculo, o teste segue.
  if (sub.status === 'trial') {
    await admin.from('subscriptions').update({
      cancel_at_period_end: false, canceled_at: null, asaas_subscription_id: null,
    }).eq('id', sub.id)
    return json({ ok: true, emTeste: true })
  }

  // Sem período pago em curso (ex.: pagamento em atraso): encerra já.
  if (!periodoPagoEmCurso) {
    await admin.from('subscriptions').update({ status: 'canceled' }).eq('id', sub.id)
    await avisarCancelamento(perfil.grupo_id, u.user.id, perfil.email || u.user.email || null, perfil.nome, null)
    return json({ ok: true, acessoAte: null })
  }

  await avisarCancelamento(perfil.grupo_id, u.user.id, perfil.email || u.user.email || null, perfil.nome, fimPeriodo)
  return json({ ok: true, acessoAte: fimPeriodo!.toISOString() })
})
