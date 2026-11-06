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

// Gera um segredo aleatório e persiste no .env.local (não sobrescreve existente).
function gerarEPersistir(nome, bytes = 24) {
  if (env[nome]) return env[nome]
  const valor = randomBytes(bytes).toString('hex')
  let txt = existsSync(envPath) ? readFileSync(envPath, 'utf8').replace(/\n+$/, '') : ''
  if (txt && !txt.endsWith('\n')) txt += '\n'
  txt += `${nome}=${valor}\n`
  writeFileSync(envPath, txt)
  env[nome] = valor
  console.log(`• ${nome} gerado e gravado em supabase/.env.local`)
  return valor
}

const cron = gerarEPersistir('CRON_SECRET')

const secrets = [
  { name: 'VAPID_PUBLIC_KEY', value: env.VAPID_PUBLIC_KEY },
  { name: 'VAPID_PRIVATE_KEY', value: env.VAPID_PRIVATE_KEY },
  { name: 'VAPID_SUBJECT', value: env.VAPID_SUBJECT || 'mailto:raullerickson@gmail.com' },
  { name: 'CRON_SECRET', value: cron },
]

// Asaas (billing): só entra se a API key estiver preenchida. O webhook token
// é gerado aqui (precisa ser o mesmo cadastrado no painel do Asaas).
if (env.ASAAS_API_KEY) {
  const webhookToken = gerarEPersistir('ASAAS_WEBHOOK_TOKEN')
  secrets.push({ name: 'ASAAS_API_KEY', value: env.ASAAS_API_KEY })
  secrets.push({ name: 'ASAAS_WEBHOOK_TOKEN', value: webhookToken })
  if (env.ASAAS_BASE_URL) secrets.push({ name: 'ASAAS_BASE_URL', value: env.ASAAS_BASE_URL })
}

// IA (lançamento por voz/texto — prompt 11) e e-mail (prompt 7): só entram se
// a chave estiver preenchida no .env.local.
if (env.ANTHROPIC_API_KEY) secrets.push({ name: 'ANTHROPIC_API_KEY', value: env.ANTHROPIC_API_KEY })
if (env.OPENAI_API_KEY)    secrets.push({ name: 'OPENAI_API_KEY', value: env.OPENAI_API_KEY })
if (env.RESEND_API_KEY)    secrets.push({ name: 'RESEND_API_KEY', value: env.RESEND_API_KEY })

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(secrets),
})
if (!res.ok) { console.error(`✖ Falha ao definir segredos (HTTP ${res.status}):\n${await res.text()}`); process.exit(1) }
console.log(`✔ Segredos definidos: ${secrets.map(s => s.name).join(', ')}`)
