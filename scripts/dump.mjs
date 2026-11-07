#!/usr/bin/env node
// Dump simples (JSON) de todas as tabelas do schema public, via Management API.
// Serve de backup ANTES de cada migração (plano Free do Supabase não tem backup
// automático). NÃO substitui um pg_dump completo — é um retrato das linhas.
//
//   node scripts/dump.mjs [rotulo]   # ex.: node scripts/dump.mjs pre_0023
//
// Grava em backups/dump_<rotulo>_<timestamp>.json. Lê credenciais de
// supabase/.env.local (SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const p = join(root, 'supabase', '.env.local')
if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF
if (!TOKEN || !REF) { console.error('✖ Faltam SUPABASE_ACCESS_TOKEN/PROJECT_REF'); process.exit(1) }

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t}`)
  return JSON.parse(t)
}

const rotulo = process.argv[2] || 'manual'
const tabs = await q(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`)
const tabelas = {}
for (const { table_name } of tabs) {
  const rows = await q(`select coalesce(json_agg(t), '[]'::json) as j from public."${table_name}" t`)
  tabelas[table_name] = rows[0].j
}
const dir = join(root, 'backups')
if (!existsSync(dir)) mkdirSync(dir)
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6})/, '$1_$2')
const file = join(dir, `dump_${rotulo}_${ts}.json`)
writeFileSync(file, JSON.stringify({ _meta: { em: new Date().toISOString(), ref: REF }, tabelas }, null, 2))
let total = 0
for (const k in tabelas) total += tabelas[k].length
console.log(`✔ Dump salvo: ${file} (${Object.keys(tabelas).length} tabelas, ${total} linhas)`)
