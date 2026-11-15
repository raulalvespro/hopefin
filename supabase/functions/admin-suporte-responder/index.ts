// admin-suporte-responder — responde um e-mail da caixa de suporte, acionado pelo
// dono no painel. Envia a resposta pelo NOSSO Resend (avisos@, reply-to contato@),
// com o layout da marca, e marca o e-mail como respondido.
//
// Segurança: roda com verify-jwt. O JWT diz QUEM chamou; validamos is_admin com o
// service_role antes de enviar. Auditoria em admin_log.
// Segredos: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY. (SUPABASE_URL/ANON injetados.)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { layoutEmail, enviarEmail, esc } from '../_shared/email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

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

  const body = await req.json().catch(() => ({}))
  const id: string | undefined = body?.id
  const texto: string = (body?.texto || '').toString().trim()
  if (!id) return json({ erro: 'faltou id' }, 400)
  if (!texto) return json({ erro: 'faltou o texto da resposta' }, 400)

  // Carrega o e-mail original (service_role; já validamos que é admin).
  const { data: msg } = await admin
    .from('suporte_emails')
    .select('de_email, de_nome, assunto, grupo_id')
    .eq('id', id)
    .maybeSingle()
  if (!msg?.de_email) return json({ erro: 'e-mail não encontrado' }, 404)

  const nome = msg.de_nome ? esc(String(msg.de_nome).split(' ')[0]) : ''
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
