// comunicado-sair — "não quero receber novidades por e-mail" (A8.15, LGPD). Chamada pela página
// pública app.hopefin.com.br/sair-comunicados?u=<usuario>&t=<assinatura> (sem login): confere a
// assinatura (_shared/descadastro.ts) e marca usuarios.recebe_comunicados = false.
// Deploy com --no-verify-jwt (a pessoa pode não estar logada).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { assinarDescadastro } from '../_shared/descadastro.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  const body = await req.json().catch(() => ({}))
  const u = String(body?.u || '')
  const t = String(body?.t || '')
  if (!UUID.test(u) || !/^[0-9a-f]{32}$/.test(t)) return json({ erro: 'link_invalido' }, 400)
  if ((await assinarDescadastro(u)) !== t) return json({ erro: 'link_invalido' }, 400)
  const { error } = await admin.from('usuarios').update({ recebe_comunicados: false }).eq('id', u)
  if (error) return json({ erro: 'falhou' }, 500)
  return json({ ok: true })
})
