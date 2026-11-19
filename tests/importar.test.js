// A4.1 (19/11/2026): importar extrato ou fatura escolhendo pra onde vai cada linha.
import { describe, it, expect } from 'vitest'
import {
  classificarLinha, sinalDasCompras, ajusteParaFatura, faturaProvavel, faturaDaData,
  chaveRepetido, chaveFatura, montarJaLancados, parecePagamentoDeFatura,
} from '../src/lib/importar.js'
import { compDaCompra } from '../supabase/functions/_shared/motor.js'

// Fecha dia 3, vence dia 10 (compra no dia do fechamento vai pra próxima — padrão).
const CARTAO = { id: 'c1', dia_fechamento: 3, dia_vencimento: 10 }

describe('pra onde vai cada linha', () => {
  it('extrato da conta: negativo é gasto, positivo é entrada (como sempre foi)', () => {
    expect(classificarLinha(-89.5, 'extrato').tipo).toBe('gasto')
    expect(classificarLinha(5000, 'extrato').tipo).toBe('entrada')
  })
  it('só entradas / só gastos: o sinal não importa', () => {
    expect(classificarLinha(-100, 'entradas').tipo).toBe('entrada')
    expect(classificarLinha(100, 'gastos').tipo).toBe('gasto')
  })
  it('fatura do cartão: compra vira gasto; pagamento/estorno (sinal contrário) fica de fora', () => {
    expect(classificarLinha(120, 'cartao', 1)).toEqual({ tipo: 'gasto' })
    expect(classificarLinha(-1500, 'cartao', 1)).toEqual({ tipo: null, fora: 'pagamento' })
    expect(classificarLinha(-120, 'cartao', -1)).toEqual({ tipo: 'gasto' })
    expect(classificarLinha(1500, 'cartao', -1)).toEqual({ tipo: null, fora: 'pagamento' })
  })
  it('valor zerado não entra', () => {
    expect(classificarLinha(0, 'extrato')).toEqual({ tipo: null, fora: 'zero' })
    expect(classificarLinha(NaN, 'cartao')).toEqual({ tipo: null, fora: 'zero' })
  })
  it('descobre se as compras da fatura vêm positivas ou negativas (pela maioria)', () => {
    expect(sinalDasCompras([45.9, 120, 33.1, -1500])).toBe(1)
    expect(sinalDasCompras([-45.9, -120, -33.1, 1500])).toBe(-1)
    expect(sinalDasCompras([10, -10])).toBe(1)
  })
})

describe('em qual fatura cai', () => {
  it('pela data: dia 2 cai na que vence 10/11; dia 3 (fechamento) já vai pra 10/12', () => {
    expect(faturaDaData(CARTAO, '2026-11-02')).toBe('2026-11')
    expect(faturaDaData(CARTAO, '2026-11-03')).toBe('2026-12')
  })
  it('tudo numa fatura só: a parcela 3/10 com data de agosto vai pra fatura escolhida', () => {
    const ajuste = ajusteParaFatura(CARTAO, '2026-08-15', '2026-11')
    expect(ajuste).toBe(2)
    expect(compDaCompra(CARTAO, '2026-08-15', ajuste)).toBe('2026-11') // o motor confirma
    expect(ajusteParaFatura(CARTAO, '2026-11-02', '2026-11')).toBe(0)
    expect(compDaCompra(CARTAO, '2026-11-20', ajusteParaFatura(CARTAO, '2026-11-20', '2026-11'))).toBe('2026-11')
  })
  it('a fatura provável do arquivo é a da compra mais recente', () => {
    expect(faturaProvavel(CARTAO, ['2026-10-05', '2026-11-02', '2026-10-20', null])).toBe('2026-11')
    expect(faturaProvavel(CARTAO, [])).toBe(null)
  })
})

describe('pagamento da fatura no extrato da conta', () => {
  it('reconhece o pagamento da fatura (não é gasto novo)', () => {
    for (const d of ['Pagamento de fatura', 'PGTO FATURA CARTAO ITAU', 'Pag fatura Nubank', 'Pagamento cartão de crédito', 'Fatura cartão Inter', 'Cartão Nubank - fatura'])
      expect(parecePagamentoDeFatura(d)).toBe(true)
  })
  it('compra comum não é confundida', () => {
    for (const d of ['Supermercado', 'Posto de combustível', 'Farmácia', 'Pagamento de boleto condomínio', 'Pix enviado Fulano', 'Cartão presente loja'])
      expect(parecePagamentoDeFatura(d)).toBe(false)
  })
})

describe('o que parece já lançado', () => {
  it('mesma data e mesmo valor (sinal e centavos à parte)', () => {
    expect(chaveRepetido('2026-11-02', -89.5)).toBe(chaveRepetido('2026-11-02', 89.50))
    expect(chaveRepetido('2026-11-02', 89.5)).not.toBe(chaveRepetido('2026-11-03', 89.5))
  })
  it('parcela e assinatura do MESMO cartão na mesma fatura também contam', () => {
    const j = montarJaLancados({
      gastos: [{ data: '2026-10-28', valor: 45.9 }],
      entradas: [{ data: '2026-11-05', valor: 5000 }],
      parcelas: [
        { valor: 24.63, data_vencimento: '2026-11-10', parcelamentos: { cartao_id: 'c1' } },
        { valor: 99, data_vencimento: '2026-11-10', parcelamentos: { cartao_id: 'outro' } },
      ],
      assinaturas: [
        { cartao_id: 'c1', valor: 55.9, dia_cobranca: 20, cobrada_desde: '2026-01-01' },
        { cartao_id: 'c1', valor: 12, dia_cobranca: 5, cobrada_desde: '2026-01-01', ativo: false },
      ],
      cartao: CARTAO, comps: ['2026-11'],
    })
    expect(j.gastos.has(chaveRepetido('2026-10-28', -45.9))).toBe(true)
    expect(j.entradas.has(chaveRepetido('2026-11-05', 5000))).toBe(true)
    expect(j.fatura.has(chaveFatura('2026-11', 24.63))).toBe(true)
    expect(j.fatura.has(chaveFatura('2026-11', 99))).toBe(false)     // parcela de outro cartão
    expect(j.fatura.has(chaveFatura('2026-11', 55.9))).toBe(true)   // cobrança de 20/10 cai na de 10/11
    expect(j.fatura.has(chaveFatura('2026-11', 12))).toBe(false)    // assinatura desligada
  })
})
