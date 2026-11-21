// comunicados-agendados — manda os comunicados agendados que chegaram na hora (A8.15, 21/11/2026).
// Chamada pelo cron hopefin-comunicados-agendados (a cada 5 min, só quando há algum vencido — ver
// scripts/setup-cron.mjs). Exige x-cron-secret (deploy --no-verify-jwt).
// "Pega" cada comunicado marcando enviado_em ANTES de entregar (dois disparos não mandam em dobro) e
// calcula o público NA HORA (quem entrou depois de agendar também recebe).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { entregarComunicado, type Dest } from '../_shared/comunicado.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ erro: 'não autorizado' }, 401)

  const agora = new Date().toISOString()
  const { data: vencidos, error } = await admin.from('comunicados')
    .update({ enviado_em: agora })
    .lte('agendado_para', agora).is('enviado_em', null).is('cancelado_em', null)
    .select('id, titulo, texto, botao_texto, botao_rota, publico, inativos_dias, grupo_id, canais, criado_por')
  if (error) return json({ erro: error.message }, 500)

  const saida = []
  for (const c of vencidos || []) {
    const { data, error: e } = await admin.rpc('comunicado_destinatarios', { p_publico: c.publico, p_dias: c.inativos_dias, p_grupo: c.grupo_id })
    if (e) { saida.push({ id: c.id, erro: e.message }); continue }
    const dest = (data || []) as Dest[]
    const r = dest.length ? await entregarComunicado(admin, { ...c, teste: false }, dest) : { destinatarios: 0, push: 0, emails: 0, erros: [] }
    await admin.from('admin_log').insert({ admin_id: c.criado_por, acao: 'comunicado_agendado_enviado',
      detalhe: { comunicado_id: c.id, destinatarios: r.destinatarios, push: r.push, emails: r.emails } })
    saida.push({ id: c.id, ...r })
  }
  return json({ ok: true, enviados: saida })
})
