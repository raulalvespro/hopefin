#!/usr/bin/env node
// Define os segredos da Edge Function no Supabase (Management API).
// Lê VAPID_* de supabase/.env.local, gera CRON_SECRET se faltar (e grava lá),
// e envia tudo. Não imprime valores sensíveis.
//
//   node scripts/set-secrets.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, 'supabase', '.env.local')

function loadEnvLocal() {
  const env = {}
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return env
}

const env = loadEnvLocal()
const TOKEN = env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN
const REF = env.SUPABASE_PROJECT_REF || process.env.SUPABASE_PROJECT_REF
if (!TOKEN || !REF) { console.error('✖ Faltam SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF.'); process.exit(1) }
if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
  console.error('✖ Faltam VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (rode scripts/gen-vapid.mjs).'); process.exit(1)
}

// Gera CRON_SECRET se ainda não existir e persiste no .env.local
let cron = env.CRON_SECRET
if (!cron) {
  cron = randomBytes(24).toString('hex')
  let txt = existsSync(envPath) ? readFileSync(envPath, 'utf8').replace(/\n+$/, '') : ''
  if (txt && !txt.endsWith('\n')) txt += '\n'
  txt += `CRON_SECRET=${cron}\n`
  writeFileSync(envPath, txt)
  console.log('• CRON_SECRET gerado e gravado em supabase/.env.local')
}

const secrets = [
  { name: 'VAPID_PUBLIC_KEY', value: env.VAPID_PUBLIC_KEY },
  { name: 'VAPID_PRIVATE_KEY', value: env.VAPID_PRIVATE_KEY },
  { name: 'VAPID_SUBJECT', value: env.VAPID_SUBJECT || 'mailto:raullerickson@gmail.com' },
  { name: 'CRON_SECRET', value: cron },
]

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(secrets),
})
if (!res.ok) { console.error(`✖ Falha ao definir segredos (HTTP ${res.status}):\n${await res.text()}`); process.exit(1) }
console.log(`✔ Segredos definidos: ${secrets.map(s => s.name).join(', ')}`)
