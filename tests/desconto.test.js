// Cupom de desconto (0084): a conta é a mesma no app e no servidor (asaas-assinar).
import { describe, it, expect } from 'vitest'
import { comDesconto, parceladoComDesconto } from '../supabase/functions/_shared/desconto.js'
import { precosVigentes, PRECOS_PADRAO } from '../src/lib/precos.js'

describe('conta do desconto', () => {
  it('tira o % e arredonda pro centavo', () => {
    expect(comDesconto(2490, 10)).toBe(2241)
    expect(comDesconto(14990, 20)).toBe(11992)
    expect(comDesconto(2490, 15)).toBe(2117) // 2116,5 → 2117
  })
  it('% fora de 1 a 90 (ou vazio) não mexe no preço', () => {
    for (const pct of [null, undefined, 0, 91, 100, -5, 12.5, '10']) expect(comDesconto(2490, pct)).toBe(2490)
  })
  it('anual no cartão: desconto na parcela e total = 12 × parcela', () => {
    expect(parceladoComDesconto(17880, 1490, 10)).toEqual({ parcela: 1341, total: 16092 })
    expect(parceladoComDesconto(17880, 1490, null)).toEqual({ parcela: 1490, total: 17880 })
  })
})

describe('preços na tela com desconto', () => {
  it('sem cupom fica igual a hoje', () => {
    const p = precosVigentes(PRECOS_PADRAO)
    expect([p.mensal, p.anualPix, p.anualCartao, p.anualCartaoParcela]).toEqual([2490, 14990, 17880, 1490])
    expect(p.descontoPct).toBeNull()
  })
  it('com cupom de 20% no lançamento', () => {
    const p = precosVigentes(PRECOS_PADRAO, 20)
    expect([p.mensal, p.anualPix, p.anualCartao, p.anualCartaoParcela]).toEqual([1992, 11992, 14304, 1192])
    expect(p.semDesconto.anualPix).toBe(14990)
    expect(p.descontoPct).toBe(20)
  })
  it('com cupom depois do lançamento usa o preço normal', () => {
    const p = precosVigentes({ ...PRECOS_PADRAO, lancamento_ativo: false }, 10)
    expect([p.anualPix, p.anualCartaoParcela, p.anualCartao]).toEqual([17991, 1791, 21492])
  })
})
