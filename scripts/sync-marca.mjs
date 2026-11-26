// Copia as regras da marca da agência (repo hopefin-social, ao lado) pra Edge Function mkt-texto.
// Uso: node scripts/sync-marca.mjs  → depois publicar a função (skill hopefin-edge).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const origem = path.resolve(raiz, '..', 'hopefin-social', 'docs', 'agencia', 'REGRAS-DA-MARCA.md')
const destino = path.join(raiz, 'supabase', 'functions', 'mkt-texto', 'marca.ts')
const texto = fs.readFileSync(origem, 'utf8')
fs.writeFileSync(destino, '// GERADO por scripts/sync-marca.mjs a partir de hopefin-social/docs/agencia/REGRAS-DA-MARCA.md — não editar aqui.\n' +
  '// Rode de novo (node scripts/sync-marca.mjs) e republique a função quando as regras da marca mudarem.\n' +
  `export const REGRAS_MARCA = ${JSON.stringify(texto)}\n`)
console.log(`✔ ${path.relative(raiz, destino)} atualizado (${texto.length} caracteres)`)
