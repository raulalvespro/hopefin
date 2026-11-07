// remover-membro — o dono do grupo remove alguém (Configurações → Convidar para o grupo).
// Faz duas coisas: (1) chama a RPC remover_membro COM O JWT de quem pediu — é ela que
// confere as permissões (só o dono; não remove a si nem o titular da assinatura) — e
// (2) avisa a pessoa removida por e-mail (best-effort: falha de e-mail não desfaz a remoção).
//
// Corpo (JSON): { usuario_id: uuid }   Requer JWT de usuário.
// Resposta: { ok: true } | { erro: 'sem_permissao' | 'nao_pode_remover_a_si' | 'titular_da_assinatura' | ... }

import { createClient } from 'npm:@supabase/supabase-js@2'
import { layoutEmail, enviarEmail, esc } from '../_shared/email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: u } = await admin.auth.getUser(jwt)
  if (!u?.user) return json({ erro: 'não autenticado' }, 401)

  const body = await req.json().catch(() => ({}))
  const alvoId = String(body?.usuario_id || '')
  if (!alvoId) return json({ erro: 'faltou usuario_id' }, 400)

  // Dados antes de remover (depois a pessoa já não pertence ao grupo).
  const { data: quem } = await admin.from('usuarios').select('nome, grupo_id').eq('id', u.user.id).maybeSingle()
  const { data: alvo } = await admin.from('usuarios').select('nome, email, grupo_id').eq('id', alvoId).maybeSingle()
  const { data: grupo } = quem?.grupo_id
    ? await admin.from('grupos').select('nome').eq('id', quem.grupo_id).maybeSingle()
    : { data: null }

  // A RPC roda como o usuário que pediu (auth.uid() = dono) e aplica as regras.
  const comoUsuario = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { error } = await comoUsuario.rpc('remover_membro', { p_usuario_id: alvoId })
  if (error) {
    const m = (error.message || '').toLowerCase()
    const codigo = ['sem_permissao', 'nao_pode_remover_a_si', 'titular_da_assinatura', 'membro_nao_encontrado'].find(c => m.includes(c)) || 'erro'
    return json({ erro: codigo }, codigo === 'erro' ? 500 : 400)
  }

  // E-mail para quem saiu (best-effort).
  try {
    if (alvo?.email) {
      const assunto = `Você saiu do grupo ${grupo?.nome || 'no HopeFin'}`
      const ref = `${alvoId}:${Date.now()}`
      const ins = await admin.from('email_log')
        .insert({ grupo_id: quem?.grupo_id, titular_id: null, tipo: 'remocao_grupo', ref, destino: alvo.email, assunto, status: 'enviando' })
        .select('id').maybeSingle()
      if (!ins.error && ins.data) {
        const ola = alvo.nome ? `Olá, ${esc(alvo.nome.split(' ')[0])}!<br><br>` : ''
        const html = layoutEmail({
          titulo: 'Você foi removido(a) do grupo',
          preheader: assunto,
          corpoHtml: `${ola}${esc(quem?.nome || 'Quem criou o grupo')} removeu você do grupo <strong>${esc(grupo?.nome || '')}</strong> no HopeFin. ` +
            'Você não vê mais os gastos, contas e metas desse grupo; o que você lançou continua nele.<br><br>' +
            'Sua conta continua ativa: você pode criar um grupo novo ou entrar em outro com um convite. ' +
            'Se achar que foi engano, fale com quem criou o grupo.',
          cta: { texto: 'Abrir o HopeFin', url: 'https://app.hopefin.com.br' },
        })
        const env = await enviarEmail({ para: alvo.email, assunto, html })
        if (env.ok) await admin.from('email_log').update({ status: 'enviado', resend_id: env.id }).eq('id', ins.data.id)
        else await admin.from('email_log').update({ status: 'erro', erro: env.erro }).eq('id', ins.data.id)
      }
    }
  } catch (e) {
    console.error('[remover-membro] e-mail:', (e as Error)?.message)
  }

  return json({ ok: true })
})
