// A3.5 (19/11/2026): "6 parcelas criadas (nov/26 → abr/27)".
import { describe, it, expect } from 'vitest'
import { periodoParcelas, dividirEmParcelas, problemaParcelas } from '../src/lib/parcelas.js'

describe('entrada parcelada (A3.4)', () => {
  it('só aceita de 2 a 120 parcelas e pelo menos 1 centavo em cada', () => {
    expect(problemaParcelas(100, 3)).toBe(null)
    expect(problemaParcelas(100, 120)).toBe(null)
    expect(problemaParcelas(100, 1)).toBe('qtd')
    expect(problemaParcelas(100, 121)).toBe('qtd')
    expect(problemaParcelas(100, NaN)).toBe('qtd')
    expect(problemaParcelas(100, 2.5)).toBe('qtd')
    expect(problemaParcelas(0.02, 3)).toBe('pequeno')
    expect(problemaParcelas(0.03, 3)).toBe(null)
    expect(problemaParcelas(NaN, 3)).toBe('pequeno')
  })
  it('divide o total e a soma bate exatamente', () => {
    const p = dividirEmParcelas(100, 3, '2026-11-19')
    expect(p.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34])
    expect(Math.round(p.reduce((s, x) => s + x.valor, 0) * 100)).toBe(10000)
    expect(p.map((x) => x.numero)).toEqual([1, 2, 3])
  })
  it('uma parcela por mês, no mesmo dia (31 vira o último dia)', () => {
    expect(dividirEmParcelas(300, 4, '2026-11-30').map((x) => x.data)).toEqual(['2026-11-30', '2026-12-30', '2027-01-30', '2027-02-28'])
    expect(dividirEmParcelas(90, 3, '2027-12-31').map((x) => x.data)).toEqual(['2027-12-31', '2028-01-31', '2028-02-29'])
  })
  it('valor redondo continua redondo', () => {
    expect(dividirEmParcelas(1500, 3, '2026-01-05').map((x) => x.valor)).toEqual([500, 500, 500])
  })
})
import { copy } from '../src/copy/pt-BR.js'

describe('parcelas criadas', () => {
  it('de qual mês a qual mês vão as parcelas', () => {
    expect(periodoParcelas(6, '2026-11-26')).toEqual({ de: 'nov/26', ate: 'abr/27' })
    expect(periodoParcelas(3, '2026-12-10')).toEqual({ de: 'dez/26', ate: 'fev/27' })
    expect(periodoParcelas(12, '2027-01-05')).toEqual({ de: 'jan/27', ate: 'dez/27' })
    expect(periodoParcelas(1, '2026-05-01')).toEqual({ de: 'mai/26', ate: 'mai/26' })
  })
  it('texto do aviso', () => {
    const { de, ate } = periodoParcelas(6, '2026-10-16')
    expect(copy.gastos.parcelasCriadas(6, de, ate)).toBe('6 parcelas criadas (out/26 → mar/27)')
  })
  it('data inválida não quebra', () => {
    expect(periodoParcelas(3, '')).toEqual({ de: '', ate: '' })
  })
})
