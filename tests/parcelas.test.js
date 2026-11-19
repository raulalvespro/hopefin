// A3.5 (19/11/2026): "6 parcelas criadas (nov/26 → abr/27)".
import { describe, it, expect } from 'vitest'
import { periodoParcelas } from '../src/lib/parcelas.js'
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
