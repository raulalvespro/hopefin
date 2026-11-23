#!/usr/bin/env node
// Descobre os IDs pra publicação automática da agência (mkt-publicar, 0124), a partir do token que o Raul colou em
// supabase/.env.local como META_PAGE_TOKEN (token de USUÁRIO DO SISTEMA do Business Manager).
// Só LÊ da Meta; não posta nada e NUNCA imprime o token (nem o token da Página que a Meta devolve).
//
//   node scripts/meta-descobrir.mjs
//
// Imprime: quem é o token, as permissões, as Páginas (id + nome) e o Instagram ligado a cada uma (id + @).
// Depois: gravar ig_user_id / fb_page_id em public.mkt_config (ver docs/META_PUBLICACAO.md).

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, 'supabase', '.env.local')
const env = {}
if (existsSync(envPath)) for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
}
const TOKEN = env.META_PAGE_TOKEN
const VER = env.META_GRAPH_VERSION || 'v23.0'
if (!TOKEN) { console.error('✖ Falta META_PAGE_TOKEN em supabase/.env.local.'); process.exit(1) }

const ocultar = (s) => String(s).split(TOKEN).join('***').replace(/access_token=[^&\s"]+/g, 'access_token=***')
async function graph(caminho, params = {}) {
  const url = new URL(`https://graph.facebook.com/${VER}/${caminho}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok || corpo?.error) {
    const e = corpo?.error || {}
    throw new Error(ocultar(`[${e.code || r.status}] ${e.message || 'erro'}`))
  }
  return corpo
}
const tentar = async (rotulo, fn) => { try { return await fn() } catch (e) { console.log(`  (${rotulo}: ${e.message})`); return null } }

console.log(`Graph API ${VER}\n`)

const eu = await tentar('quem sou eu', () => graph('me', { fields: 'id,name' }))
if (eu) console.log(`Token de: ${eu.name} (id ${eu.id})`)

console.log('\nPermissões do token:')
const dbg = await tentar('debug_token', () => graph('debug_token', { input_token: TOKEN }))
if (dbg?.data) {
  const d = dbg.data
  console.log(`  tipo: ${d.type || '?'} · app: ${d.application || d.app_id || '?'} · válido: ${d.is_valid}` +
    ` · expira: ${d.expires_at ? (d.expires_at === 0 ? 'nunca' : new Date(d.expires_at * 1000).toISOString()) : 'nunca'}`)
  if (d.scopes?.length) console.log(`  escopos: ${d.scopes.join(', ')}`)
} else {
  const perms = await tentar('me/permissions', () => graph('me/permissions'))
  for (const p of perms?.data || []) console.log(`  ${p.status === 'granted' ? '✔' : '✖'} ${p.permission}`)
}
const PRECISA = ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'business_management', 'pages_manage_posts']
if (dbg?.data?.scopes) {
  const faltam = PRECISA.filter((p) => !dbg.data.scopes.includes(p))
  console.log(faltam.length ? `  ⚠ faltam: ${faltam.join(', ')} (pages_manage_posts só é preciso pro Facebook)` : '  ✔ todas as permissões necessárias')
}

console.log('\nPáginas e Instagram:')
const campos = 'id,name,instagram_business_account{id,username}' // sem access_token: o da Página nem é pedido aqui
let paginas = (await tentar('me/accounts', () => graph('me/accounts', { fields: campos, limit: '50' })))?.data || []
if (!paginas.length) {
  paginas = (await tentar('me/assigned_pages', () => graph('me/assigned_pages', { fields: campos, limit: '50' })))?.data || []
}
if (!paginas.length) console.log('  nenhuma Página visível pra este token — confira se a Página é ATIVO do usuário do sistema.')
for (const p of paginas) {
  const ig = p.instagram_business_account
  console.log(`  Página: ${p.name}  →  fb_page_id = ${p.id}`)
  console.log(ig ? `    Instagram: @${ig.username || '?'}  →  ig_user_id = ${ig.id}` : '    (sem Instagram profissional ligado a esta Página)')
}
console.log('\nPróximo passo: mandar esses dois IDs pro Claude gravar no mkt_config (a chave publicar_ativo continua desligada).')
