// fim-de-trial — avisa o titular quando o teste grátis está acabando (prompt 7,
// etapa 2). Chamada pelo cron diário (hopefin-fim-de-trial). NÃO é chamada por
// usuário: exige header x-cron-secret == CRON_SECRET (deploy --no-verify-jwt).
//
// Cadência (fuso America/Sao_Paulo): dois toques por trial —
//   D-2 (faltam 2 dias) -> tipo 'fim_trial_2d'
//   D0  (termina hoje)   -> tipo 'fim_trial_0d'
//
// Idempotência: grava em public.email_log com índice único (grupo_id, tipo, ref),
// onde ref = data do fim do trial (BRT). Assim cada aviso sai uma vez por trial.
// Em falha de envio, apaga a linha do log para permitir nova tentativa no dia
// seguinte. Reutiliza o módulo _shared/email.ts (layout no design da marca).
//
// Corpo opcional (JSON): { so_grupo?: uuid }  // restringe a um grupo (teste/reenvio)
// Segredos: CRON_SECRET; SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { layoutEmail, enviarEmail, esc } from '../_shared/email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cron-secret, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Data YYYY-MM-DD no fuso de São Paulo.
function dataBRT(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}
function diffDias(fim: string, hoje: string): number {
  const [ay, am, ad] = fim.split('-').map(Number)
  const [by, bm, bd] = hoje.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

function conteudo(tipo: string, nome?: string | null) {
  const ola = nome ? `Oi, ${esc(String(nome).split(' ')[0])}! ` : 'Oi! '
  if (tipo === 'fim_trial_2d') return {
    assunto: 'Seu teste do HopeFin termina em 2 dias',
    titulo: 'Faltam 2 dias de teste 💚',
    corpo: `${ola}Seu teste grátis do HopeFin termina em <strong>2 dias</strong>.<br><br>` +
      'Pra não perder o histórico da sua família e seguir com o <strong>planejado × praticado</strong>, ' +
      'os lançamentos por voz e o painel compartilhado, é só escolher um plano — leva 2 minutos.',
  }
  return {
    assunto: 'Seu teste do HopeFin termina hoje',
    titulo: 'Seu teste termina hoje',
    corpo: `${ola}Hoje é o <strong>último dia</strong> do seu teste grátis do HopeFin.<br><br>` +
      'Assinando agora você mantém tudo do jeitinho que está — nada se perde — e continua com o ' +
      'controle das contas da família no mesmo lugar.',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ erro: 'não autorizado' }, 401)
  }

  const body = await req.json().catch(() => ({}))
  const soGrupo = typeof body?.so_grupo === 'string' ? body.so_grupo : null

  let qb = admin.from('subscriptions')
    .select('grupo_id, titular_id, trial_ends_at')
    .eq('status', 'trial')
    .not('trial_ends_at', 'is', null)
  if (soGrupo) qb = qb.eq('grupo_id', soGrupo)
  const { data: trials, error } = await qb
  if (error) return json({ erro: error.message }, 500)

  const hoje = dataBRT(new Date())
  const out = { verificados: trials?.length || 0, enviados: 0, pulados: 0, erros: 0, detalhes: [] as unknown[] }

  for (const t of trials || []) {
    const fim = dataBRT(new Date(t.trial_ends_at as string))
    const d = diffDias(fim, hoje)
    const tipo = d === 2 ? 'fim_trial_2d' : d === 0 ? 'fim_trial_0d' : null
    if (!tipo) continue
    const ref = fim

    const { data: u } = await admin.from('usuarios').select('email, nome').eq('id', t.titular_id).maybeSingle()
    if (!u?.email) { out.erros++; out.detalhes.push({ grupo: t.grupo_id, tipo, erro: 'sem e-mail do titular' }); continue }

    const c = conteudo(tipo, u.nome)
    // idempotência: insere primeiro; conflito (23505) = já enviado -> pula.
    const ins = await admin.from('email_log')
      .insert({ grupo_id: t.grupo_id, titular_id: t.titular_id, tipo, ref, destino: u.email, assunto: c.assunto, status: 'enviando' })
      .select('id').maybeSingle()
    if (ins.error) {
      if ((ins.error as { code?: string }).code === '23505') { out.pulados++; continue }
      out.erros++; out.detalhes.push({ grupo: t.grupo_id, tipo, erro: ins.error.message }); continue
    }

    const html = layoutEmail({
      titulo: c.titulo, corpoHtml: c.corpo, preheader: c.assunto,
      cta: { texto: 'Assinar o HopeFin', url: 'https://app.hopefin.com.br/planos' },
    })
    const env = await enviarEmail({ para: u.email, assunto: c.assunto, html })
    if (env.ok) {
      await admin.from('email_log').update({ status: 'enviado', resend_id: env.id }).eq('id', ins.data!.id)
      out.enviados++; out.detalhes.push({ grupo: t.grupo_id, tipo, para: u.email, id: env.id })
    } else {
      // apaga pra permitir nova tentativa amanhã
      await admin.from('email_log').delete().eq('id', ins.data!.id)
      out.erros++; out.detalhes.push({ grupo: t.grupo_id, tipo, erro: env.erro })
    }
  }

  return json(out)
})
