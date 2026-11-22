// admin-suporte-responder — responde um contato da caixa de suporte, acionado pelo dono no painel.
//
// • E-mail recebido (origem 'email'): envia a resposta pelo NOSSO Resend (avisos@, reply-to
//   contato@), com o layout da marca, e marca como respondido (como sempre foi).
// • Chamado aberto no app (origem 'app', migração 0081): GRAVA a resposta primeiro (ela aparece no
//   app, em Ajuda › Meus chamados, mesmo se o e-mail falhar), depois avisa a pessoa por e-mail e por
//   notificação no celular. Responder de novo acrescenta (o histórico não se perde).
//
// Segurança: roda com verify-jwt. O JWT diz QUEM chamou; validamos is_admin com o
// service_role e a sessão com o código do celular (aal2) antes de enviar.
// Auditoria em admin_log.
// Segredos: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, VAPID_* (SUPABASE_URL/ANON injetados.)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { layoutEmail, enviarEmail, esc } from '../_shared/email.ts'
import { doModelo } from '../_shared/modelos.ts'
import { varsBase } from '../_shared/modelo.js'
import { nivelDaSessao } from '../_shared/sessao.ts'
import { pushParaGrupo } from '../_shared/push.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
const LINK_CHAMADOS = 'https://app.hopefin.com.br/?ajuda=chamados'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Transforma o texto digitado (quebras de linha) em parágrafos HTML seguros.
const paraHtml = (t: string) =>
  String(t).split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')

// Código curto do chamado (igual ao do app e do painel): HF- + 6 primeiros do id.
const codChamado = (id: string) => 'HF-' + String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase()

// "21/11 às 14:30" no horário de Brasília (separador entre respostas do mesmo chamado).
function quando(d: Date) {
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const sb = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
  const { data: userData } = await sb.auth.getUser()
  if (!userData?.user) return json({ erro: 'não autenticado' }, 401)
  const uid = userData.user.id

  const { data: me } = await admin.from('usuarios').select('is_admin').eq('id', uid).maybeSingle()
  if (!me?.is_admin) return json({ erro: 'não autorizado' }, 403)
  // O painel exige o código do celular (2 etapas): sessão aal2 (L37, 19/11/2026).
  if (nivelDaSessao(jwt) !== 'aal2') return json({ erro: 'confirme o código do celular no painel' }, 403)

  const body = await req.json().catch(() => ({}))
  const id: string | undefined = body?.id
  const texto: string = (body?.texto || '').toString().trim()
  if (!id) return json({ erro: 'faltou id' }, 400)
  if (!texto) return json({ erro: 'faltou o texto da resposta' }, 400)
  if (texto.length > 8000) return json({ erro: 'resposta grande demais' }, 400)

  // Carrega o contato original (service_role; já validamos que é admin).
  const { data: msg } = await admin
    .from('suporte_emails')
    .select('de_email, de_nome, assunto, grupo_id, origem, usuario_id, resposta')
    .eq('id', id)
    .maybeSingle()
  if (!msg) return json({ erro: 'contato não encontrado' }, 404)

  const nome = msg.de_nome ? esc(String(msg.de_nome).split(' ')[0]) : ''

  // ───────────── Chamado aberto no app ─────────────
  if (msg.origem === 'app') {
    const agora = new Date()
    const resposta = msg.resposta
      ? `${msg.resposta}\n\n— Nova resposta (${quando(agora)}) —\n${texto}`
      : texto
    // 1) Grava primeiro: a resposta aparece no app mesmo se o e-mail ou a notificação falharem.
    const { error: eUp } = await admin.from('suporte_emails')
      .update({ status: 'respondido', respondido_em: agora.toISOString(), resposta })
      .eq('id', id)
    if (eUp) return json({ erro: 'não consegui gravar a resposta' }, 500)

    const cod = codChamado(id)
    // 2) E-mail pra quem abriu.
    let email = 'sem e-mail'
    let resendId: string | undefined
    if (msg.de_email) {
      const html = layoutEmail({
        titulo: 'Respondemos seu chamado',
        corpoHtml:
          `${nome ? `<p>Oi ${nome},</p>` : ''}` +
          `<p>Sobre o seu chamado <strong>${esc(cod)}</strong>${msg.assunto ? ` — “${esc(msg.assunto)}”` : ''}:</p>` +
          `<div style="border-left:3px solid #10b981;padding-left:14px;margin:14px 0;">${paraHtml(texto)}</div>` +
          `<p>A resposta também está no app, em <strong>Ajuda › Meus chamados</strong>.</p>`,
        preheader: 'A equipe HopeFin respondeu o seu chamado.',
        cta: { texto: 'Ver no app', url: LINK_CHAMADOS },
      })
      // Texto do Painel (E-mails automáticos, 0090) — essencial, não desliga.
      const m = await doModelo(admin, 'chamado_resposta', {
        ...varsBase(msg.de_nome), codigo: cod,
        assunto_chamado: { html: msg.assunto ? ` — “${esc(msg.assunto)}”` : '' },
        resposta: { html: `<div style="border-left:3px solid #10b981;padding-left:14px;margin:4px 0;">${paraHtml(texto)}</div>` },
      })
      const env = m && !m.desligado
        ? await enviarEmail({ para: msg.de_email, assunto: m.assunto, html: m.html, etiqueta: 'chamado_resposta' })
        : await enviarEmail({ para: msg.de_email, assunto: `Respondemos seu chamado ${cod}`, html, etiqueta: 'chamado_resposta' })
      email = env.ok ? 'enviado' : `falhou: ${env.erro || 'erro'}`
      // Registro pro Painel (E-mails automáticos: quantos saíram, aberturas e cliques).
      try {
        await admin.from('email_log').insert({ grupo_id: msg.grupo_id || null, titular_id: msg.usuario_id || null, tipo: 'chamado_resposta',
          ref: `${id}:${agora.toISOString()}`, destino: msg.de_email, assunto: m && !m.desligado ? m.assunto : `Respondemos seu chamado ${cod}`,
          status: env.ok ? 'enviado' : 'erro', resend_id: env.id || null, erro: env.ok ? null : (env.erro || 'erro') })
      } catch (_) { /* best-effort */ }
      resendId = env.id
    }
    // 3) Notificação no celular (só os aparelhos de quem abriu).
    let push = 0
    if (msg.usuario_id) {
      try {
        const r = await pushParaGrupo(admin, msg.grupo_id || '', {
          title: 'Respondemos seu chamado 💬',
          body: msg.assunto ? `Sobre “${String(msg.assunto).slice(0, 80)}”. Toque para ver.` : 'Toque para ver a resposta.',
          url: '/?ajuda=chamados',
          tag: `chamado-${id}`,
        }, msg.usuario_id)
        push = r.enviados || 0
      } catch (e) {
        console.error('push do chamado falhou', (e as Error).message)
      }
    }

    await admin.from('admin_log').insert({
      admin_id: uid, acao: 'suporte_responder', grupo_id: msg.grupo_id,
      detalhe: { suporte_id: id, origem: 'app', email, push, resend_id: resendId },
    })
    return json({ ok: true, app: true, email, push })
  }

  // ───────────── E-mail recebido (como sempre foi) ─────────────
  if (!msg.de_email) return json({ erro: 'e-mail não encontrado' }, 404)
  const assunto = `Re: ${msg.assunto || 'seu contato'}`
  const html = layoutEmail({
    titulo: 'Resposta do HopeFin',
    corpoHtml: `${nome ? `<p>Oi ${nome},</p>` : ''}${paraHtml(texto)}`,
    preheader: 'Resposta da equipe HopeFin.',
  })

  const env = await enviarEmail({ para: msg.de_email, assunto, html })
  if (!env.ok) return json({ erro: env.erro || 'falha no envio' }, 502)

  // Marca como respondido e guarda a resposta enviada.
  await admin.from('suporte_emails')
    .update({ status: 'respondido', respondido_em: new Date().toISOString(), resposta: texto })
    .eq('id', id)

  await admin.from('admin_log').insert({
    admin_id: uid, acao: 'suporte_responder', grupo_id: msg.grupo_id,
    detalhe: { suporte_id: id, destino: msg.de_email, resend_id: env.id },
  })

  return json({ ok: true, id: env.id })
})
