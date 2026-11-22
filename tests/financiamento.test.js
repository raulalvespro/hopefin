import { describe, it, expect } from 'vitest'
import {
  numero, taxaMensal, parcelaPrice, saldoPrice, parcelaSac, taxaImplicita, dataDaParcela,
  primeiraParcelaDe, valoresDasParcelas, resumoFinanciamento, simularAmortizacao,
} from '../src/lib/financiamento.js'

describe('financiamento — contas básicas', () => {
  it('lê número no jeito brasileiro', () => {
    expect(numero('350.000,50')).toBe(350000.5)
    expect(numero('1234.5')).toBe(1234.5)
    expect(numero('')).toBe(null)
  })
  it('taxa ao ano vira ao mês', () => {
    expect(taxaMensal('1', 'mes')).toBeCloseTo(0.01)
    expect(taxaMensal('12,6825', 'ano')).toBeCloseTo(0.01, 5)
    expect(taxaMensal('', 'mes')).toBe(null)
  })
  it('Price: parcela e saldo conhecidos', () => {
    // 10.000 a 1% a.m. em 12x = 888,49
    expect(parcelaPrice(10000, 0.01, 12)).toBeCloseTo(888.49, 2)
    expect(saldoPrice(10000, 0.01, 12, 0)).toBeCloseTo(10000, 2)
    expect(saldoPrice(10000, 0.01, 12, 12)).toBe(0)
    expect(saldoPrice(10000, 0.01, 12, 6)).toBeCloseTo(5149.4, 0)
  })
  it('SAC: parcela cai todo mês', () => {
    expect(parcelaSac(12000, 0.01, 12, 1)).toBeCloseTo(1120)
    expect(parcelaSac(12000, 0.01, 12, 12)).toBeCloseTo(1010)
  })
  it('acha os juros de uma parcela fixa', () => {
    expect(taxaImplicita(10000, 888.49, 12)).toBeCloseTo(0.01, 4)
    expect(taxaImplicita(1200, 100, 12)).toBe(0)
  })
  it('datas: mês a mês e 1ª parcela a partir da próxima', () => {
    expect(dataDaParcela('2026-01-31', 2)).toBe('2026-02-28')
    expect(primeiraParcelaDe(37, '2026-12-10')).toBe('2023-12-10')
    expect(primeiraParcelaDe(1, '2026-12-10')).toBe('2026-12-10')
  })
})

describe('financiamento — parcelas, resumo e amortização', () => {
  it('SAC soma seguro/taxas pela parcela informada', () => {
    const v = valoresDasParcelas({ sistema: 'sac', n: 12, parcela: 1170, pv: 12000, i: 0.01, ref: 1 })
    expect(v[0]).toBe(1170)
    expect(v[11]).toBe(1060)
    const fixo = valoresDasParcelas({ sistema: 'price', n: 3, parcela: 500 })
    expect(fixo).toEqual([500, 500, 500])
  })
  it('resumo: saldo pela tabela e pelas parcelas', () => {
    const parcelas = Array.from({ length: 12 }, (_, k) => ({ numero: k + 1, valor: 888.49, paga: k < 6, data_vencimento: dataDaParcela('2026-01-10', k + 1) }))
    const r = resumoFinanciamento({ sistema: 'price', valor_financiado: 10000, taxa_valor: 1, taxa_periodo: 'mes' }, parcelas, '2026-07-01')
    expect(r.pagas).toBe(6)
    expect(r.saldo).toBeCloseTo(5149.4, 0)
    expect(r.base).toBe('juros')
    const semDados = resumoFinanciamento({ sistema: 'fixa' }, parcelas, '2026-07-01')
    expect(semDados.base).toBe('soma')
    expect(semDados.saldo).toBeCloseTo(888.49 * 6, 1)
    // sem taxa, mas com valor financiado: acha os juros sozinho
    const estimado = resumoFinanciamento({ sistema: 'price', valor_financiado: 10000 }, parcelas, '2026-07-01')
    expect(estimado.jurosEstimados).toBe(true)
    expect(estimado.taxaMensal).toBeCloseTo(0.01, 4)
  })
  it('amortizar reduz prazo ou parcela e economiza juros', () => {
    const resumo = { restantes: 12, saldo: 10000, taxaMensal: 0.01 }
    const prazo = simularAmortizacao(resumo, 'price', 2000, 'prazo')
    expect(prazo.ok).toBe(true)
    expect(prazo.parcelaDepois).toBeCloseTo(888.49, 1)
    expect(prazo.menosParcelas).toBeGreaterThanOrEqual(2)
    expect(prazo.economia).toBeGreaterThan(0)
    const parcela = simularAmortizacao(resumo, 'price', 2000, 'parcela')
    expect(parcela.parcelasDepois).toBe(12)
    expect(parcela.parcelaDepois).toBeCloseTo(parcelaPrice(8000, 0.01, 12), 2)
    expect(parcela.economia).toBeGreaterThan(0)
    const sac = simularAmortizacao(resumo, 'sac', 2000, 'prazo')
    expect(sac.menosParcelas).toBe(2)
    const quita = simularAmortizacao(resumo, 'price', 20000, 'prazo')
    expect(quita.quita).toBe(true)
    const semJuros = simularAmortizacao({ restantes: 10, saldo: 1000, taxaMensal: 0 }, 'fixa', 250, 'prazo')
    expect(semJuros.menosParcelas).toBe(2)
    expect(semJuros.economia).toBe(0)
  })
})

describe('virar financiamento (A8.19) — parcelado existente', () => {
  it('a "próxima parcela" refaz as mesmas datas do parcelado (terreno 130x, 11ª em 20/12/2026)', () => {
    const primeira = primeiraParcelaDe(11, '2026-12-20')
    expect(primeira).toBe('2026-02-20')
    expect(dataDaParcela(primeira, 1)).toBe('2026-02-20')
    expect(dataDaParcela(primeira, 130)).toBe('2036-11-20')
  })
  it('parcela fixa mantém todos os valores iguais (não precisa refazer as parcelas)', () => {
    const v = valoresDasParcelas({ sistema: 'fixa', n: 130, parcela: 291, pv: null, i: null, ref: 11 })
    expect(v).toHaveLength(130)
    expect(v.every((x) => x === 291)).toBe(true)
  })
})
