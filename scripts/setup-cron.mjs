#!/usr/bin/env node
// Agenda o digest diário de push via pg_cron + pg_net.
// Lê CRON_SECRET de supabase/.env.local e a anon key de .env ( nenhum segredo
// é commitado — eles só vão parar no cron.job do banco, que é server-side).
//
//   node scripts/setup-cron.mjs
//
// Horário: 08:00 America/Sao_Paulo = 11:00 UTC, todo dia.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readEnv(file) {
  const out = {}
  const p = join(root, file)
  if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const envLocal = readEnv('supabase/.env.local')
const envFront = readEnv('.env')
const TOKEN = envLocal.SUPABASE_ACCESS_TOKEN
const REF = envLocal.SUPABASE_PROJECT_REF
const CRON = envLocal.CRON_SECRET
const ANON = envFront.VITE_SUPABASE_ANON_KEY
if (!TOKEN || !REF || !CRON || !ANON) {
  console.error('✖ Faltam SUPABASE_ACCESS_TOKEN/PROJECT_REF/CRON_SECRET (.env.local) ou VITE_SUPABASE_ANON_KEY (.env).')
  process.exit(1)
}

const urlPush = `https://${REF}.supabase.co/functions/v1/send-push`
const urlTrial = `https://${REF}.supabase.co/functions/v1/fim-de-trial`
const sql = `
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Digest diário de push — 08:00 BRT (11:00 UTC)
do $unsched$ begin
  perform cron.unschedule('hopefin-digest-diario');
exception when others then null; end $unsched$;

select cron.schedule('hopefin-digest-diario', '0 11 * * *', $cron$
  select net.http_post(
    url := '${urlPush}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '${ANON}',
      'x-cron-secret', '${CRON}'
    ),
    body := jsonb_build_object('acao', 'digest')
  );
$cron$);

-- Avisos de fim de trial (D-2 e no dia) — 09:00 BRT (12:00 UTC)
do $unsched$ begin
  perform cron.unschedule('hopefin-fim-de-trial');
exception when others then null; end $unsched$;

select cron.schedule('hopefin-fim-de-trial', '0 12 * * *', $cron$
  select net.http_post(
    url := '${urlTrial}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '${ANON}',
      'x-cron-secret', '${CRON}'
    ),
    body := '{}'::jsonb
  );
$cron$);
`

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const text = await res.text()
if (!res.ok) { console.error(`✖ Falha ao agendar (HTTP ${res.status}):\n${text}`); process.exit(1) }
console.log('✔ Crons agendados:')
console.log('  • hopefin-digest-diario   (08:00 BRT / 11:00 UTC) — digest de push')
console.log('  • hopefin-fim-de-trial    (09:00 BRT / 12:00 UTC) — avisos de fim de trial')
console.log(text.slice(0, 500))
