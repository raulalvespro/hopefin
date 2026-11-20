// Botão de Ajuda (L29): a curadoria por tela aponta pra telas que existem e nenhuma resposta
// está vazia ou fala da oferta antiga.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { copy } from '../src/copy/pt-BR.js'
import { perguntasDaTela } from '../src/components/Ajuda.jsx'

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const rotas = new Set(['/', ...[...app.matchAll(/<Route path="([a-z-]+)"/g)].map((m) => `/${m[1]}`)])

describe('Ajuda — perguntas por tela', () => {
  it('cada tela da curadoria existe no app', () => {
    for (const caminho of Object.keys(copy.ajuda.telas)) expect(rotas.has(caminho), caminho).toBe(true)
  })
  it('as telas principais têm perguntas', () => {
    for (const c of ['/', '/gastos', '/entradas', '/cartoes', '/contas-do-mes', '/configuracoes', '/planos']) {
      expect(copy.ajuda.telas[c]?.perguntas?.length, c).toBeGreaterThan(1)
    }
  })
  it('nenhuma pergunta ou resposta vazia; nada da oferta antiga', () => {
    const todas = [...Object.values(copy.ajuda.telas).flatMap((t) => t.perguntas), ...copy.ajuda.perguntasGerais]
    for (const { p, r } of todas) {
      expect(p.trim().length, p).toBeGreaterThan(5)
      expect(r.trim().length, p).toBeGreaterThan(20)
      expect(`${p} ${r}`).not.toMatch(/fundador|14 dias|R\$ ?19,90/i)
    }
  })
  it('acha a tela pelo caminho (com ou sem barra no fim); tela sem curadoria = só as gerais', () => {
    expect(perguntasDaTela('/cartoes')?.nome).toBe('Cartões')
    expect(perguntasDaTela('/cartoes/')?.nome).toBe('Cartões')
    expect(perguntasDaTela('/')?.nome).toBe('o Início')
    expect(perguntasDaTela('/checkout')).toBe(null)
  })
})
