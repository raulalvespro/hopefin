#!/usr/bin/env node
// Troca a data do fim da OFERTA DE LANÇAMENTO em todo lugar, de uma vez (preparado em 27/11/2026).
//
//   node scripts/oferta-lancamento.mjs                       # mostra a data atual e onde ela aparece
//   node scripts/oferta-lancamento.mjs 2027-01-31            # SIMULA: lista cada linha que mudaria (não grava)
//   node scripts/oferta-lancamento.mjs 2027-01-31 --aplicar  # grava (arquivos primeiro, banco por último)
//
// O que muda (a data vale até 23:59 de Brasília do dia dado):
//  - Banco: planos_config.lancamento_ate (o app, o checkout, a régua do teste e o asaas-assinar leem daqui);
//    e-mail "rmk_oferta_3112" (textos + data de envio = 5 dias antes do fim).
//  - hopefin: src/lib/precos.js (reserva se o banco não responder), src/pages/Planos.jsx, CLAUDE.md.
//  - hopefin-site: public/js/site.js (FIM_LANCAMENTO), index.html, termos.html.
//  - hopefin-social: regras da marca e docs da agência (depois: scripts/sync-marca.mjs → marca.ts).
// Não mexe em "Saldo previsto em 31/12" do site (é outra data, de exemplo). Não faz commit nem deploy: no fim
// imprime o que falta.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const irmao = (n) => resolve(raiz, '..', n)
const ARQUIVOS = [
  [raiz, 'src/lib/precos.js'],
  [raiz, 'src/pages/Planos.jsx'],
  [raiz, 'CLAUDE.md'],
  [irmao('hopefin-site'), 'public/js/site.js'],
  [irmao('hopefin-site'), 'public/index.html'],
  [irmao('hopefin-site'), 'public/termos.html'],
  [irmao('hopefin-social'), 'docs/agencia/REGRAS-DA-MARCA.md'],
  [irmao('hopefin-social'), 'docs/design/README.md'],
  [irmao('hopefin-social'), 'README.md'],
  [irmao('hopefin-social'), '.claude/agents/mkt-pesquisador.md'],
  [irmao('hopefin-social'), '.claude/skills/agencia/SKILL.md'],
]
// Linhas com outra data que por acaso é 31/12 (exemplo da previsão no site).
const PULAR = /data-d="fim"|[Ss]aldo previsto|previsto de/
const EMAIL_CHAVE = 'rmk_oferta_3112'
const EMAIL_CAMPOS = ['nome', 'assunto', 'titulo', 'preheader', 'corpo', 'descricao']

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const nova = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))

const sql = (q) => {
  const out = execFileSync('node', [join(raiz, 'scripts/db.mjs'), '-e', q], { cwd: raiz, encoding: 'utf8' })
  const i = out.indexOf('[')
  return i >= 0 ? JSON.parse(out.slice(i)) : []
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

// Data atual do banco, no relógio de Brasília.
const [{ ate }] = sql("select to_char(lancamento_ate at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as ate from planos_config where id = 1")
const fmt = (iso) => { const [y, m, d] = iso.split('-'); return { iso, curta: `${d}/${m}`, longa: `${d}/${m}/${y}` } }
const velha = fmt(ate)
console.log(`Oferta de lançamento hoje: até ${velha.longa} 23:59 (Brasília).`)

// Troca numa linha: ISO, dd/mm/aaaa e dd/mm (nessa ordem, pra não trocar duas vezes).
function trocar(linha, de, para) {
  if (PULAR.test(linha)) return linha
  const esc = (s) => s.replace(/[/.-]/g, '\\$&')
  return linha
    .replaceAll(de.iso, para.iso)
    .replaceAll(de.longa, para.longa)
    .replace(new RegExp(`(?<![\\d/])${esc(de.curta)}(?![\\d/])`, 'g'), para.curta)
}

if (!nova) {
  console.log('\nOnde a data aparece:')
  for (const [base, rel] of ARQUIVOS) {
    const p = join(base, rel)
    if (!existsSync(p)) { console.log(`  (não achei ${p})`); continue }
    readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
      if (trocar(l, velha, { iso: '#', longa: '#', curta: '#' }) !== l) console.log(`  ${rel}:${i + 1}`)
    })
  }
  const [m] = sql(`select data_envio from email_modelos where chave = ${lit(EMAIL_CHAVE)}`)
  console.log(`  banco: planos_config.lancamento_ate · e-mail ${EMAIL_CHAVE} (envio ${m?.data_envio || '—'})`)
  console.log('\nPra trocar: node scripts/oferta-lancamento.mjs AAAA-MM-DD   (simula; --aplicar grava)')
  process.exit(0)
}

const alvo = fmt(nova)
if (alvo.iso === velha.iso) { console.log('Já está nessa data. Nada a fazer.'); process.exit(0) }
if (new Date(`${alvo.iso}T23:59:59-03:00`) < new Date()) { console.error('✖ Essa data já passou.'); process.exit(1) }
const envio = new Date(`${alvo.iso}T12:00:00Z`); envio.setUTCDate(envio.getUTCDate() - 5)
const envioIso = envio.toISOString().slice(0, 10)
console.log(`Nova data: até ${alvo.longa} 23:59. ${aplicar ? 'APLICANDO.' : 'SIMULAÇÃO (nada é gravado; use --aplicar).'}\n`)

// 1) Arquivos.
let mudou = 0
const repos = new Set()
for (const [base, rel] of ARQUIVOS) {
  const p = join(base, rel)
  if (!existsSync(p)) { console.log(`  ⚠ não achei ${p}`); continue }
  const txt = readFileSync(p, 'utf8')
  const linhas = txt.split('\n')
  const novas = linhas.map((l) => trocar(l, velha, alvo))
  novas.forEach((l, i) => {
    if (l !== linhas[i]) { mudou++; repos.add(base); console.log(`  ${rel}:${i + 1}\n    - ${linhas[i].trim().slice(0, 160)}\n    + ${l.trim().slice(0, 160)}`) }
  })
  if (aplicar && novas.join('\n') !== txt) writeFileSync(p, novas.join('\n'))
}

// 2) Banco (por último: se algo falhar antes, rodar de novo é seguro).
const [modelo] = sql(`select ${EMAIL_CAMPOS.join(', ')}, data_envio from email_modelos where chave = ${lit(EMAIL_CHAVE)}`)
const sets = [`data_envio = date ${lit(envioIso)}`]
for (const c of EMAIL_CAMPOS) {
  if (modelo?.[c] == null) continue
  const t = String(modelo[c]).split('\n').map((l) => trocar(l, velha, alvo)).join('\n')
  if (t !== modelo[c]) sets.push(`${c} = ${lit(t)}`)
}
console.log(`\n  banco: planos_config.lancamento_ate → ${alvo.iso} 23:59:59-03`)
console.log(`  banco: e-mail ${EMAIL_CHAVE}: ${sets.length - 1} texto(s) + envio ${modelo?.data_envio || '—'} → ${envioIso}`)
if (aplicar) {
  sql(`update planos_config set lancamento_ate = ${lit(`${alvo.iso} 23:59:59-03`)} where id = 1`)
  if (modelo) sql(`update email_modelos set ${sets.join(', ')} where chave = ${lit(EMAIL_CHAVE)}`)
  const [conf] = sql("select to_char(lancamento_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as ate from planos_config where id = 1")
  console.log(`  ✔ banco conferido: até ${conf.ate}`)
}

console.log(`\n${mudou} linha(s) em arquivos.`)
console.log(aplicar ? `
Falta (o script não faz commit nem deploy):
  1. node scripts/sync-marca.mjs  → e publicar a função mkt-texto (skill hopefin-edge)
  2. hopefin: npm test, commit + push e npm run cf:deploy (skill hopefin-publicar)
  3. hopefin-site e hopefin-social: commit + push (o site oficial só sobe quando for comercializar)
  4. Obsidian (Estado atual) e planilha: anotar a nova data
  Repos mexidos: ${[...repos].map((r) => r.split(/[\\/]/).pop()).join(', ') || '—'}` : '')
