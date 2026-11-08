#!/usr/bin/env node
// Restaura um dump JSON (feito por scripts/dump.mjs) de volta no banco, via Management API.
// Pensado para RECUPERAÇÃO DE DESASTRE: primeiro recrie o schema (node scripts/db.mjs --migrate
// num projeto novo/vazio), depois rode este restore para repor as LINHAS.
//
//   node scripts/restore.mjs backups/dump_manual_XXXX.json            # DRY-RUN (não grava nada)
//   node scripts/restore.mjs backups/dump_manual_XXXX.json --check     # roda o restore e dá ROLLBACK (valida sem mudar nada)
//   node scripts/restore.mjs backups/dump_manual_XXXX.json --yes      # grava de verdade
//   node scripts/restore.mjs backups/dump_manual_XXXX.json --yes --truncate   # limpa antes (destrutivo)
//
// Por padrão é DRY-RUN: mostra o que faria, sem tocar no banco. Só grava com --yes.
// O --check executa o restore de verdade dentro de uma transação e dá ROLLBACK: prova que
// o dump restaura sem erro (mapeamento de colunas, JSON, FKs) sem gravar nada. Bom pra testar
// o backup de tempos em tempos.
// Insere com `on conflict do nothing` (não sobrescreve linha existente). Durante a carga
// usa `session_replication_role = replica` para desligar FKs e triggers (evita problema de
// ordem entre tabelas e não dispara de novo gatilhos como gerar_parcelas). Lê credenciais de
// supabase/.env.local (SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF).

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envp = join(root, 'supabase', '.env.local')
if (existsSync(envp)) for (const l of readFileSync(envp, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF
if (!TOKEN || !REF) { console.error('✖ Faltam SUPABASE_ACCESS_TOKEN/PROJECT_REF'); process.exit(1) }

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const CONFIRMA = args.includes('--yes')
const TRUNCATE = args.includes('--truncate')
const CHECK = args.includes('--check')
if (!file) { console.error('✖ Uso: node scripts/restore.mjs <arquivo-dump.json> [--yes] [--truncate]'); process.exit(1) }
const caminho = resolve(root, file)
if (!existsSync(caminho)) { console.error(`✖ Arquivo não encontrado: ${caminho}`); process.exit(1) }

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t}`)
  return t ? JSON.parse(t) : null
}

const dump = JSON.parse(readFileSync(caminho, 'utf8'))
const tabelas = dump.tabelas || {}
const nomes = Object.keys(tabelas)
if (!nomes.length) { console.error('✖ Dump sem tabelas'); process.exit(1) }

const esc = (s) => s.replace(/'/g, "''")
let totalLinhas = 0
const comDados = []
for (const t of nomes) {
  const linhas = tabelas[t] || []
  totalLinhas += linhas.length
  if (linhas.length) comDados.push({ t, n: linhas.length })
}

console.log(`• Dump: ${caminho}`)
console.log(`• Tirado em: ${dump._meta?.em || '?'} (ref ${dump._meta?.ref || '?'})`)
console.log(`• Destino: projeto ${REF}`)
console.log(`• ${nomes.length} tabelas, ${totalLinhas} linhas (${comDados.length} tabelas com dados)`)
if (TRUNCATE) console.log('• --truncate: LIMPA todas as tabelas antes de inserir (DESTRUTIVO)')
console.log('• Inserção: on conflict do nothing (não sobrescreve linha já existente)')

// Monta UM script só (a session_replication_role precisa valer para todos os inserts da mesma sessão).
const partes = ['set session_replication_role = replica;']
if (TRUNCATE) {
  const alvo = nomes.map(t => `public."${t}"`).join(', ')
  partes.push(`truncate table ${alvo} restart identity cascade;`)
}
for (const t of nomes) {
  const linhas = tabelas[t] || []
  if (!linhas.length) continue
  const json = esc(JSON.stringify(linhas))
  partes.push(`insert into public."${t}" select * from json_populate_recordset(null::public."${t}", '${json}'::json) on conflict do nothing;`)
}
partes.push('set session_replication_role = default;')
const sql = partes.join('\n')

if (CHECK) {
  console.log('\n→ Validando (roda o restore dentro de uma transação e dá ROLLBACK — não grava nada)…')
  try {
    await q(`begin;\n${sql}\nrollback;`)
    console.log('✔ CHECK OK — o dump restaura sem erro. Nada foi gravado (rollback).')
  } catch (e) {
    console.error('✖ CHECK FALHOU — o restore daria erro:\n', e.message)
    process.exitCode = 1
  }
} else if (!CONFIRMA) {
  console.log('\n— DRY-RUN — nada foi gravado. Para gravar de verdade, repita com --yes.')
  console.log(`  (script gerado: ${partes.length} statements, ${sql.length} chars)`)
  if (comDados.length) console.log('  tabelas com dados:', comDados.map(x => `${x.t}(${x.n})`).join(', '))
} else {
  console.log('\n→ Gravando…')
  await q(sql)
  // Verificação: conta as linhas de cada tabela depois e compara com o dump.
  let ok = 0, alerta = 0
  for (const { t, n } of comDados) {
    const r = await q(`select count(*)::int as c from public."${t}"`)
    const c = r?.[0]?.c ?? 0
    if (c >= n) ok++
    else { alerta++; console.log(`  ⚠ ${t}: dump tinha ${n}, banco tem ${c}`) }
  }
  console.log(`✔ Restore concluído. ${ok}/${comDados.length} tabelas com contagem >= dump.${alerta ? ` (${alerta} com menos — ver avisos acima)` : ''}`)
}
