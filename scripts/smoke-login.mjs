#!/usr/bin/env node
// Smoke test do LOGIN — rode DEPOIS DE TODA MIGRAÇÃO de schema (e antes de dar a tarefa por concluída):
//   node scripts/smoke-login.mjs        (ou: npm run smoke)
// Faz o mesmo que o app faz ao abrir: entra com a conta de teste e lê o perfil com o grupo
// (usuarios?select=*,grupos(*)). Também confere que criar_grupo() NÃO cria outro grupo para quem já tem um.
// Nasceu do incidente de 07/11/2026 (FK extra em grupos quebrou o login e o app criava grupos em laço).
// Credenciais: TESTE_EMAIL e TESTE_SENHA em supabase/.env.local (gitignored). Sai com código 1 se falhar.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const f of ['supabase/.env.local', '.env']) {
  const p = join(root, f)
  if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY
if (!URL || !ANON || !env.TESTE_EMAIL || !env.TESTE_SENHA) {
  console.error('✖ Faltam VITE_SUPABASE_URL/ANON_KEY (.env) e TESTE_EMAIL/TESTE_SENHA (supabase/.env.local).'); process.exit(1)
}
const falhar = msg => { console.error('✖ SMOKE FALHOU:', msg); process.exit(1) }

const login = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.TESTE_EMAIL, password: env.TESTE_SENHA }),
})
const sessao = await login.json()
if (!sessao.access_token) falhar('login da conta de teste: ' + JSON.stringify(sessao).slice(0, 200))
const H = { apikey: ANON, Authorization: `Bearer ${sessao.access_token}`, 'Content-Type': 'application/json' }

// 1) leitura do perfil com o grupo, igual ao AuthContext
const r = await fetch(`${URL}/rest/v1/usuarios?select=*,grupos!usuarios_grupo_id_fkey(*)&id=eq.${sessao.user.id}`, { headers: H })
const corpo = await r.json()
if (!r.ok) falhar(`leitura do perfil HTTP ${r.status}: ${JSON.stringify(corpo).slice(0, 300)}`)
if (!corpo[0]?.grupo_id || !corpo[0]?.grupos?.codigo) falhar('perfil sem grupo/código: ' + JSON.stringify(corpo).slice(0, 300))
// ...e SEM o hint (versões antigas do app usam grupos(*)): não pode ficar ambíguo
const r2 = await fetch(`${URL}/rest/v1/usuarios?select=id,grupos(*)&id=eq.${sessao.user.id}`, { headers: H })
if (!r2.ok) falhar(`embed grupos(*) sem hint HTTP ${r2.status} (relação ambígua?): ${(await r2.text()).slice(0, 200)}`)
console.log('✔ perfil + grupo carregam (com e sem hint)')

// 2) criar_grupo não pode criar outro grupo para quem já tem um
const c = await fetch(`${URL}/rest/v1/rpc/criar_grupo`, { method: 'POST', headers: H, body: JSON.stringify({ p_nome: 'SMOKE NAO DEVE CRIAR' }) })
const gid = await c.json()
if (!c.ok || gid !== corpo[0].grupo_id) falhar('criar_grupo criou/alterou o grupo de quem já tinha um: ' + JSON.stringify(gid))
console.log('✔ criar_grupo é idempotente')
// 3) alarme: grupos vazios recém-criados (sinal do bug que cria grupo em laço)
if (env.SUPABASE_ACCESS_TOKEN && env.SUPABASE_PROJECT_REF) {
  const q = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: "select count(*)::int as n from grupos g where g.criado_em > now() - interval '24 hours' and not exists (select 1 from usuarios u where u.grupo_id = g.id)" }) })
  const n = (await q.json())?.[0]?.n
  if (n > 3) console.warn(`⚠ ${n} grupos VAZIOS criados nas últimas 24h — investigar (possível laço de criar_grupo).`)
  else console.log(`✔ grupos vazios nas últimas 24h: ${n}`)

  // 4) trava das funções (migrações 0063/0064, 19/11/2026): função com poder especial (SECURITY
  //    DEFINER) aberta à chave pública só as de propósito, e as do servidor fechadas pra quem está
  //    logado. Função nova pro app precisa de "grant execute ... to authenticated" (e anon só se for
  //    usada antes do login — aí entra na lista ABERTAS_DE_PROPOSITO).
  const ABERTAS_DE_PROPOSITO = ['config_mascote', 'grupo_pode_lancar', 'meu_grupo_id', 'planos_publicos', 'sou_admin']
  const SO_SERVIDOR = ['wa_salvar_lancamento', 'wa_usuario', 'wa_conectar', 'wa_pode_grupo', 'pode_lancar_grupo',
    'vencimento_fatura_por_dias', 'vencimento_da_fatura_da_compra', 'resumo_mensal', 'vencimentos_a_vencer',
    'encerrar_trials_vencidos', 'encerrar_assinaturas_canceladas', 'garantir_series_grupo', 'push_pendencias',
    'wa_ultimo_lancamento', 'wa_apagar_ultimo', 'wa_corrigir_ultimo', 'wa_pagar_fatura', 'wa_registrar_ia_chamada']
  const t = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: "select p.proname, p.prosecdef as especial, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as logado from pg_proc p where p.pronamespace = 'public'::regnamespace" }) })
  if (!t.ok) falhar(`trava das funções: leitura HTTP ${t.status}`)
  const fns = await t.json()
  const abertas = fns.filter(f => f.especial && f.anon && !ABERTAS_DE_PROPOSITO.includes(f.proname)).map(f => f.proname)
  if (abertas.length) falhar('função com poder especial aberta à chave pública (revoke ... from public, anon): ' + abertas.join(', '))
  const doServidor = fns.filter(f => f.logado && SO_SERVIDOR.includes(f.proname)).map(f => f.proname)
  if (doServidor.length) falhar('função só do servidor aberta pra quem está logado (revoke ... from authenticated): ' + doServidor.join(', '))
  console.log(`✔ trava das funções: só as ${ABERTAS_DE_PROPOSITO.length} de propósito abertas à chave pública`)

  // 5) proteções que não podem sumir num "create or replace" futuro (0065/0066, 19/11/2026):
  //    painel só com o código do celular (aal2) e convite com trava contra chute + limite de pessoas.
  const p = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: "select proname, prosrc from pg_proc where pronamespace = 'public'::regnamespace and proname in ('sou_admin', 'sou_dono_app', 'entrar_no_grupo')" }) })
  if (!p.ok) falhar(`proteções: leitura HTTP ${p.status}`)
  const src = Object.fromEntries((await p.json()).map(f => [f.proname, f.prosrc]))
  for (const f of ['sou_admin', 'sou_dono_app']) if (!String(src[f]).includes('aal2')) falhar(`${f}() deixou de exigir o código do celular (aal2)`)
  if (!/muitas_tentativas/.test(src.entrar_no_grupo) || !/grupo_cheio/.test(src.entrar_no_grupo)) falhar('entrar_no_grupo() perdeu a trava de tentativas ou o limite de pessoas')
  console.log('✔ painel só com o código do celular; convite com trava e limite')

  // 6) trava do plano (A6.3, 19/11/2026): pra cada situação da assinatura (teste vencido, cancelada,
  //    pendente, cortesia...), CADA pessoa do grupo de teste é barrada ou liberada certinho ao lançar
  //    (gastos, entradas, parcelamentos, transferências), no app/voz e no WhatsApp, e continua lendo.
  //    Roda numa transação desfeita no fim (scripts/teste-trava-plano.sql): nada fica gravado.
  if (!/^[0-9a-f-]{36}$/i.test(sessao.user.id)) falhar('id da conta de teste inválido')
  const sqlTrava = readFileSync(join(root, 'scripts', 'teste-trava-plano.sql'), 'utf8').replaceAll('__UID__', sessao.user.id)
  const tv = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sqlTrava }) })
  const tvTexto = await tv.text()
  let trava = null
  try {
    const msg = String(JSON.parse(tvTexto).message || '')
    const ini = msg.indexOf('RESULTADO ')
    if (ini >= 0) trava = JSON.parse(msg.slice(ini + 'RESULTADO '.length).split('\nCONTEXT')[0].trim())
  } catch { /* resposta fora do esperado: cai no falhar abaixo */ }
  if (!trava) falhar('trava do plano: resposta inesperada ' + tvTexto.slice(0, 300))
  if (trava.erro) falhar('trava do plano: ' + trava.erro)
  if (trava.falhas?.length) falhar('trava do plano:\n  - ' + trava.falhas.join('\n  - '))
  console.log(`✔ trava do plano: ${trava.casos} situações × ${trava.pessoas} pessoas do grupo (${trava.checagens} conferências) — barra e libera certo no app, voz e WhatsApp`)
}
console.log('✔ SMOKE OK')
