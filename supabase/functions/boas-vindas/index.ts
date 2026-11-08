// boas-vindas — e-mails de acolhimento, disparados por evento do app (não por cron).
// Roda com o JWT do usuário (verify-jwt): o token diz QUEM está chamando; para ler
// dados de outras pessoas (o dono do grupo) e gravar em email_log (service-role-only)
// usamos um client service_role internamente, sempre validando o uid do token antes.
//
// Dois eventos:
//   { evento: 'cadastro' }        -> boas-vindas para o próprio usuário (quem chamou)
//   { evento: 'entrou_no_grupo' } -> avisa o DONO do grupo que um novo membro entrou
//
// Idempotência: email_log (índice único grupo_id, tipo, ref). Insere primeiro; se já
// existe (23505), pula. Em falha de envio, apaga a linha para permitir nova tentativa.
// Reaproveita _shared/email.ts (layout da marca). Segredos: SUPABASE_SERVICE_ROLE_KEY,
// RESEND_API_KEY. (SUPABASE_URL / SUPABASE_ANON_KEY são injetados.)

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

// Envia um e-mail garantindo 1 por (grupo, tipo, ref) via email_log. Best-effort.
async function enviarUnico(opts: {
  grupoId: string | null
  titularId: string | null
  tipo: string
  ref: string
  destino: string
  assunto: string
  html: string
}): Promise<{ status: 'enviado' | 'pulado' | 'erro'; id?: string; erro?: string }> {
  const ins = await admin.from('email_log')
    .insert({ grupo_id: opts.grupoId, titular_id: opts.titularId, tipo: opts.tipo, ref: opts.ref, destino: opts.destino, assunto: opts.assunto, status: 'enviando' })
    .select('id').maybeSingle()
  if (ins.error) {
    if ((ins.error as { code?: string }).code === '23505') return { status: 'pulado' }
    return { status: 'erro', erro: ins.error.message }
  }
  const env = await enviarEmail({ para: opts.destino, assunto: opts.assunto, html: opts.html })
  if (env.ok) {
    await admin.from('email_log').update({ status: 'enviado', resend_id: env.id }).eq('id', ins.data!.id)
    return { status: 'enviado', id: env.id }
  }
  await admin.from('email_log').delete().eq('id', ins.data!.id) // permite nova tentativa
  return { status: 'erro', erro: env.erro }
}

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

  const body = await req.json().catch(() => ({}))
  const evento = body?.evento

  // Dados de quem chamou (lidos com service role — já validamos o uid do token).
  const { data: eu } = await admin.from('usuarios').select('nome, email, grupo_id').eq('id', uid).maybeSingle()
  if (!eu) return json({ erro: 'perfil não encontrado' }, 404)
  if (!eu.grupo_id) return json({ ok: true, status: 'sem_grupo' }) // ainda sem grupo: nada a fazer

  // ---- BOAS-VINDAS ao próprio usuário ----
  if (evento === 'cadastro') {
    if (!eu.email) return json({ ok: true, status: 'sem_email' })
    const ola = primeiroNome(eu.nome)
    const corpo =
      `${ola ? `Oi, ${ola}! ` : 'Oi! '}Que bom ter você no HopeFin 💚<br><br>` +
      'Aqui as finanças da sua família ficam no <strong>mesmo lugar</strong>: dá pra lançar um ' +
      'gasto <strong>falando</strong>, acompanhar o <strong>planejado × praticado</strong> das contas do mês e ' +
      'ver pra onde o dinheiro está indo — tudo compartilhado com quem divide as contas com você.<br><br>' +
      'Pra começar, vale cadastrar sua <strong>renda</strong>, um <strong>cartão</strong> e uma <strong>conta fixa</strong>. ' +
      'Em poucos minutos o painel já fica com a sua cara.'
    const html = layoutEmail({
      titulo: 'Bem-vindo ao HopeFin',
      corpoHtml: corpo,
      preheader: 'Suas finanças da família, no mesmo lugar — comece em poucos minutos.',
      cta: { texto: 'Abrir o HopeFin', url: APP_URL },
    })
    const r = await enviarUnico({
      grupoId: eu.grupo_id, titularId: uid, tipo: 'boas_vindas', ref: uid,
      destino: eu.email, assunto: 'Bem-vindo ao HopeFin 💚', html,
    })
    return json({ ok: r.status !== 'erro', ...r })
  }

  // ---- AVISO ao dono: um novo membro entrou pelo convite ----
  if (evento === 'entrou_no_grupo') {
    const { data: g } = await admin.from('grupos').select('nome, criado_por').eq('id', eu.grupo_id).maybeSingle()
    if (!g?.criado_por) return json({ ok: true, status: 'sem_dono' })
    if (g.criado_por === uid) return json({ ok: true, status: 'proprio_dono' }) // o dono não se avisa

    const { data: dono } = await admin.from('usuarios').select('nome, email').eq('id', g.criado_por).maybeSingle()
    if (!dono?.email) return json({ ok: true, status: 'dono_sem_email' })

    const olaDono = primeiroNome(dono.nome)
    const quem = eu.nome ? esc(eu.nome) : 'Alguém'
    const corpo =
      `${olaDono ? `Oi, ${olaDono}! ` : 'Oi! '}<strong>${quem}</strong> acabou de entrar no seu grupo ` +
      `<strong>${esc(g.nome)}</strong> no HopeFin.<br><br>` +
      'Agora vocês dividem o mesmo painel: os lançamentos, as contas do mês e o resumo ficam juntos. ' +
      'Se não foi você quem convidou, é só responder este e-mail que a gente te ajuda.'
    const html = layoutEmail({
      titulo: 'Entrou gente nova no seu grupo',
      corpoHtml: corpo,
      preheader: `${quem} entrou no grupo ${esc(g.nome)}.`,
      cta: { texto: 'Abrir o HopeFin', url: APP_URL },
    })
    const r = await enviarUnico({
      grupoId: eu.grupo_id, titularId: g.criado_por, tipo: 'membro_entrou', ref: uid,
      destino: dono.email, assunto: `${quem} entrou no seu grupo no HopeFin`, html,
    })
    return json({ ok: r.status !== 'erro', ...r })
  }

  return json({ erro: 'evento inválido' }, 400)
})
