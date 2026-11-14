// admin-reenviar-email — reenvia o e-mail de ACESSO (magic link) ou de REDEFINIR SENHA
// (recovery) para um usuário, acionado pelo dono no painel /admin.
//
// Por que existe: o e-mail de acesso do Supabase Auth às vezes não chega (spam, atraso do
// provedor). O dono precisa de um botão pra reenviar sem depender de ninguém. Geramos o
// link com o service_role (generateLink) e disparamos pelo NOSSO Resend (deliverabilidade),
// com o layout da marca — em vez do template padrão do Supabase.
//
// Segurança: roda com verify-jwt. O JWT diz QUEM chamou; validamos is_admin com o
// service_role antes de qualquer ação. Auditoria em admin_log.
// Segredos: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY. (SUPABASE_URL/ANON injetados.)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { layoutEmail, enviarEmail, esc } from '../_shared/email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const APP_URL = 'https://app.hopefin.com.br'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const primeiroNome = (n?: string | null) => (n ? esc(String(n).split(' ')[0]) : '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)

  // Autentica pelo JWT do chamador.
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const sb = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
  const { data: userData } = await sb.auth.getUser()
  if (!userData?.user) return json({ erro: 'não autenticado' }, 401)
  const uid = userData.user.id

  // Só admin segue.
  const { data: me } = await admin.from('usuarios').select('is_admin').eq('id', uid).maybeSingle()
  if (!me?.is_admin) return json({ erro: 'não autorizado' }, 403)

  const body = await req.json().catch(() => ({}))
  const alvoId: string | undefined = body?.user_id
  // 'recuperar' -> recovery (criar/trocar senha); qualquer outro -> magiclink (entra direto).
  const tipo: 'recovery' | 'magiclink' = body?.tipo === 'recuperar' ? 'recovery' : 'magiclink'
  if (!alvoId) return json({ erro: 'faltou user_id' }, 400)

  // Dados do alvo (service_role; já validamos que quem chama é admin).
  const { data: alvo } = await admin.from('usuarios').select('nome, email, grupo_id').eq('id', alvoId).maybeSingle()
  if (!alvo?.email) return json({ erro: 'usuário sem e-mail' }, 404)

  // Gera o link de ação (magic link ou recovery) com redirect pro app.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: tipo,
    email: alvo.email,
    options: { redirectTo: APP_URL },
  })
  const link = (linkData as { properties?: { action_link?: string } } | null)?.properties?.action_link
  if (linkErr || !link) return json({ erro: linkErr?.message || 'falha ao gerar o link' }, 502)

  const nome = primeiroNome(alvo.nome)
  const ola = nome ? `Oi ${nome},` : 'Oi,'
  const ehRecuperar = tipo === 'recovery'
  const assunto = ehRecuperar ? 'Redefinir sua senha do HopeFin' : 'Seu acesso ao HopeFin'
  const corpoHtml = ehRecuperar
    ? `<p>${ola}</p><p>Recebemos um pedido para você redefinir a senha do HopeFin. É só clicar no botão abaixo para criar uma nova.</p><p>Se não foi você, pode ignorar este e-mail — nada muda.</p>`
    : `<p>${ola}</p><p>Aqui está o seu acesso ao HopeFin, o app de finanças da família. Clique no botão para entrar — você já fica logado.</p>`
  const html = layoutEmail({
    titulo: ehRecuperar ? 'Redefinir senha' : 'Entrar no HopeFin',
    corpoHtml,
    preheader: ehRecuperar ? 'Link para redefinir sua senha.' : 'Seu link de acesso ao HopeFin.',
    cta: { texto: ehRecuperar ? 'Redefinir senha' : 'Entrar no HopeFin', url: link },
  })

  const env = await enviarEmail({ para: alvo.email, assunto, html })
  if (!env.ok) return json({ erro: env.erro || 'falha no envio' }, 502)

  // Auditoria (não guarda o link; guarda só o destino e o id do Resend).
  await admin.from('admin_log').insert({
    admin_id: uid, acao: 'reenviar_email', grupo_id: alvo.grupo_id,
    detalhe: { alvo: alvoId, tipo, destino: alvo.email, resend_id: env.id },
  })

  return json({ ok: true, id: env.id })
})
