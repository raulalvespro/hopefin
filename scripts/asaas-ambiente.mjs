#!/usr/bin/env node
// Troca o Asaas do HopeFin entre SANDBOX e PRODUÇÃO (L2/L6, 27/11/2026). Não imprime chave nem token.
//
//   node scripts/asaas-ambiente.mjs status               # ambiente atual, chave válida?, webhook cadastrado?
//   node scripts/asaas-ambiente.mjs producao             # mostra o que vai fazer (não muda nada)
//   node scripts/asaas-ambiente.mjs producao --aplicar   # liga a produção
//   node scripts/asaas-ambiente.mjs sandbox --aplicar    # volta pro sandbox (plano de volta)
//
// Em supabase/.env.local (gitignored; quem cola as chaves é o Raul, nunca pelo chat):
//   ASAAS_API_KEY=...            chave do SANDBOX (já existia)
//   ASAAS_API_KEY_PROD=...       chave de PRODUÇÃO (Asaas › Integrações › Chave de API; sem permissão de saque)
//   ASAAS_AMBIENTE=producao      escrito por este script (sem a linha = sandbox)
//   ASAAS_WEBHOOK_TOKEN / ASAAS_WEBHOOK_TOKEN_PROD   gerados aqui
//
// O que o --aplicar faz, em ordem:
//   1) confere se a chave é do ambiente certo ($aact_prod_ / $aact_hmlg_) e se o Asaas aceita;
//   2) cadastra (ou atualiza) o webhook desse ambiente apontando pra função asaas-webhook, com token próprio;
//   3) se mudou de ambiente: limpa do banco as referências do ambiente antigo (IDs de cliente/assinatura/parcelamento
//      e o token do cartão) — elas não existem no outro ambiente. FAÇA `npm run backup` ANTES;
//   4) grava ASAAS_AMBIENTE no .env.local e manda ASAAS_API_KEY, ASAAS_BASE_URL e ASAAS_WEBHOOK_TOKEN pras funções.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, 'supabase', '.env.local')

const AMB = {
  sandbox: { base: 'https://api-sandbox.asaas.com/v3', chave: 'ASAAS_API_KEY', token: 'ASAAS_WEBHOOK_TOKEN', prefixo: '$aact_hmlg_' },
  producao: { base: 'https://api.asaas.com/v3', chave: 'ASAAS_API_KEY_PROD', token: 'ASAAS_WEBHOOK_TOKEN_PROD', prefixo: '$aact_prod_' },
}
// Eventos que a função asaas-webhook trata (o resto ela registra e ignora).
const EVENTOS = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'SUBSCRIPTION_DELETED']
const NOME_WEBHOOK = 'HopeFin app (assinaturas)'
const EMAIL_AVISOS = 'contato@hopefin.com.br' // o Asaas avisa aqui se o webhook parar

function lerEnv() {
  const env = {}
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      const v = m ? m[2].replace(/^["']|["']$/g, '').trim() : ''
      if (m && v && !env[m[1]]) env[m[1]] = v // vale a 1ª linha preenchida
    }
  }
  return env
}
function gravarVar(nome, valor) {
  let txt = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  const re = new RegExp(`^\\s*${nome}\\s*=.*$`, 'm')
  if (re.test(txt)) txt = txt.replace(re, `${nome}=${valor}`)
  else txt = txt.replace(/\s*$/, '\n') + `${nome}=${valor}\n`
  writeFileSync(envPath, txt)
}

const env = lerEnv()
const [, , acao = 'status', ...resto] = process.argv
const aplicar = resto.includes('--aplicar')
const atual = env.ASAAS_AMBIENTE === 'producao' ? 'producao' : 'sandbox'
const REF = env.SUPABASE_PROJECT_REF
const SB_TOKEN = env.SUPABASE_ACCESS_TOKEN
if (!REF || !SB_TOKEN) { console.error('✖ Faltam SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF no supabase/.env.local.'); process.exit(1) }
const URL_WEBHOOK = `https://${REF}.supabase.co/functions/v1/asaas-webhook`

async function asaas(amb, path, init = {}) {
  const res = await fetch(`${AMB[amb].base}${path}`, {
    ...init,
    headers: { access_token: env[AMB[amb].chave], 'Content-Type': 'application/json', 'User-Agent': 'hopefin-scripts', ...(init.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path}: ${data?.errors?.map((e) => e.description).join('; ') || `HTTP ${res.status}`}`)
  return data
}
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${SB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

// Confere a chave sem mostrar nada dela. Devolve o nome da conta (pra conferir que é a certa).
async function conferirChave(amb) {
  const k = env[AMB[amb].chave]
  if (!k) return { ok: false, motivo: `falta ${AMB[amb].chave} no supabase/.env.local` }
  if (!k.startsWith(AMB[amb].prefixo)) return { ok: false, motivo: `${AMB[amb].chave} não parece chave de ${amb} (deveria começar com ${AMB[amb].prefixo})` }
  try {
    const conta = await asaas(amb, '/myAccount/commercialInfo')
    return { ok: true, conta: conta?.name || conta?.companyName || '(sem nome)' }
  } catch (e) { return { ok: false, motivo: `o Asaas recusou a chave: ${e.message}` } }
}
async function webhooksDo(amb) {
  const r = await asaas(amb, '/webhooks?limit=50')
  return (r?.data || []).filter((w) => w.url === URL_WEBHOOK)
}

if (acao === 'status') {
  console.log(`Ambiente no .env.local: ${atual.toUpperCase()}`)
  for (const amb of ['sandbox', 'producao']) {
    const c = await conferirChave(amb)
    let wh = ''
    if (c.ok) {
      const ws = await webhooksDo(amb).catch(() => [])
      wh = ws.length ? ws.map((w) => `webhook ${w.enabled ? 'ligado' : 'DESLIGADO'}${w.interrupted ? ' (FILA PARADA)' : ''}, ${w.events?.length || 0} eventos`).join('; ') : 'sem webhook cadastrado'
    }
    console.log(`  ${amb.padEnd(8)} ${c.ok ? `chave ok · conta "${c.conta}" · ${wh}` : `✖ ${c.motivo}`}`)
  }
  const [refs] = await sql(`select count(*) filter (where asaas_customer_id is not null or asaas_subscription_id is not null or asaas_installment_id is not null)::int as com_asaas,
    (select count(*)::int from public.subscription_secrets) as tokens from public.subscriptions`)
  console.log(`  banco: ${refs.com_asaas} assinatura(s) com IDs do Asaas · ${refs.tokens} token(s) de cartão`)
  process.exit(0)
}

if (!AMB[acao]) { console.error('Uso: node scripts/asaas-ambiente.mjs status | producao [--aplicar] | sandbox [--aplicar]'); process.exit(1) }
const alvo = acao
const muda = alvo !== atual

console.log(`${aplicar ? 'APLICANDO' : 'Simulação (nada muda; use --aplicar)'}: ${atual.toUpperCase()} → ${alvo.toUpperCase()}`)

// 1) chave
const c = await conferirChave(alvo)
if (!c.ok) { console.error(`✖ ${c.motivo}`); process.exit(1) }
console.log(`✔ chave de ${alvo} aceita pelo Asaas · conta "${c.conta}"`)

// 2) token do webhook desse ambiente
let token = env[AMB[alvo].token]
if (!token) {
  token = randomBytes(24).toString('hex')
  if (aplicar) { gravarVar(AMB[alvo].token, token); env[AMB[alvo].token] = token; console.log(`• ${AMB[alvo].token} gerado e gravado no supabase/.env.local`) }
  else console.log(`• vai gerar ${AMB[alvo].token}`)
}

// 3) webhook no Asaas
const existentes = await webhooksDo(alvo)
const corpo = {
  name: NOME_WEBHOOK, url: URL_WEBHOOK, email: EMAIL_AVISOS, enabled: true, interrupted: false,
  apiVersion: 3, sendType: 'SEQUENTIALLY', authToken: token, events: EVENTOS,
}
if (!aplicar) console.log(`• webhook: ${existentes.length ? 'vai ATUALIZAR o que já existe' : 'vai CADASTRAR'} → ${URL_WEBHOOK} (${EVENTOS.length} eventos, avisos para ${EMAIL_AVISOS})`)
else if (existentes.length) {
  await asaas(alvo, `/webhooks/${existentes[0].id}`, { method: 'PUT', body: JSON.stringify(corpo) })
  console.log('✔ webhook atualizado (token, eventos, ligado)')
} else {
  await asaas(alvo, '/webhooks', { method: 'POST', body: JSON.stringify(corpo) })
  console.log('✔ webhook cadastrado')
}

// 4) referências do ambiente antigo no banco
const [refs] = await sql(`select count(*) filter (where asaas_customer_id is not null or asaas_subscription_id is not null or asaas_installment_id is not null)::int as com_asaas,
  count(*) filter (where status in ('active','past_due') and not is_cortesia and (asaas_subscription_id is not null or asaas_installment_id is not null))::int as pagantes,
  (select count(*)::int from public.subscription_secrets) as tokens from public.subscriptions`)
if (muda) {
  if (refs.pagantes > 0) {
    console.error(`✖ Há ${refs.pagantes} assinatura(s) PAGA(S) ligada(s) ao ${atual}. Não limpo isso sozinho — resolver uma a uma antes.`)
    process.exit(1)
  }
  if (!aplicar) console.log(`• banco: vai limpar IDs do ${atual} de ${refs.com_asaas} assinatura(s) e apagar ${refs.tokens} token(s) de cartão (faça npm run backup antes)`)
  else {
    await sql(`update public.subscriptions set asaas_customer_id = null, asaas_subscription_id = null, asaas_installment_id = null,
      asaas_last_payment_id = null, asaas_periodo_ref = null
      where asaas_customer_id is not null or asaas_subscription_id is not null or asaas_installment_id is not null or asaas_last_payment_id is not null;
      delete from public.subscription_secrets;`)
    console.log(`✔ banco: IDs do ${atual} limpos (${refs.com_asaas} assinatura(s), ${refs.tokens} token(s))`)
  }
} else console.log('• banco: mesmo ambiente, nada a limpar')

// 5) segredos das funções
if (!aplicar) { console.log(`• vai gravar ASAAS_AMBIENTE=${alvo} e mandar ASAAS_API_KEY, ASAAS_BASE_URL e ASAAS_WEBHOOK_TOKEN de ${alvo} pras funções`); process.exit(0) }
gravarVar('ASAAS_AMBIENTE', alvo)
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
  method: 'POST', headers: { Authorization: `Bearer ${SB_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify([
    { name: 'ASAAS_API_KEY', value: env[AMB[alvo].chave] },
    { name: 'ASAAS_BASE_URL', value: AMB[alvo].base },
    { name: 'ASAAS_WEBHOOK_TOKEN', value: token },
    { name: 'ASAAS_AMBIENTE', value: alvo },
  ]),
})
if (!res.ok) { console.error(`✖ Falha ao mandar os segredos (HTTP ${res.status}): ${await res.text()}`); process.exit(1) }
console.log(`✔ funções agora em ${alvo.toUpperCase()} (ASAAS_API_KEY, ASAAS_BASE_URL, ASAAS_WEBHOOK_TOKEN, ASAAS_AMBIENTE)`)
if (muda && atual === 'sandbox') console.log('  Lembrete: o webhook do sandbox continua cadastrado lá, mas agora recebe 401 (token diferente). Pode desligar no painel do sandbox.')
