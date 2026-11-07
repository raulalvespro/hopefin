// enviar-email — endpoint genérico de envio (prompt 7, Etapa 1).
// Monta o layout da marca e envia via Resend. Usado para e-mails avulsos/teste
// e, depois, por gatilhos (ex.: "assinatura ativada" no webhook). Os crons de
// fim de trial / vencimentos / resumo reutilizam o mesmo módulo _shared/email.ts.
//
// Segurança: só quem sabe o CRON_SECRET chama (header x-cron-secret). Deploy com
// --no-verify-jwt (chamado por cron/servidor, não por JWT de usuário).
//
// Corpo (JSON): { para, assunto, titulo, corpo_html, cta?: {texto,url},
//                 preheader?, html? }  // html sobrepõe o layout, se vier pronto
// Resposta:     { ok, id? } | { erro }

import { layoutEmail, enviarEmail } from '../_shared/email.ts'

const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cron-secret, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ erro: 'não autorizado' }, 401)
  }

  const body = await req.json().catch(() => ({}))
  const para = body.para
  const assunto = String(body.assunto || '').trim()
  if (!para || !assunto) return json({ erro: 'faltam para/assunto' }, 400)

  const html = body.html || layoutEmail({
    titulo: String(body.titulo || assunto),
    corpoHtml: String(body.corpo_html || ''),
    preheader: body.preheader ? String(body.preheader) : undefined,
    cta: body.cta && body.cta.url ? { texto: String(body.cta.texto || 'Abrir'), url: String(body.cta.url) } : undefined,
  })

  const r = await enviarEmail({ para, assunto, html })
  return r.ok ? json({ ok: true, id: r.id }) : json({ erro: r.erro }, 502)
})
