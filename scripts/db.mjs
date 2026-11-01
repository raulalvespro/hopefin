#!/usr/bin/env node
// Runner de SQL/DDL para o Supabase do HopeFin via Management API.
// Lê credenciais de supabase/.env.local (ou das variáveis de ambiente).
//
// Uso:
//   node scripts/db.mjs <arquivo.sql>          # roda um arquivo .sql
//   node scripts/db.mjs -e "select now()"      # roda SQL inline
//   node scripts/db.mjs --migrate              # roda todas as migrations em supabase/migrations
//
// Requer em supabase/.env.local:
//   SUPABASE_ACCESS_TOKEN=sbp_...     (Dashboard -> Account -> Access Tokens)
//   SUPABASE_PROJECT_REF=oapcjmkklzaodgpuwjsh
//
// O arquivo supabase/.env.local é gitignored — o token NUNCA vai pro repo.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnvLocal() {
  const p = join(root, 'supabase', '.env.local')
  if (existsSync(p)) {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}
loadEnvLocal()

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF
if (!TOKEN || !REF) {
  console.error('✖ Faltam SUPABASE_ACCESS_TOKEN e/ou SUPABASE_PROJECT_REF (em supabase/.env.local).')
  process.exit(1)
}

async function runSql(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`✖ ${label || 'SQL'} falhou (HTTP ${res.status}):\n${text}`)
    process.exit(1)
  }
  console.log(`✔ ${label || 'SQL'} ok`)
  const trimmed = text.trim()
  if (trimmed && trimmed !== '[]') console.log(trimmed.slice(0, 2000))
}

const args = process.argv.slice(2)

if (args[0] === '-e') {
  await runSql(args.slice(1).join(' '), 'inline')
} else if (args[0] === '--migrate') {
  const dir = join(root, 'supabase', 'migrations')
  const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.sql')).sort() : []
  if (!files.length) { console.log('Nenhuma migration em supabase/migrations.'); process.exit(0) }
  for (const f of files) {
    await runSql(readFileSync(join(dir, f), 'utf8'), `migration ${f}`)
  }
} else if (args[0]) {
  await runSql(readFileSync(resolve(args[0]), 'utf8'), args[0])
} else {
  console.error('Uso: node scripts/db.mjs <arquivo.sql> | -e "SQL" | --migrate')
  process.exit(1)
}
