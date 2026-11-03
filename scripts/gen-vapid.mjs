#!/usr/bin/env node
// Gera um par de chaves VAPID (P-256) para Web Push, no formato base64url
// usado pela Web Push API / lib `web-push`.
//
//   node scripts/gen-vapid.mjs
//
// A chave PÚBLICA é impressa (pode ser exposta no front — é o applicationServerKey).
// As duas chaves são gravadas em supabase/.env.local (gitignored). A PRIVADA
// NUNCA é impressa nem commitada; vira segredo da Edge Function.

import { generateKeyPairSync } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, 'supabase', '.env.local')

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const pub = publicKey.export({ format: 'jwk' })
const prv = privateKey.export({ format: 'jwk' })

const b = s => Buffer.from(s, 'base64url')
// applicationServerKey = 0x04 || X || Y (ponto não comprimido, 65 bytes)
const publicB64 = Buffer.concat([Buffer.from([4]), b(pub.x), b(pub.y)]).toString('base64url')
const privateB64 = prv.d // escalar privado (32 bytes), já em base64url

// Remove linhas VAPID_* anteriores e regrava
let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
env = env.split('\n').filter(l => !/^\s*VAPID_(PUBLIC|PRIVATE)_KEY\s*=/.test(l)).join('\n').replace(/\n+$/, '')
if (env && !env.endsWith('\n')) env += '\n'
env += `VAPID_PUBLIC_KEY=${publicB64}\nVAPID_PRIVATE_KEY=${privateB64}\n`
writeFileSync(envPath, env)

console.log('✔ Chaves VAPID geradas e gravadas em supabase/.env.local')
console.log('\nVAPID_PUBLIC_KEY (pode expor no front):')
console.log(publicB64)
