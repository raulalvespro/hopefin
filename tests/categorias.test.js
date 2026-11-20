import { describe, it, expect } from 'vitest'
import { rotuloCategoria } from '../src/lib/categorias.js'

describe('nome de categoria na tela (A8.20)', () => {
  it('as categorias padrão aparecem com acento e maiúscula', () => {
    expect(rotuloCategoria('alimentacao')).toBe('Alimentação')
    expect(rotuloCategoria('saude')).toBe('Saúde')
    expect(rotuloCategoria('educacao')).toBe('Educação')
    expect(rotuloCategoria('eletronico')).toBe('Eletrônico')
  })
  it('as criadas pela família só ganham a primeira letra maiúscula', () => {
    expect(rotuloCategoria('dízimo e doações')).toBe('Dízimo e doações')
    expect(rotuloCategoria('higiene e limpeza')).toBe('Higiene e limpeza')
    expect(rotuloCategoria('')).toBe('')
    expect(rotuloCategoria(null)).toBe('')
  })
})
