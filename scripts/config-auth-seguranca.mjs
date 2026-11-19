#!/usr/bin/env node
// Segurança do login do HopeFin (L39/L40, 19/11/2026), na configuração do Supabase Auth:
//   • senha mínima de 8 caracteres (o app confere o mesmo: src/lib/acesso.js);
//   • confirmação de e-mail no cadastro (mailer_autoconfirm = false). O app mostra "Confirme seu
//     e-mail" com botão de reenviar (Cadastro e Login). O e-mail sai pelo SMTP do Resend com o
//     modelo em português (scripts/config-auth-email.mjs);
//   • bloqueio de senha vazada (password_hibp_enabled), se o plano do Supabase permitir.
//
//   node scripts/config-auth-seguranca.mjs                   # aplica
//   node scripts/config-auth-seguranca.mjs --sem-confirmacao  # volta o cadastro sem confirmar e-mail
//
// Lê SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF de supabase/.env.local. Não imprime segredos.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
const p = join(root, 'supabase', '.env.local')
if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN, REF = env.SUPABASE_PROJECT_REF
if (!TOKEN || !REF) { console.error('✖ Faltam SUPABASE_ACCESS_TOKEN/SUPABASE_PROJECT_REF'); process.exit(1) }
const URL = `https://api.supabase.com/v1/projects/${REF}/config/auth`
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function patch(corpo) {
  const r = await fetch(URL, { method: 'PATCH', headers: H, body: JSON.stringify(corpo) })
  return { ok: r.ok, status: r.status, texto: r.ok ? '' : (await r.text()).slice(0, 300) }
}

const semConfirmacao = process.argv.includes('--sem-confirmacao')
const base = await patch({ password_min_length: 8, mailer_autoconfirm: semConfirmacao })
if (!base.ok) { console.error('✖ não aplicou senha/confirmação:', base.status, base.texto); process.exit(1) }

const hibp = await patch({ password_hibp_enabled: true })
if (!hibp.ok) console.log(`• bloqueio de senha vazada: não disponível neste plano (HTTP ${hibp.status})`)

const c = await (await fetch(URL, { headers: H })).json()
console.log(`✔ senha mínima: ${c.password_min_length} | confirmar e-mail no cadastro: ${c.mailer_autoconfirm ? 'NÃO' : 'SIM'} | senha vazada: ${c.password_hibp_enabled ? 'bloqueada' : 'não bloqueada'}`)
