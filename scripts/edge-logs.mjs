#!/usr/bin/env node
// Logs das Edge Functions e da API do HopeFin (SOMENTE LEITURA), pelo Management API.
// O endpoint antigo /analytics/endpoints/logs.all responde 410; este usa o novo /analytics/endpoints/logs.
//
//   node scripts/edge-logs.mjs chamadas [--horas 6] [--busca texto]   chamadas das funções (status, função, tempo)
//   node scripts/edge-logs.mjs console  [--horas 6] [--busca texto]   console.log e erros de dentro das funções
//   node scripts/edge-logs.mjs api      [--horas 2] [--busca texto]   erros >= 400 na API (PostgREST, Auth)
//   node scripts/edge-logs.mjs --sql "select ..." [--horas 1]         consulta livre
//   --limite N (padrão 50). Janela máxima: 24 h por consulta.
// Lê SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF de supabase/.env.local. Não imprime o token.
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envp = join(root, 'supabase', '.env.local')
if (existsSync(envp)) for (const l of readFileSync(envp, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { SUPABASE_ACCESS_TOKEN: TOKEN, SUPABASE_PROJECT_REF: REF } = process.env
if (!TOKEN || !REF) { console.error('Falta SUPABASE_ACCESS_TOKEN ou SUPABASE_PROJECT_REF em supabase/.env.local'); process.exit(1) }

const argv = process.argv.slice(2)
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null }
const modo = argv[0] && !argv[0].startsWith('--') ? argv[0] : null
const horas = Math.min(24, Math.max(0.1, Number(arg('--horas') || 1)))
const limite = Math.min(500, Math.max(1, Number(arg('--limite') || 50)))
const busca = arg('--busca')
const filtro = busca ? `and event_message like '%${String(busca).replace(/'/g, "''")}%'` : ''

// Sintaxe do endpoint novo (ClickHouse): uma tabela `logs`, filtrada por `source`;
// atributos em log_attributes['chave'] (ex.: 'level', 'function_id', 'request.url').
const SQL = {
  chamadas: `select timestamp, event_message
    from logs where source = 'function_edge_logs' ${filtro}
    order by timestamp desc limit ${limite}`,
  console: `select timestamp, event_message, log_attributes['level'] as level, log_attributes['function_id'] as function_id
    from logs where source = 'function_logs' ${filtro}
    order by timestamp desc limit ${limite}`,
  api: `select timestamp, event_message, log_attributes['response.status_code'] as status
    from logs where source = 'edge_logs' and toInt32OrZero(toString(log_attributes['response.status_code'])) >= 400 ${filtro}
    order by timestamp desc limit ${limite}`,
}

const sql = arg('--sql') || SQL[modo]
if (!sql) {
  console.error('Uso: node scripts/edge-logs.mjs chamadas|console|api [--horas N] [--busca texto] [--limite N]  |  --sql "select ..."')
  process.exit(1)
}

const fim = new Date()
const ini = new Date(fim.getTime() - horas * 3600 * 1000)
const url = `https://api.supabase.com/v1/projects/${REF}/analytics/endpoints/logs?` +
  new URLSearchParams({ sql, iso_timestamp_start: ini.toISOString(), iso_timestamp_end: fim.toISOString() })
const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
const t = await r.text()
if (!r.ok) { console.error('HTTP', r.status, t.slice(0, 500)); process.exit(1) }
const j = JSON.parse(t)
if (j.error) { console.error('erro:', JSON.stringify(j.error).slice(0, 800)); process.exit(1) }

// O endpoint devolve a hora em UTC sem o "Z" (ex.: 2026-11-18T22:01:19.659000).
const hora = (ts) => {
  if (ts === undefined || ts === null || ts === '') return ''
  const n = Number(ts)
  let d
  if (Number.isFinite(n)) d = new Date(n > 1e14 ? n / 1000 : n)
  else { const s = String(ts).replace(' ', 'T'); d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`) }
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

// function_id -> nome da função (best effort; se falhar, mostra o id).
let nomes = {}
try {
  const rf = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (rf.ok) for (const f of await rf.json()) nomes[f.id] = f.slug || f.name
} catch { nomes = {} }

const valor = (k, v) => (k === 'function_id' && nomes[v]) ? nomes[v] : (typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : v)
const linhas = j.result || []
console.log(`${linhas.length} registro(s) nas últimas ${horas} h${busca ? ` com "${busca}"` : ''}`)
for (const row of linhas) {
  const { timestamp, event_message, ...resto } = row
  const extra = Object.entries(resto).filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k === 'function_id' ? 'funcao' : k}=${valor(k, v)}`).join(' ')
  const partes = [hora(timestamp), event_message !== undefined ? String(event_message).replace(/\s+/g, ' ').slice(0, 300) : null, extra || null]
  console.log(partes.filter((p) => p !== null && p !== '').join(' | '))
}
