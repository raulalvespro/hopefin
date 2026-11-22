// admin-email — prévia e "Enviar teste pra mim" dos E-mails automáticos no Painel (22/11/2026).
// Exige admin + sessão com o código do celular (aal2), como as outras funções do painel.
//
// Corpo (JSON):
//   { acao: 'previa' | 'teste', chave, modelo?: { assunto, titulo, preheader, corpo, botao_texto, botao_link } }
//   `modelo` = o que está na tela (mesmo sem salvar); campos que faltarem vêm do banco.
//   previa → devolve { assunto, html, remetente } com dados de exemplo (nada é enviado nem gravado).
//   teste  → manda pra quem está no painel, com [Teste] no assunto, pelo mesmo remetente do e-mail de verdade.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { nivelDaSessao } from '../_shared/sessao.ts'
import { enviarEmail, REMETENTE } from '../_shared/email.ts'
import { lerModelo, montarModelo, remetenteCampanha, type Modelo } from '../_shared/modelos.ts'
import { varsExemplo, ehCampanha } from '../_shared/modelo.js'
import { oferta } from '../fim-de-trial/regua.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const CAMPOS = ['assunto', 'titulo', 'preheader', 'corpo', 'botao_texto', 'botao_link'] as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const sb = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } })
  const { data: userData } = await sb.auth.getUser()
  if (!userData?.user) return json({ erro: 'não autenticado' }, 401)
  const uid = userData.user.id
  const { data: me } = await admin.from('usuarios').select('is_admin, nome').eq('id', uid).maybeSingle()
  if (!me?.is_admin) return json({ erro: 'não autorizado' }, 403)
  if (nivelDaSessao(jwt) !== 'aal2') return json({ erro: 'confirme o código do celular no painel' }, 403)

  const b = await req.json().catch(() => ({}))
  const acao = b?.acao === 'teste' ? 'teste' : 'previa'
  const chave = String(b?.chave || '')
  const base = await lerModelo(admin, chave)
  if (!base) return json({ erro: 'e-mail não encontrado' }, 404)
  if (!base.editavel) return json({ erro: 'esse aviso não tem texto editável' }, 400)

  const modelo: Modelo = { ...base }
  const tela = b?.modelo && typeof b.modelo === 'object' ? b.modelo : {}
  for (const k of CAMPOS) if (k in tela) (modelo as Record<string, unknown>)[k] = tela[k] == null ? null : String(tela[k]).slice(0, 5000)
  if (!modelo.assunto || !modelo.corpo) return json({ erro: 'Escreva o assunto e o texto.' }, 400)

  const { data: precos } = await admin.rpc('planos_publicos')
  const vars = varsExemplo(chave, { nome: me.nome || 'Ana Souza', oferta: oferta(precos) || null })
  const campanha = ehCampanha(modelo)
  const rem = campanha ? await remetenteCampanha(admin) : { de: REMETENTE, responderPara: 'contato@hopefin.com.br' }
  const montado = await montarModelo(modelo, vars, { usuarioId: campanha ? uid : null, teste: acao === 'teste' })

  if (acao === 'previa') return json({ ok: true, assunto: montado.assunto, html: montado.html, remetente: rem.de })

  const email = userData.user.email
  if (!email) return json({ erro: 'sua conta está sem e-mail' }, 400)
  const env = await enviarEmail({ para: email, assunto: montado.assunto, html: montado.html, de: rem.de, responderPara: rem.responderPara })
  await admin.from('admin_log').insert({ admin_id: uid, acao: 'email_modelo_teste', detalhe: { chave, ok: env.ok, erro: env.erro || null } })
  if (!env.ok) return json({ erro: env.erro || 'falha no envio' }, 502)
  return json({ ok: true, para: email })
})
