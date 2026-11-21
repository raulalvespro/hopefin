// fim-de-trial — avisa o titular quando o teste grátis está acabando (prompt 7,
// etapa 2; régua nova = A6.2, 20/11/2026). Chamada pelo cron diário (hopefin-fim-de-trial).
// NÃO é chamada por usuário: exige header x-cron-secret == CRON_SECRET (deploy --no-verify-jwt).
//
// Régua (fuso America/Sao_Paulo) — ver regua.js:
//   HOJE (no ar):  2 dias antes ('fim_trial_2d') e no último dia ('fim_trial_0d').
//   NOVA (só com admin_config.regua_fim_teste_nova = true, migração 0079 — espera o ok do Raul
//   nos textos): 3 dias antes ('fim_trial_3d'), último dia ('fim_trial_0d') e 1 dia depois
//   ('fim_trial_d1', "sentimos sua falta").
//
// Idempotência: grava em public.email_log com índice único (grupo_id, tipo, ref),
// onde ref = data do fim do trial (BRT). Assim cada aviso sai uma vez por trial.
// Em falha de envio, apaga a linha do log para permitir nova tentativa no dia
// seguinte. Reutiliza o módulo _shared/email.ts (layout no design da marca).
//
// Corpo opcional (JSON):
//   { so_grupo?: uuid }                          // restringe a um grupo (teste/reenvio)
// Cada e-mail enviado leva junto uma notificação nos celulares do grupo (pushRegua, 21/11/2026).
//   { acao: 'previa', nome?: string, fim?: 'YYYY-MM-DD' }
//      -> devolve o HTML dos e-mails das duas réguas, SEM enviar nada e SEM gravar no
//         email_log nem encerrar teste/assinatura (pro Raul aprovar os textos).
// Segredos: CRON_SECRET; SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { layoutEmail, enviarEmail } from '../_shared/email.ts'
import { tipoDoDia, recebe, conteudoRegua, conteudoAntigo0d, pushRegua } from './regua.js'
import { pushParaGrupo } from '../_shared/push.ts'

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

// Texto do e-mail: a régua nova (com preços do banco) ou a de hoje.
function conteudo(tipo: string, nova: boolean, nome: string | null | undefined, fim: string, precos: unknown) {
  if (tipo === 'fim_trial_0d' && !nova) return conteudoAntigo0d(nome)
  return conteudoRegua(tipo, { nome, fim, precos })
}

function montar(c: { titulo: string, corpo: string, preheader?: string, assunto: string, cta?: { texto: string, url: string } }) {
  return layoutEmail({ titulo: c.titulo, corpoHtml: c.corpo, preheader: c.preheader || c.assunto, cta: c.cta })
}

async function precosPublicos() {
  const { data } = await admin.rpc('planos_publicos')
  return data || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ erro: 'não autorizado' }, 401)
  }

  const body = await req.json().catch(() => ({}))

  // Prévia: só monta os e-mails (nada é enviado nem gravado).
  if (body?.acao === 'previa') {
    const precos = await precosPublicos()
    const nome = typeof body.nome === 'string' ? body.nome : 'Ana Souza'
    const fim = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fim || '')) ? body.fim : dataBRT(new Date(Date.now() + 3 * 86400000))
    const emails = [
      ...['fim_trial_3d', 'fim_trial_0d', 'fim_trial_d1'].map((tipo) => ({ regua: 'nova', tipo, ...conteudo(tipo, true, nome, fim, precos) })),
      ...['fim_trial_2d', 'fim_trial_0d'].map((tipo) => ({ regua: 'hoje', tipo, ...conteudo(tipo, false, nome, fim, precos) })),
    ].map((e) => ({ regua: e.regua, tipo: e.tipo, assunto: e.assunto, preheader: e.preheader, html: montar(e) }))
    const { data: cfg } = await admin.from('admin_config').select('regua_fim_teste_nova').eq('id', 1).maybeSingle()
    return json({ ok: true, regua_nova_ligada: !!cfg?.regua_fim_teste_nova, emails })
  }

  // Aproveita o cron diário para encerrar assinaturas canceladas que chegaram ao fim do período.
  try { await admin.rpc('encerrar_assinaturas_canceladas') } catch (_) { /* best-effort */ }
  // ...e marcar 'expired' os trials já vencidos que nunca viraram pagantes (migração 0053).
  try { await admin.rpc('encerrar_trials_vencidos') } catch (_) { /* best-effort */ }

  const soGrupo = typeof body?.so_grupo === 'string' ? body.so_grupo : null
  const { data: cfg } = await admin.from('admin_config').select('regua_fim_teste_nova').eq('id', 1).maybeSingle()
  const nova = !!cfg?.regua_fim_teste_nova

  // Régua de hoje: só quem está em teste. Régua nova: também o teste que acabou ontem ("expired").
  let qb = admin.from('subscriptions')
    .select('grupo_id, titular_id, trial_ends_at, status, is_cortesia')
    .in('status', nova ? ['trial', 'expired'] : ['trial'])
    .not('trial_ends_at', 'is', null)
  if (soGrupo) qb = qb.eq('grupo_id', soGrupo)
  const { data: trials, error } = await qb
  if (error) return json({ erro: error.message }, 500)

  const hoje = dataBRT(new Date())
  const precos = nova ? await precosPublicos() : null
  const out = { regua: nova ? 'nova' : 'hoje', verificados: trials?.length || 0, enviados: 0, pulados: 0, erros: 0, detalhes: [] as unknown[] }

  for (const t of trials || []) {
    const fim = dataBRT(new Date(t.trial_ends_at as string))
    const tipo = tipoDoDia(diffDias(fim, hoje), nova)
    if (!tipo || !recebe(t, tipo)) continue
    const ref = fim

    const { data: u } = await admin.from('usuarios').select('email, nome').eq('id', t.titular_id).maybeSingle()
    if (!u?.email) { out.erros++; out.detalhes.push({ grupo: t.grupo_id, tipo, erro: 'sem e-mail do titular' }); continue }

    const c = conteudo(tipo, nova, u.nome, fim, precos)
    if (!c) continue
    // idempotência: insere primeiro; conflito (23505) = já enviado -> pula.
    const ins = await admin.from('email_log')
      .insert({ grupo_id: t.grupo_id, titular_id: t.titular_id, tipo, ref, destino: u.email, assunto: c.assunto, status: 'enviando' })
      .select('id').maybeSingle()
    if (ins.error) {
      if ((ins.error as { code?: string }).code === '23505') { out.pulados++; continue }
      out.erros++; out.detalhes.push({ grupo: t.grupo_id, tipo, erro: ins.error.message }); continue
    }

    const env = await enviarEmail({ para: u.email, assunto: c.assunto, html: montar(c) })
    if (env.ok) {
      await admin.from('email_log').update({ status: 'enviado', resend_id: env.id }).eq('id', ins.data!.id)
      // Reforço no celular (A6.2): só depois do e-mail sair, então também sai uma vez por teste.
      let push = 0
      const p = pushRegua(tipo)
      if (p) {
        try { push = (await pushParaGrupo(admin, t.grupo_id as string, p)).enviados || 0 }
        catch (e) { console.error('push da régua falhou', (e as Error).message) }
      }
      out.enviados++; out.detalhes.push({ grupo: t.grupo_id, tipo, para: u.email, id: env.id, push })
    } else {
      // apaga pra permitir nova tentativa amanhã
      await admin.from('email_log').delete().eq('id', ins.data!.id)
      out.erros++; out.detalhes.push({ grupo: t.grupo_id, tipo, erro: env.erro })
    }
  }

  return json(out)
})
