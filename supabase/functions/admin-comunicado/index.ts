// admin-comunicado — o dono manda (ou agenda) um comunicado pelo painel (A8.15, 21/11/2026).
// Exige admin + sessão com o código do celular (aal2), como as outras funções do painel.
//
// Corpo (JSON):
//   { acao: 'teste' | 'enviar' | 'agendar', titulo, texto, botao_texto?, botao_rota?, publico,
//     inativos_dias?, grupo_id?, canais: ['app' | 'push' | 'email', ...], agendado_para? (ISO) }
//   teste   → só quem está mandando recebe (card no app, notificação e e-mail com [Teste]).
//   enviar  → todo mundo do público agora (comunicado_destinatarios).
//   agendar → grava pra sair na data/hora (5 min a 60 dias); quem sai é a função comunicados-agendados,
//             que calcula o público NA HORA do envio.
// A entrega fica em _shared/comunicado.ts. Segredos: RESEND_API_KEY, VAPID_*, CRON_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { nivelDaSessao } from '../_shared/sessao.ts'
import { entregarComunicado, type Dest } from '../_shared/comunicado.ts'

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
const PUBLICOS = ['todos', 'assinantes', 'teste', 'cortesia', 'inativos', 'grupo']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)

  // 1) Quem está mandando: admin com o código do celular.
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const sb = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } })
  const { data: userData } = await sb.auth.getUser()
  if (!userData?.user) return json({ erro: 'não autenticado' }, 401)
  const uid = userData.user.id
  const { data: me } = await admin.from('usuarios').select('is_admin, grupo_id, nome').eq('id', uid).maybeSingle()
  if (!me?.is_admin) return json({ erro: 'não autorizado' }, 403)
  if (nivelDaSessao(jwt) !== 'aal2') return json({ erro: 'confirme o código do celular no painel' }, 403)

  // 2) Conteúdo.
  const b = await req.json().catch(() => ({}))
  const acao = ['enviar', 'agendar'].includes(b?.acao) ? b.acao : 'teste'
  const titulo = String(b?.titulo || '').trim().slice(0, 80)
  const texto = String(b?.texto || '').trim().slice(0, 600)
  const botaoTexto = String(b?.botao_texto || '').trim().slice(0, 30) || null
  const rota = String(b?.botao_rota || '').trim()
  const botaoRota = botaoTexto && /^\/[a-z0-9/?=&-]*$/.test(rota) ? rota : null
  const publico = PUBLICOS.includes(b?.publico) ? b.publico : null
  const dias = publico === 'inativos' ? Math.min(Math.max(parseInt(b?.inativos_dias) || 14, 1), 365) : null
  const grupoId = publico === 'grupo' && typeof b?.grupo_id === 'string' ? b.grupo_id : null
  const canais = (Array.isArray(b?.canais) ? b.canais : []).filter((c: string) => ['app', 'push', 'email'].includes(c))
  if (titulo.length < 3 || texto.length < 3) return json({ erro: 'Escreva o título e o texto.' }, 400)
  if (!publico) return json({ erro: 'Escolha o público.' }, 400)
  if (publico === 'grupo' && !grupoId) return json({ erro: 'Escolha o grupo.' }, 400)
  if (!canais.length) return json({ erro: 'Escolha pelo menos um canal.' }, 400)
  const base = { titulo, texto, botao_texto: botaoTexto, botao_rota: botaoRota, publico, inativos_dias: dias, grupo_id: grupoId, canais, criado_por: uid }

  // 3a) Agendar: só grava.
  if (acao === 'agendar') {
    const quando = new Date(String(b?.agendado_para || ''))
    const min = Date.now() + 4 * 60 * 1000
    const max = Date.now() + 60 * 86400000
    if (isNaN(quando.getTime()) || quando.getTime() < min || quando.getTime() > max) {
      return json({ erro: 'Escolha uma data e hora entre daqui a 5 minutos e 60 dias.' }, 400)
    }
    const { data: com, error } = await admin.from('comunicados').insert({ ...base, teste: false, agendado_para: quando.toISOString() }).select('id').single()
    if (error || !com) return json({ erro: error?.message || 'falhou ao gravar' }, 500)
    await admin.from('admin_log').insert({ admin_id: uid, acao: 'comunicado_agendar', detalhe: { comunicado_id: com.id, publico, canais, agendado_para: quando.toISOString() } })
    return json({ ok: true, id: com.id, agendado_para: quando.toISOString() })
  }

  // 3b) Teste ou enviar agora: quem recebe.
  let dest: Dest[] = []
  if (acao === 'teste') {
    dest = [{ usuario_id: uid, grupo_id: me.grupo_id, nome: me.nome, email: userData.user.email || null, recebe_email: true }]
  } else {
    const { data, error } = await admin.rpc('comunicado_destinatarios', { p_publico: publico, p_dias: dias, p_grupo: grupoId })
    if (error) return json({ erro: error.message }, 500)
    dest = (data || []) as Dest[]
  }
  if (!dest.length) return json({ erro: 'Ninguém nesse público agora.' }, 400)

  const { data: com, error: errCom } = await admin.from('comunicados')
    .insert({ ...base, teste: acao === 'teste', destinatarios: dest.length }).select('id').single()
  if (errCom || !com) return json({ erro: errCom?.message || 'falhou ao gravar' }, 500)

  const r = await entregarComunicado(admin, { id: com.id, titulo, texto, botao_texto: botaoTexto, botao_rota: botaoRota, canais, teste: acao === 'teste' }, dest)
  await admin.from('admin_log').insert({ admin_id: uid, acao: acao === 'teste' ? 'comunicado_teste' : 'comunicado_enviar',
    detalhe: { comunicado_id: com.id, publico, canais, destinatarios: r.destinatarios, push: r.push, emails: r.emails } })
  return json({ ok: true, id: com.id, teste: acao === 'teste', ...r })
})
