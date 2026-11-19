#!/usr/bin/env node
// Conferência do MOTOR com os dados reais de um grupo (SOMENTE LEITURA).
// Lê pelo Management API (scripts/db.mjs usa o mesmo token) e roda o motor único.
// Não grava nada e não guarda dado nenhum no repositório.
//
//   node scripts/conciliar.mjs [--comp 2026-11] [--grupo <uuid>]   (padrão: grupo do dono do app)
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resumoMes, faturaDoCartao, addMeses, diasNoMes, compDe } from '../supabase/functions/_shared/motor.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envp = join(root, 'supabase', '.env.local')
if (existsSync(envp)) for (const l of readFileSync(envp, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const { SUPABASE_ACCESS_TOKEN: TOKEN, SUPABASE_PROJECT_REF: REF } = process.env
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const comp = arg('--comp') || '2026-11'
const fim = (c) => `${c}-${String(diasNoMes(c)).padStart(2, '0')}`

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
  })
  const t = await r.text(); if (!r.ok) throw new Error(t.slice(0, 300)); return JSON.parse(t)
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

const gid = arg('--grupo') || (await q('select grupo_id from usuarios where is_dono_app limit 1'))[0].grupo_id
const G = lit(gid)
const gIni = `${addMeses(comp, -3)}-01`, gFim = fim(addMeses(comp, 1))
const [cartoes, gastos, parcelas, assinaturas, fixas, fixasLanc, entradas, contasPagas, transferencias, orcamentos, grupo, aReceber] = await Promise.all([
  q(`select id, nome, dia_fechamento, dia_vencimento, limite, compra_no_fechamento from cartoes where grupo_id = ${G}`),
  q(`select g.id, g.descricao, g.valor::float, g.data::text, g.cartao_id, g.tipo_pagamento, g.pessoa_id, g.fatura_ajuste, g.categoria, g.reembolso_status, pe.nome as pessoa_nome from gastos g left join pessoas pe on pe.id = g.pessoa_id where g.grupo_id = ${G} and g.data between '${gIni}' and '${gFim}'`),
  q(`select p.id, p.numero, p.valor::float, p.data_vencimento::text, p.paga, p.recebido, p.parcelamento_id, pm.descricao, pm.num_parcelas, pm.cartao_id, pm.pessoa_id, pm.categoria, pe.nome as pessoa_nome from parcelas p join parcelamentos pm on pm.id = p.parcelamento_id left join pessoas pe on pe.id = pm.pessoa_id where p.grupo_id = ${G} and p.data_vencimento between '${addMeses(comp, -1)}-01' and '${fim(addMeses(comp, 1))}'`),
  q(`select id, nome, valor::float, dia_cobranca, cartao_id, ativo, categoria, cobrada_desde::text, criado_em::text from assinaturas where grupo_id = ${G}`),
  q(`select id, nome, valor::float, dia_vencimento, categoria, ativo, criado_em::text from contas_fixas where grupo_id = ${G}`),
  q(`select conta_fixa_id, competencia, valor_real::float, pago from fixas_lancamentos where grupo_id = ${G} and competencia = '${comp}'`),
  q(`select id, descricao, valor::float, data::text, recebido, origem from entradas where grupo_id = ${G} and data between '${comp}-01' and '${fim(comp)}'`),
  q(`select tipo, referencia_id, competencia, pago from contas_pagas where grupo_id = ${G} and competencia between '${addMeses(comp, -3)}' and '${addMeses(comp, 1)}'`),
  q(`select id, valor::float, data::text, descricao from transferencias where grupo_id = ${G} and data between '${comp}-01' and '${fim(comp)}'`),
  q(`select categoria, valor::float, pago_com from orcamentos where grupo_id = ${G}`),
  q(`select criado_em::text from grupos where id = ${G}`),
  q(`select a.id, a.pessoa_id, a.descricao, a.valor::float, a.data::text, a.recebido, a.recorrente, a.conta_fixa_id, pe.nome as pessoa_nome from a_receber a left join pessoas pe on pe.id = a.pessoa_id where a.grupo_id = ${G} and a.data between '${comp}-01' and '${fim(comp)}'`),
])
const dados = { cartoes, gastos, parcelas, assinaturas, fixas, fixasLanc, entradas, contasPagas, transferencias, orcamentos, aReceber, inicioComp: compDe(grupo[0]?.criado_em) }
const r = resumoMes(comp, dados, { hoje: arg('--hoje') || undefined })
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

console.log(`\n== Motor · ${comp} ==`)
console.log('Entrou na conta     ', brl(r.entradasRecebidas), ' | a receber', brl(r.aReceber))
const prev = r.entradas.filter((e) => e.origem === 'reembolso_previsto')
if (prev.length) console.log('  reembolso previsto:', prev.map((e) => `${e.pessoaNome} ${brl(e.valor)} (${e.qtd})`).join(' · '))
console.log('Pago no mês         ', brl(r.pago), ' | a pagar', brl(r.aPagar))
console.log('SALDO DO MÊS        ', brl(r.saldoDoMes))
console.log('SOBRA (posso gastar)', brl(r.sobraDoMes))
console.log('\nFaturas que vencem no mês:')
for (const f of r.faturas) console.log(`  ${f.cartaoNome.padEnd(16)} ${brl(f.total).padStart(14)}  ${f.paga ? 'paga' : f.status}`)
console.log('\nOutras saídas: fixas', brl(r.fixas.reduce((s, x) => s + x.valor, 0)), '· parcelas sem cartão', brl(r.parcelasAvulsas.reduce((s, x) => s + x.valor, 0)),
  '· à vista', brl(r.aVista.reduce((s, x) => s + x.valor, 0)), '· cofrinhos', brl(r.cofrinhos.reduce((s, x) => s + x.valor, 0)))
if (r.semCartao.length) console.log('Lançados como "cartão" sem cartão:', r.semCartao.map((x) => `${x.descricao} ${brl(x.valor)}`).join(', '))
console.log('Meu gasto (consumo, sem terceiros):', brl(r.meuGasto.total), '· de outras pessoas no dinheiro:', brl(r.terceirosNoMes))
