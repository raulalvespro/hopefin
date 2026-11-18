// Aviso do Novo gasto (A0.7): compra que parece uma assinatura já cadastrada.
import { describe, it, expect } from 'vitest'
import { assinaturaParecida, palavras } from '../src/lib/assinaturaParecida.js'

const ASSIN = [
  { id: 'n', nome: 'Netflix', valor: 55.9, cartao_id: 'itau' },
  { id: 's', nome: 'Spotify Família', valor: 34.9, cartao_id: 'nubank' },
  { id: 'm', nome: 'Mercado Livre Meli+', valor: 9.9, cartao_id: 'itau' },
  { id: 'i', nome: 'Internet', valor: 120, cartao_id: null },
]
const gasto = (o) => ({ descricao: '', valor: '', tipo_pagamento: 'cartao', cartao_id: 'itau', ...o })

describe('compra que parece assinatura', () => {
  it('nome igual, sem acento nem maiúscula', () => {
    expect(assinaturaParecida(gasto({ descricao: 'NETFLIX dezembro', valor: '59,90' }), ASSIN)?.id).toBe('n')
    expect(assinaturaParecida(gasto({ descricao: 'spotify familia' }), ASSIN)?.id).toBe('s')
    expect(assinaturaParecida(gasto({ descricao: 'Spotify' }), ASSIN)?.id).toBe('s')
  })
  it('mesmo valor no mesmo cartão', () => {
    expect(assinaturaParecida(gasto({ descricao: 'Streaming', valor: '55.90' }), ASSIN)?.id).toBe('n')
  })
  it('mesmo valor em outro cartão não é aviso', () => {
    expect(assinaturaParecida(gasto({ descricao: 'Farmácia', valor: '55.90', cartao_id: 'nubank' }), ASSIN)).toBe(null)
  })
  it('sem cartão bate com assinatura sem cartão', () => {
    expect(assinaturaParecida(gasto({ descricao: 'Vivo fibra', valor: '120', tipo_pagamento: 'pix', cartao_id: '' }), ASSIN)?.id).toBe('i')
  })
  it('palavra genérica ou pedaço de palavra não dispara', () => {
    expect(assinaturaParecida(gasto({ descricao: 'Mercado Extra', valor: '200' }), ASSIN)).toBe(null)
    expect(assinaturaParecida(gasto({ descricao: 'Net', valor: '10' }), ASSIN)).toBe(null)
    expect(palavras('Pagamento mensal Netflix.com')).toEqual(['netflix'])
  })
  it('se várias batem, vale a que bate nome e valor', () => {
    const lista = [{ id: 'x', nome: 'Seguro', valor: 9.9, cartao_id: 'itau' }, ...ASSIN]
    expect(assinaturaParecida(gasto({ descricao: 'Meli+ Mercado Livre', valor: '9.90' }), lista)?.id).toBe('m')
  })
})
