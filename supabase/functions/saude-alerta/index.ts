// saude-alerta — checagem de saúde de hora em hora que avisa o(s) dono(s) por
// e-mail SÓ quando surge um problema NOVO (dedupe pelo admin_log das últimas 6h).
//
// ⚠️ NÃO HABILITADA AINDA (Fase 4.1). Como envia e-mail de verdade, o Raul pediu
// pra testar junto. Para ligar:
//   1) deploy:  npx supabase functions deploy saude-alerta --project-ref oapcjmkklzaodgpuwjsh --yes
//   2) secret CRON_SECRET já existe; garantir que está nos secrets da função.
//   3) agendar no pg_cron (de hora em hora) um net.http_post pra esta função com
//      header x-cron-secret, igual aos outros crons (ver scripts/setup-cron.mjs).
// Roda com service_role (sem auth.uid()) — por isso refaz as checagens direto,
// em vez de chamar admin_saude() (que é guardada por sou_admin()).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { enviarEmail, layoutEmail, esc } from '../_shared/email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ erro: 'não autorizado' }, 401)

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  // Modo de teste: { so_para: "email" } → manda SÓ pra esse endereço, marca [TESTE]
  // no assunto, pula o dedupe e não grava no admin_log (repetível). Produção manda
  // pra todos os admins com dedupe de 6h.
  const body = await req.json().catch(() => ({}))
  const soPara = typeof body?.so_para === 'string' && body.so_para.includes('@') ? body.so_para.trim() : null

  // Refaz as mesmas checagens do admin_saude() com service_role.
  const problemas: string[] = []
  const { count: trialsVenc } = await sb.from('subscriptions').select('*', { count: 'exact', head: true })
    .eq('status', 'trial').lt('trial_ends_at', new Date().toISOString())
  if ((trialsVenc || 0) > 0) problemas.push(`${trialsVenc} trial(s) vencido(s) ainda como trial`)

  const desde24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count: whErros } = await sb.from('webhook_log').select('*', { count: 'exact', head: true })
    .gte('recebido_em', desde24h).not('erro', 'is', null)
  if ((whErros || 0) > 0) problemas.push(`${whErros} erro(s) de webhook nas últimas 24h`)

  const { count: iaFalhas } = await sb.from('ia_chamadas').select('*', { count: 'exact', head: true })
    .eq('sucesso', false).gte('criado_em', desde24h)
  if ((iaFalhas || 0) > 0) problemas.push(`${iaFalhas} falha(s) de IA nas últimas 24h`)

  const nivel = problemas.length === 0 ? 'ok' : 'problema'
  const assinatura = problemas.slice().sort().join(' | ')  // dedupe por conjunto de problemas

  // Tudo certo: em produção não manda nada; no teste, confirma a entrega mesmo assim.
  if (nivel === 'ok') {
    if (soPara) {
      const htmlOk = layoutEmail({ titulo: 'Tudo certo no HopeFin', corpoHtml: '<p>Nenhum ponto de atenção agora. Este é um e-mail de <strong>teste</strong> do alerta de saúde — a entrega está funcionando.</p>', preheader: 'Teste do alerta de saúde — sem problemas no momento.' })
      await enviarEmail({ para: soPara, assunto: 'HopeFin · [TESTE] alerta de saúde (tudo certo)', html: htmlOk })
      return json({ ok: true, nivel, enviado: true, teste: true, destinatarios: 1 })
    }
    return json({ ok: true, nivel, enviado: false })
  }

  // Dedupe: já avisou o MESMO conjunto nas últimas 6h? Então não repete. (pulado no teste)
  if (!soPara) {
    const desde6h = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
    const { data: ultimos } = await sb.from('admin_log').select('detalhe, criado_em')
      .eq('acao', 'saude_alerta').gte('criado_em', desde6h).order('criado_em', { ascending: false }).limit(1)
    if (ultimos?.[0]?.detalhe?.assinatura === assinatura) return json({ ok: true, nivel, enviado: false, motivo: 'ja_avisado' })
  }

  // Destinatários: no teste, só o endereço indicado; em produção, todos os admins.
  let emails: string[] = []
  if (soPara) {
    emails = [soPara]
  } else {
    const { data: admins } = await sb.from('usuarios').select('id').eq('is_admin', true)
    const ids = (admins || []).map(a => a.id)
    for (const id of ids) {
      const { data: u } = await sb.auth.admin.getUserById(id)
      if (u?.user?.email) emails.push(u.user.email)
    }
  }
  if (emails.length === 0) return json({ ok: true, nivel, enviado: false, motivo: 'sem_destinatario' })

  const corpo = `${soPara ? '<p style="color:#b45309"><strong>[TESTE]</strong> E-mail de teste do alerta de saúde.</p>' : ''}<p>O painel detectou ${problemas.length} ponto(s) de atenção:</p>
    <ul>${problemas.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    <p>Abra o painel em <strong>Saúde do sistema</strong> para ver os detalhes.</p>`
  const html = layoutEmail({ titulo: soPara ? '[TESTE] Atenção no HopeFin' : 'Atenção no HopeFin', corpoHtml: corpo, preheader: soPara ? 'Teste do alerta de saúde.' : 'Checagem automática encontrou um problema novo.' })
  for (const para of emails) {
    await enviarEmail({ para, assunto: soPara ? 'HopeFin · [TESTE] atenção no sistema' : 'HopeFin · atenção no sistema', html })
  }
  if (!soPara) await sb.from('admin_log').insert({ acao: 'saude_alerta', detalhe: { assinatura, problemas, enviados: emails.length } })
  return json({ ok: true, nivel, enviado: true, teste: !!soPara, destinatarios: emails.length })
})
