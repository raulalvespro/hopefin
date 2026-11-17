// Testes do motor único (supabase/functions/_shared/motor.js).
// Casos inventados que reproduzem o que a conciliação de novembro/2026 encontrou:
// compra no dia do fechamento, assinatura x ajuste manual, compra movida de fatura,
// compra de outra pessoa (dinheiro x meu gasto), fatura paga, cofrinho.
import { describe, it, expect } from 'vitest'
import {
  compDaCompra, cobrancaNoMes, faturaDoCartao, faturasDoCartaoAgora, limiteComprometido,
  resumoMes, meuGastoDoMes, addMeses, dataNoMes, pagoComResolvido,
} from '../supabase/functions/_shared/motor.js'

const HOJE = '2026-11-16'
const A = { id: 'A', nome: 'Itaú', dia_fechamento: 2, dia_vencimento: 9, compra_no_fechamento: 'proxima' }
const B = { id: 'B', nome: 'Nubank', dia_fechamento: 18, dia_vencimento: 25, compra_no_fechamento: 'proxima' }
const C = { id: 'C', nome: 'Renner', dia_fechamento: 30, dia_vencimento: 8 }

function dados() {
  return {
    inicioComp: '2026-11',
    cartoes: [A, B],
    gastos: [
      { id: 'g1', cartao_id: 'A', data: '2026-10-20', valor: 100, categoria: 'mercado' },
      { id: 'g2', cartao_id: 'A', data: '2026-11-02', valor: 40, categoria: 'mercado' },          // dia do fechamento -> dez
      { id: 'g3', cartao_id: 'A', data: '2026-11-10', valor: 60, categoria: 'lazer' },
      { id: 'g4', cartao_id: 'A', data: '2026-10-25', valor: 30, categoria: 'saude', pessoa_id: 'P1' }, // de outra pessoa
      { id: 'g5', cartao_id: 'A', data: '2026-10-28', valor: 50, categoria: 'casa', fatura_ajuste: 1 }, // movida -> dez
      { id: 'g6', cartao_id: 'A', data: '2026-10-13', valor: 20, categoria: 'assinaturas' },      // "ajuste assinaturas" à mão
      { id: 'g7', cartao_id: 'B', data: '2026-11-10', valor: 80, categoria: 'mercado' },
      { id: 'g8', cartao_id: null, tipo_pagamento: 'pix', data: '2026-11-09', valor: 200, categoria: 'transporte' },
      { id: 'g9', cartao_id: null, tipo_pagamento: 'pix', data: '2026-11-20', valor: 50, categoria: 'lazer' },
      { id: 'g10', cartao_id: null, tipo_pagamento: 'pix', data: '2026-11-05', valor: 40, categoria: 'saude', pessoa_id: 'P1' },
    ],
    parcelas: [
      { id: 'p1', cartao_id: 'A', data_vencimento: '2026-11-10', valor: 25, numero: 2, num_parcelas: 6, categoria: 'casa' },
      { id: 'p2', cartao_id: 'A', data_vencimento: '2026-12-10', valor: 25, numero: 3, num_parcelas: 6, categoria: 'casa' },
      { id: 'p3', cartao_id: null, data_vencimento: '2026-11-20', valor: 291, numero: 10, num_parcelas: 130, categoria: 'moradia' },
    ],
    assinaturas: [
      { id: 'a1', nome: 'Internet', cartao_id: 'A', dia_cobranca: 5, valor: 20, ativo: true, cobrada_desde: '2026-11-01' },
      { id: 'a2', nome: 'Música', cartao_id: 'B', dia_cobranca: 10, valor: 10, ativo: true, cobrada_desde: '2026-11-01' },
      { id: 'a3', nome: 'Seguro app', cartao_id: null, dia_cobranca: 3, valor: 15, ativo: true, cobrada_desde: '2026-01-01' },
    ],
    fixas: [
      { id: 'f1', nome: 'Aluguel', valor: 700, categoria: 'moradia', dia_vencimento: 10 },
      { id: 'f2', nome: 'Plano de saúde', valor: 300, categoria: 'saude', dia_vencimento: 30 },
    ],
    fixasLanc: [{ conta_fixa_id: 'f1', competencia: '2026-11', valor_real: null, pago: true }],
    entradas: [
      { id: 'e1', descricao: 'Salário', valor: 3000, data: '2026-11-05', recebido: true, origem: 'recorrente' },
      { id: 'e2', descricao: 'Freela', valor: 500, data: '2026-11-25', recebido: false },
      { id: 'e3', descricao: 'Reembolso · Pai', valor: 70, data: '2026-11-12', recebido: true, origem: 'reembolso' },
    ],
    contasPagas: [
      { tipo: 'fatura', referencia_id: 'A', competencia: '2026-11', pago: true },
      { tipo: 'assinatura', referencia_id: 'a3', competencia: '2026-11', pago: true },
    ],
    transferencias: [{ id: 't1', valor: 100, data: '2026-11-05' }],
    orcamentos: [],
  }
}

describe('datas', () => {
  it('soma meses e ajusta o dia ao fim do mês', () => {
    expect(addMeses('2026-11', 2)).toBe('2027-01')
    expect(addMeses('2026-01', -1)).toBe('2025-12')
    expect(dataNoMes('2027-02', 31)).toBe('2027-02-28')
  })
})

describe('em qual fatura a compra cai', () => {
  it('compra NO dia do fechamento vai pra próxima (padrão dos bancos)', () => {
    expect(compDaCompra(A, '2026-11-01')).toBe('2026-11')
    expect(compDaCompra(A, '2026-11-02')).toBe('2026-12')
  })
  it('cartão com regra "atual" segura a compra do dia do fechamento', () => {
    expect(compDaCompra({ ...A, compra_no_fechamento: 'atual' }, '2026-11-02')).toBe('2026-11')
  })
  it('vencimento no mês seguinte ao fechamento (vence 8, fecha 30)', () => {
    expect(compDaCompra(C, '2026-10-28')).toBe('2026-11')
    expect(compDaCompra(C, '2026-10-30')).toBe('2026-12')
  })
  it('mover de fatura (ajuste) soma meses', () => {
    expect(compDaCompra(A, '2026-10-28', 1)).toBe('2026-12')
    expect(compDaCompra(A, '2026-10-28', -1)).toBe('2026-10')
  })
})

describe('assinaturas', () => {
  it('só cobra a partir de cobrada_desde', () => {
    const a = { dia_cobranca: 5, cobrada_desde: '2026-11-01' }
    expect(cobrancaNoMes(a, '2026-10')).toBe(null)
    expect(cobrancaNoMes(a, '2026-11')).toBe('2026-11-05')
  })
  it('não duplica com o ajuste manual feito antes de cadastrar', () => {
    const f = faturaDoCartao(A, '2026-11', dados(), HOJE)
    expect(f.itens.filter((i) => i.tipo === 'assinatura')).toHaveLength(0) // a cobrança de 05/11 cai em dez
    expect(f.itens.find((i) => i.id === 'g6')).toBeTruthy()                 // o ajuste à mão fica em nov
  })
})

describe('fatura', () => {
  it('novembro do cartão A: compras de outubro + parcela + ajuste (sem as de novembro)', () => {
    const f = faturaDoCartao(A, '2026-11', dados(), HOJE)
    expect(f.total).toBe(175)               // 100 + 30 + 25 + 20
    expect(f.totalTerceiros).toBe(30)
    expect(f.status).toBe('paga')
  })
  it('dezembro do cartão A já tem o dia do fechamento, a movida, a parcela e a assinatura', () => {
    const f = faturaDoCartao(A, '2026-12', dados(), HOJE)
    expect(f.total).toBe(195)               // 40 + 60 + 50 + 25 + 20
    expect(f.status).toBe('aberta')
  })
  it('fatura a pagar x aberta', () => {
    const b = faturasDoCartaoAgora(B, dados(), HOJE)
    expect(b.aberta.comp).toBe('2026-11')   // fecha 18, vence 25: ainda aberta
    expect(b.aberta.total).toBe(90)
    expect(b.aPagar).toBe(null)
    const fechada = faturaDoCartao(B, '2026-11', dados(), '2026-11-20')
    expect(fechada.status).toBe('fechada')
    expect(faturaDoCartao(B, '2026-11', dados(), '2026-11-26').status).toBe('atrasada')
  })
  it('limite: o que ainda não foi pago (inclui parcela futura)', () => {
    expect(limiteComprometido(A, dados(), HOJE)).toBe(195)
  })
})

describe('resumo do mês (caixa pelo vencimento)', () => {
  const r = resumoMes('2026-11', dados(), { hoje: HOJE })
  it('entradas', () => {
    expect(r.entradasPrevistas).toBe(3570)
    expect(r.entradasRecebidas).toBe(3070)
  })
  it('saídas, pago e a pagar', () => {
    expect(r.totalSaidas).toBe(1961)
    expect(r.pago).toBe(1230)
    expect(r.aPagar).toBe(731)
  })
  it('saldo do mês e sobra (quanto posso gastar)', () => {
    expect(r.saldoDoMes).toBe(1840)
    expect(r.sobraDoMes).toBe(1609)
    expect(r.diasRestantes).toBe(15)
    expect(r.porDia).toBe(107.27)
  })
  it('fatura do mês que vem já lançada', () => {
    expect(r.faturaMesQueVem).toBe(205)
  })
  it('compra de outra pessoa sai no dinheiro mas não no meu gasto', () => {
    expect(r.terceirosNoMes).toBe(70)
    const mg = meuGastoDoMes('2026-11', dados())
    expect(mg.total).toBe(1791)
    expect(mg.porCategoria.saude.total).toBe(300) // só o plano; as 2 compras de outra pessoa não entram
  })
})

describe('orçamento', () => {
  it('auto: categoria paga mais no cartão vira "cartao"', () => {
    const d = dados()
    expect(pagoComResolvido({ categoria: 'mercado', pago_com: 'auto' }, d.gastos, HOJE)).toBe('cartao')
    expect(pagoComResolvido({ categoria: 'transporte', pago_com: 'auto' }, d.gastos, HOJE)).toBe('avista')
  })
  it('separando o orçamento: só o que é pago à vista sai do livre', () => {
    const d = dados()
    d.orcamentos = [
      { categoria: 'transporte', valor: 500, pago_com: 'auto' }, // à vista: gastou 200, falta 300
      { categoria: 'mercado', valor: 600, pago_com: 'auto' },    // cartão: gastou 120 (nov), falta 480 -> vai pra fatura
    ]
    const r = resumoMes('2026-11', d, { hoje: HOJE })
    expect(r.reservaAvista).toBe(300)
    expect(r.livreSeparandoOrcamento).toBe(1309)
    expect(r.faturaMesQueVemEstimada).toBe(685) // 205 + 480
  })
})
