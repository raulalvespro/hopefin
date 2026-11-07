// renovar-cartao — renovação do ANUAL NO CARTÃO (cobrança parcelada recobrada pelo token).
// Chamada pelo cron diário (hopefin-renovar-cartao). NÃO é chamada por usuário: exige
// header x-cron-secret == CRON_SECRET (deploy --no-verify-jwt).
//
// Para cada assinatura ativa, anual, no cartão, sem cancelamento pedido:
//   D-7 (faltam 7 dias p/ o fim do período) -> e-mail de aviso ('renovacao_aviso'):
//        valor, em quantas vezes e como cancelar. Nada é cobrado nesse dia.
//   D0 (fim do período) -> recobra o cartão pelo token, MESMO preço travado (preco_centavos)
//        e mesmas parcelas ('renovacao_cobranca'). Sucesso: o webhook estende o período.
//        Falha: status 'past_due' + e-mail pedindo para atualizar o cartão ('renovacao_falha').
//
// Idempotência: email_log com índice único (grupo_id, tipo, ref), ref = data do fim do período.
// Cancelou? cancel_at_period_end = true (e o token é apagado) -> nunca entra aqui.
//
// Corpo opcional (JSON): { so_grupo?: uuid }   Segredos: CRON_SECRET, ASAAS_API_KEY, ASAAS_BASE_URL (opc.)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { layoutEmail, enviarEmail, esc } from '../_shared/email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
const ASAAS_KEY = Deno.env.get('ASAAS_API_KEY') || ''
const ASAAS_BASE = Deno.env.get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3'
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cron-secret, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const dataBRT = (d: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d)
function diffDias(fim: string, hoje: string): number {
  const [ay, am, ad] = fim.split('-').map(Number)
  const [by, bm, bd] = hoje.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}
const brl = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

async function asaas(path: string, init: RequestInit = {}) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    ...init,
    headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.errors?.[0]?.description || `Asaas HTTP ${res.status}`)
  return data
}

// Reserva o envio/cobrança (idempotência). true = pode seguir; false = já foi feito.
async function reservar(grupoId: string, titularId: string | null, tipo: string, ref: string, destino: string | null, assunto: string) {
  const ins = await admin.from('email_log')
    .insert({ grupo_id: grupoId, titular_id: titularId, tipo, ref, destino, assunto, status: 'enviando' })
    .select('id').maybeSingle()
  if (ins.error) return null // 23505 = já feito para este período
  return ins.data!.id as string
}
async function enviar(logId: string, para: string, assunto: string, html: string) {
  const env = await enviarEmail({ para, assunto, html })
  if (env.ok) await admin.from('email_log').update({ status: 'enviado', resend_id: env.id }).eq('id', logId)
  else await admin.from('email_log').update({ status: 'erro', erro: env.erro }).eq('id', logId)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ erro: 'não autorizado' }, 401)
  if (!ASAAS_KEY) return json({ erro: 'ASAAS_API_KEY não configurada' }, 500)

  const body = await req.json().catch(() => ({}))
  const soGrupo = typeof body?.so_grupo === 'string' ? body.so_grupo : null

  let qb = admin.from('subscriptions').select('*')
    .eq('status', 'active').eq('ciclo', 'anual').eq('metodo_pagamento', 'cartao')
    .eq('cancel_at_period_end', false).eq('is_cortesia', false)
    .not('current_period_end', 'is', null)
  if (soGrupo) qb = qb.eq('grupo_id', soGrupo)
  const { data: subs, error } = await qb
  if (error) return json({ erro: error.message }, 500)

  const hoje = dataBRT(new Date())
  const out = { verificadas: subs?.length || 0, avisos: 0, cobrancas: 0, falhas: 0, puladas: 0, detalhes: [] as unknown[] }

  for (const s of subs || []) {
    const fim = dataBRT(new Date(s.current_period_end as string))
    const d = diffDias(fim, hoje)
    if (d > 0 && d !== 7) continue // só age no D-7 (aviso) e a partir do D0 (cobrança)

    const { data: u } = await admin.from('usuarios').select('email, nome').eq('id', s.titular_id).maybeSingle()
    const nome = u?.nome ? `Olá, ${esc(String(u.nome).split(' ')[0])}!<br><br>` : ''
    const parcelas = Number(s.parcelas) || 1
    const forma = parcelas > 1 ? `em ${parcelas}x` : 'à vista'

    // ---- D-7: aviso ----
    if (d === 7) {
      if (!u?.email) { out.puladas++; continue }
      const assunto = 'Seu plano anual do HopeFin renova em 7 dias'
      const logId = await reservar(s.grupo_id, s.titular_id, 'renovacao_aviso', fim, u.email, assunto)
      if (!logId) { out.puladas++; continue }
      const html = layoutEmail({
        titulo: 'Seu plano renova em 7 dias',
        preheader: assunto,
        corpoHtml: `${nome}Seu plano anual do HopeFin renova em <strong>${dataBR(s.current_period_end)}</strong>. ` +
          `Vamos cobrar <strong>${brl(s.preco_centavos)}</strong> (${forma}) no mesmo cartão, com o preço que você já tem.<br><br>` +
          'Não quer renovar? É só cancelar em <strong>Configurações → Minha assinatura</strong> antes dessa data — ' +
          'o acesso continua até o fim do período já pago e nada será cobrado.',
        cta: { texto: 'Ver minha assinatura', url: 'https://app.hopefin.com.br/configuracoes' },
      })
      await enviar(logId, u.email, assunto, html)
      out.avisos++; out.detalhes.push({ grupo: s.grupo_id, tipo: 'aviso' })
      continue
    }

    // ---- D0 (ou atrasado): cobra ----
    if (d > 0) continue
    const logId = await reservar(s.grupo_id, s.titular_id, 'renovacao_cobranca', fim, u?.email || null, 'Renovação do plano anual')
    if (!logId) { out.puladas++; continue } // já cobrou para este período

    try {
      const { data: seg } = await admin.from('subscription_secrets').select('asaas_card_token').eq('grupo_id', s.grupo_id).maybeSingle()
      if (!seg?.asaas_card_token) throw new Error('sem token do cartão')
      const cobranca: Record<string, unknown> = {
        customer: s.asaas_customer_id,
        billingType: 'CREDIT_CARD',
        dueDate: hoje,
        description: `HopeFin Família (renovação anual${parcelas > 1 ? `, ${parcelas}x` : ''})`,
        externalReference: s.grupo_id,
        creditCardToken: seg.asaas_card_token,
        remoteIp: '127.0.0.1',
      }
      if (parcelas > 1) { cobranca.installmentCount = parcelas; cobranca.totalValue = s.preco_centavos / 100 }
      else { cobranca.value = s.preco_centavos / 100 }
      const pg = await asaas('/payments', { method: 'POST', body: JSON.stringify(cobranca) })
      await admin.from('subscriptions').update({
        asaas_installment_id: pg.installment || null, asaas_last_payment_id: pg.id,
      }).eq('id', s.id)
      // O webhook (PAYMENT_CONFIRMED) estende o período; aqui só avisamos.
      await admin.from('email_log').update({ status: 'enviado' }).eq('id', logId) // cobrança feita (a trava deixa de ficar "enviando")
      out.cobrancas++; out.detalhes.push({ grupo: s.grupo_id, tipo: 'cobranca', status: pg.status })
      if (u?.email) {
        const assunto = 'Seu plano anual do HopeFin foi renovado'
        const lid = await reservar(s.grupo_id, s.titular_id, 'renovacao_ok', fim, u.email, assunto)
        if (lid) await enviar(lid, u.email, assunto, layoutEmail({
          titulo: 'Plano renovado',
          preheader: assunto,
          corpoHtml: `${nome}Renovamos o seu plano anual: <strong>${brl(s.preco_centavos)}</strong> (${forma}) no cartão cadastrado. Obrigado por continuar com a gente!`,
          cta: { texto: 'Abrir o HopeFin', url: 'https://app.hopefin.com.br' },
        }))
      }
    } catch (e) {
      const msg = (e as Error)?.message || 'erro'
      console.error('[renovar-cartao]', s.grupo_id, msg)
      out.falhas++; out.detalhes.push({ grupo: s.grupo_id, tipo: 'falha', erro: msg })
      await admin.from('email_log').update({ status: 'erro', erro: msg }).eq('id', logId)
      await admin.from('subscriptions').update({ status: 'past_due' }).eq('id', s.id)
      if (u?.email) {
        const assunto = 'Não conseguimos renovar o seu plano do HopeFin'
        const lid = await reservar(s.grupo_id, s.titular_id, 'renovacao_falha', fim, u.email, assunto)
        if (lid) await enviar(lid, u.email, assunto, layoutEmail({
          titulo: 'Não conseguimos renovar',
          preheader: assunto,
          corpoHtml: `${nome}Tentamos renovar o seu plano anual, mas a cobrança no cartão não passou. ` +
            'Seus dados continuam guardados: você ainda vê e exporta tudo. Para voltar a lançar, é só assinar de novo com um cartão válido (ou pelo Pix).',
          cta: { texto: 'Regularizar agora', url: 'https://app.hopefin.com.br/planos' },
        }))
      }
    }
  }
  return json(out)
})
