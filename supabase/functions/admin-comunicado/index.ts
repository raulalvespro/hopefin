// admin-comunicado — o dono manda um comunicado pelo painel (A8.15, 21/11/2026).
// Exige admin + sessão com o código do celular (aal2), como as outras funções do painel.
//
// Corpo (JSON):
//   { acao: 'teste' | 'enviar', titulo, texto, botao_texto?, botao_rota?, publico, inativos_dias?,
//     grupo_id?, canais: ['app' | 'push' | 'email', ...] }
//   teste  → só quem está mandando recebe (card no app, notificação e e-mail com [Teste]).
//   enviar → todo mundo do público (comunicado_destinatarios). E-mail só pra quem não pediu pra sair.
// Grava em comunicados + comunicado_entregas (o card do app e o histórico de vistos/cliques).
// Segredos: RESEND_API_KEY, VAPID_*, CRON_SECRET (assinatura do descadastro).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { nivelDaSessao } from '../_shared/sessao.ts'
import { enviarEmail, layoutEmail, esc } from '../_shared/email.ts'
import { pushParaGrupo } from '../_shared/push.ts'
import { linkDescadastro } from '../_shared/descadastro.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
const APP = 'https://app.hopefin.com.br'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const PUBLICOS = ['todos', 'assinantes', 'teste', 'cortesia', 'inativos', 'grupo']
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms))
const paraHtml = (s: string) => esc(s).replace(/\n/g, '<br>')

type Dest = { usuario_id: string; grupo_id: string; nome: string | null; email: string | null; recebe_email: boolean }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)

  // 1) Quem está mandando: admin com o código do celular.
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const sb = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } })
  const { data: userData } = await sb.auth.getUser()
  if (!userData?.user) return json({ erro: 'não autenticado' }, 401)
  const uid = userData.user.id
  const { data: me } = await admin.from('usuarios').select('is_admin, grupo_id, nome, recebe_comunicados').eq('id', uid).maybeSingle()
  if (!me?.is_admin) return json({ erro: 'não autorizado' }, 403)
  if (nivelDaSessao(jwt) !== 'aal2') return json({ erro: 'confirme o código do celular no painel' }, 403)

  // 2) Conteúdo.
  const b = await req.json().catch(() => ({}))
  const acao = b?.acao === 'enviar' ? 'enviar' : 'teste'
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

  // 3) Quem recebe.
  let dest: Dest[] = []
  if (acao === 'teste') {
    dest = [{ usuario_id: uid, grupo_id: me.grupo_id, nome: me.nome, email: userData.user.email || null, recebe_email: true }]
  } else {
    const { data, error } = await admin.rpc('comunicado_destinatarios', { p_publico: publico, p_dias: dias, p_grupo: grupoId })
    if (error) return json({ erro: error.message }, 500)
    dest = (data || []) as Dest[]
  }
  if (!dest.length) return json({ erro: 'Ninguém nesse público agora.' }, 400)

  const { data: com, error: errCom } = await admin.from('comunicados').insert({
    titulo, texto, botao_texto: botaoTexto, botao_rota: botaoRota, publico, inativos_dias: dias, grupo_id: grupoId,
    canais, teste: acao === 'teste', criado_por: uid, enviado_em: new Date().toISOString(), destinatarios: dest.length,
  }).select('id').single()
  if (errCom || !com) return json({ erro: errCom?.message || 'falhou ao gravar' }, 500)

  // 4) Card no app (entregas) — também serve de histórico de vistos/cliques.
  const { error: errEnt } = await admin.from('comunicado_entregas').insert(
    dest.map(d => ({ comunicado_id: com.id, usuario_id: d.usuario_id, no_app: canais.includes('app') })))
  if (errEnt) console.error('entregas', errEnt.message)

  const tag = acao === 'teste' ? '[Teste] ' : ''
  let push = 0
  let emails = 0
  const erros: string[] = []

  // 5) Notificação no celular (só os aparelhos de cada pessoa).
  if (canais.includes('push')) {
    for (const d of dest) {
      try {
        const r = await pushParaGrupo(admin, d.grupo_id, { title: `${tag}${titulo}`, body: texto.slice(0, 140), url: botaoRota || '/', tag: `comunicado-${com.id}` }, d.usuario_id)
        push += r.enviados || 0
      } catch (e) { erros.push(`push: ${(e as Error).message}`) }
    }
  }

  // 6) E-mail (com o "não quero receber"). Devagar pra respeitar o limite do Resend.
  if (canais.includes('email')) {
    for (const d of dest) {
      if (!d.email || !d.recebe_email) continue
      const primeiro = String(d.nome || '').trim().split(/\s+/)[0]
      const sair = await linkDescadastro(d.usuario_id)
      const html = layoutEmail({
        titulo: `${tag}${titulo}`,
        corpoHtml: `${primeiro ? `<p>Oi, ${esc(primeiro)}!</p>` : ''}<p>${paraHtml(texto)}</p>`,
        preheader: texto.slice(0, 100),
        cta: botaoTexto ? { texto: botaoTexto, url: `${APP}${botaoRota || '/'}` } : undefined,
        rodapeExtra: `Não quer receber novidades do HopeFin por e-mail? <a href="${esc(sair)}" style="color:#64748b;">Clique aqui</a>.`,
      })
      const r = await enviarEmail({ para: d.email, assunto: `${tag}${titulo}`, html })
      if (r.ok) emails++
      else erros.push(`e-mail: ${r.erro || 'erro'}`)
      await pausa(550)
    }
  }

  await admin.from('comunicados').update({ enviados_push: push, enviados_email: emails }).eq('id', com.id)
  await admin.from('admin_log').insert({ admin_id: uid, acao: acao === 'teste' ? 'comunicado_teste' : 'comunicado_enviar',
    detalhe: { comunicado_id: com.id, publico, canais, destinatarios: dest.length, push, emails } })
  return json({ ok: true, id: com.id, teste: acao === 'teste', destinatarios: dest.length, push, emails, erros: erros.slice(0, 5) })
})
