import { describe, it, expect } from 'vitest'
import { paramsVoltarFatura, destinoVoltar, faturaPedida } from '../src/lib/voltar.js'

const ID = '25039a81-893c-44bd-be2d-15f9e46424b1'
const p = (q) => new URLSearchParams(q)

describe('voltar pra fatura certa (A8.7)', () => {
  it('editar um item da fatura volta pra MESMA fatura (cartão + mês)', () => {
    const q = paramsVoltarFatura({ cardId: ID, comp: '2026-12' })
    expect(q).toBe(`voltar=cartoes&cartao=${ID}&comp=2026-12`)
    expect(destinoVoltar(p(q))).toBe(`/cartoes?cartao=${ID}&comp=2026-12`)
    expect(faturaPedida(p(`cartao=${ID}&comp=2026-12`))).toEqual({ cardId: ID, comp: '2026-12' })
  })

  it('só aceita destino conhecido (nada de endereço livre na URL)', () => {
    expect(destinoVoltar(p('voltar=https://malicioso.com'))).toBeNull()
    expect(destinoVoltar(p('voltar=//x'))).toBeNull()
    expect(destinoVoltar(p('voltar=gastos'))).toBe('/gastos')
    expect(destinoVoltar(p('voltar=assinaturas'))).toBe('/assinaturas')
    expect(destinoVoltar(p(''))).toBeNull()
  })

  it('cartão ou mês inválido volta só pra aba Cartões', () => {
    expect(destinoVoltar(p('voltar=cartoes&cartao=abc&comp=2026-12'))).toBe('/cartoes')
    expect(destinoVoltar(p(`voltar=cartoes&cartao=${ID}&comp=2026-13`))).toBe('/cartoes')
    expect(destinoVoltar(p(`voltar=cartoes&cartao=${ID}&comp=2026-12/../x`))).toBe('/cartoes')
    expect(faturaPedida(p('cartao=abc&comp=2026-12'))).toBeNull()
    expect(paramsVoltarFatura(null)).toBe('voltar=cartoes')
  })
})
