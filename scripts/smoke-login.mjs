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
}
console.log('✔ SMOKE OK')
