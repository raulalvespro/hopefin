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
// Reembolso (arrependimento, art. 49 CDC): { reembolso: true } nos 7 dias da 1ª cobrança estorna no Asaas.
// Se o Asaas recusar por FALTA DE SALDO (27/11): cancela do mesmo jeito, registra em reembolsos_pendentes com
// prazo de 2 dias úteis, avisa o cliente e o dono, e a função `reembolsos` tenta de novo de hora em hora.
//
// Requer JWT de usuário. Só quem assinou (titular) pode cancelar.
// Segredos: ASAAS_API_KEY, ASAAS_BASE_URL (opcional). Deploy com verificação de JWT.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { layoutEmail, enviarEmail, esc } from '../_shared/email.ts'
import { doModelo } from '../_shared/modelos.ts'
import { varsBase } from '../_shared/modelo.js'
import { ehFaltaDeSaldo, prazoEmDiasUteis, estornar, avisarDono, dataBR, reais } from '../_shared/reembolso.ts'

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
async function avisarCancelamento(grupoId: string, titularId: string, email: string | null, nome: string | null, acessoAte: Date | null, reembolso = false, pendente: { valor: number; prazo: Date } | null = null) {
  if (!email) return
  const ref = new Date().toISOString() // permite novo aviso se a pessoa assinar e cancelar de novo
  const assunto = 'Seu cancelamento no HopeFin foi confirmado'
  const ins = await admin.from('email_log')
    .insert({ grupo_id: grupoId, titular_id: titularId, tipo: 'cancelamento', ref, destino: email, assunto, status: 'enviando' })
    .select('id').maybeSingle()
  if (ins.error || !ins.data) return
  const ola = nome ? `Olá, ${esc(nome.split(' ')[0])}!<br><br>` : ''
  const ate = pendente
    ? `Seu <strong>reembolso integral de ${reais(pendente.valor)}</strong> (art. 49 do CDC) está registrado e será feito <strong>até ${dataBR(pendente.prazo)}</strong>. Você recebe outro e-mail quando o dinheiro for devolvido. O acesso para novos lançamentos foi encerrado.`
    : reembolso
    ? 'Pedimos o <strong>reembolso integral</strong> do que você pagou (art. 49 do CDC). O valor volta para a mesma forma de pagamento — no cartão, pode levar até duas faturas para aparecer. O acesso para novos lançamentos foi encerrado.'
    : acessoAte
    ? `Você continua usando o HopeFin normalmente até <strong>${acessoAte.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</strong> (período que já está pago).`
    : 'O acesso para novos lançamentos foi encerrado.'
  const html = layoutEmail({
    titulo: 'Cancelamento confirmado',
    preheader: assunto,
    corpoHtml: `${ola}Recebemos o seu pedido e a assinatura foi cancelada. <strong>Nenhuma nova cobrança será feita.</strong><br><br>${ate}<br><br>` +
      'Seus dados continuam guardados: você pode ver e exportar tudo quando quiser. ' +
      'Mudou de ideia? Você pode assinar de novo a qualquer momento.',
    cta: { texto: 'Ver planos', url: 'https://app.hopefin.com.br/planos' },
  })
  const m = await doModelo(admin, 'cancelamento', { ...varsBase(nome), situacao: { html: ate } }) // texto do Painel (essencial)
  const env = m && !m.desligado
    ? await enviarEmail({ para: email, assunto: m.assunto, html: m.html, etiqueta: 'cancelamento' })
    : await enviarEmail({ para: email, assunto, html, etiqueta: 'cancelamento' })
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

  const body = await req.json().catch(() => ({}))
  const agora = new Date()
  const fimPeriodo = sub.current_period_end ? new Date(sub.current_period_end) : null
  let periodoPagoEmCurso = sub.status === 'active' && !!fimPeriodo && fimPeriodo > agora

  // Reembolso automático: só nos 7 primeiros dias da PRIMEIRA cobrança (art. 49 do CDC).
  // Estorna ANTES de cancelar: se o Asaas recusar, nada muda e a pessoa pode tentar de novo.
  let reembolsou = false
  let pendente: { valor: number; prazo: Date } | null = null
  let pendenteId: string | null = null
  if (body?.reembolso === true) {
    const prim = sub.primeira_cobranca_em ? new Date(sub.primeira_cobranca_em) : null
    const elegivel = sub.status === 'active' && !!prim && agora.getTime() - prim.getTime() <= 7 * 86400000
    if (!elegivel) return json({ error: 'O prazo de 7 dias para reembolso já passou.' }, 400)
    const ref = { asaas_installment_id: sub.asaas_installment_id, asaas_payment_id: sub.asaas_installment_id ? null : sub.asaas_last_payment_id }
    try {
      await estornar(asaas, ref)
      reembolsou = true
      periodoPagoEmCurso = false // reembolsou: o acesso termina agora
    } catch (err) {
      const motivo = (err as Error)?.message || 'erro'
      console.error('[asaas-cancelar] reembolso:', motivo)
      if (!ehFaltaDeSaldo(motivo)) {
        return json({ error: 'Não foi possível pedir o reembolso agora. Nada foi alterado — tente de novo ou fale com contato@hopefin.com.br.' }, 502)
      }
      // Sem saldo no Asaas: registra o reembolso devido ANTES de cancelar (se não gravar, nada muda).
      const prazo = prazoEmDiasUteis()
      const ins = await admin.from('reembolsos_pendentes').insert({
        grupo_id: sub.grupo_id, subscription_id: sub.id, titular_id: u.user.id,
        email: perfil.email || u.user.email || null, nome: perfil.nome || null,
        valor_centavos: sub.preco_centavos, metodo: sub.metodo_pagamento || null,
        ...ref, motivo, ultimo_erro: motivo, tentativas: 1, ultima_tentativa_em: agora.toISOString(),
        prazo_em: prazo.toISOString(),
      }).select('*').maybeSingle()
      if (ins.error || !ins.data) {
        console.error('[asaas-cancelar] registrar pendente:', ins.error?.message)
        return json({ error: 'Não foi possível pedir o reembolso agora. Nada foi alterado — tente de novo ou fale com contato@hopefin.com.br.' }, 502)
      }
      pendente = { valor: sub.preco_centavos, prazo }
      pendenteId = ins.data.id
      periodoPagoEmCurso = false // o acesso termina agora, como no reembolso
    }
  }

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
    } else if (sub.asaas_installment_id) {
      // Anual no cartão (parcelado): o cartão já foi cobrado; só apaga parcela que ainda esteja em aberto.
      const lista = await asaas(`/installments/${sub.asaas_installment_id}/payments?limit=100`)
      for (const p of lista?.data || []) {
        if (p.status === 'PENDING' || p.status === 'OVERDUE') await apagar(`/payments/${p.id}`)
      }
    }
    // Sem token, sem renovação: some a referência do cartão (a renovação também confere cancel_at_period_end).
    await admin.from('subscription_secrets').delete().eq('grupo_id', sub.grupo_id)
  } catch (err) {
    // 3) Falhou: desfaz a marca. Nada fica "cancelado" com cobrança viva.
    console.error('[asaas-cancelar]', (err as Error)?.message)
    // O cancelamento não aconteceu: o reembolso pendente também não vale (a pessoa tenta de novo).
    if (pendenteId) await admin.from('reembolsos_pendentes').delete().eq('id', pendenteId)
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
    if (pendenteId) {
      try {
        const { data: row } = await admin.from('reembolsos_pendentes').select('*').eq('id', pendenteId).maybeSingle()
        if (row) await avisarDono(admin, row, 'novo')
      } catch (e) { console.error('[asaas-cancelar] aviso dono:', (e as Error)?.message) }
    }
    await avisarCancelamento(perfil.grupo_id, u.user.id, perfil.email || u.user.email || null, perfil.nome, null, reembolsou, pendente)
    return json({ ok: true, acessoAte: null, reembolso: reembolsou, ...(pendente ? { reembolsoPendente: true, prazo: pendente.prazo.toISOString() } : {}) })
  }

  await avisarCancelamento(perfil.grupo_id, u.user.id, perfil.email || u.user.email || null, perfil.nome, fimPeriodo)
  return json({ ok: true, acessoAte: fimPeriodo!.toISOString() })
})
