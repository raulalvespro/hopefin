// Testes do motor único (supabase/functions/_shared/motor.js).
// Casos inventados que reproduzem o que a conciliação de novembro/2026 encontrou:
// compra no dia do fechamento, assinatura x ajuste manual, compra movida de fatura,
// compra de outra pessoa (dinheiro x meu gasto), fatura paga, cofrinho.
import { describe, it, expect } from 'vitest'
import {
  compDaCompra, cobrancaNoMes, faturaDoCartao, faturasDoCartaoAgora, limiteComprometido,
  resumoMes, meuGastoDoMes, addMeses, dataNoMes, pagoComResolvido, contasAVencer,
  itensDeTerceiros, reembolsosPrevistos, compDe, dataDeCompraNaFatura, primeiroVencimentoParcelado,
  planoMoverParcelas, assinaturaConta, pendentesDoMes, partesDeOutros,
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
      { id: 'g4', cartao_id: 'A', data: '2026-10-25', valor: 30, categoria: 'saude', pessoa_id: 'P1', reembolso_status: 'quitado' }, // de outra pessoa (já devolveu: e3)
      { id: 'g5', cartao_id: 'A', data: '2026-10-28', valor: 50, categoria: 'casa', fatura_ajuste: 1 }, // movida -> dez
      { id: 'g6', cartao_id: 'A', data: '2026-10-13', valor: 20, categoria: 'assinaturas' },      // "ajuste assinaturas" à mão
      { id: 'g7', cartao_id: 'B', data: '2026-11-10', valor: 80, categoria: 'mercado' },
      { id: 'g8', cartao_id: null, tipo_pagamento: 'pix', data: '2026-11-09', valor: 200, categoria: 'transporte' },
      { id: 'g9', cartao_id: null, tipo_pagamento: 'pix', data: '2026-11-20', valor: 50, categoria: 'lazer' },
      { id: 'g10', cartao_id: null, tipo_pagamento: 'pix', data: '2026-11-05', valor: 40, categoria: 'saude', pessoa_id: 'P1', reembolso_status: 'quitado' },
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
  it('cancelada (A8.3): cobra até cancelada_em e para depois; as cobranças antigas continuam', () => {
    const a = { dia_cobranca: 5, cobrada_desde: '2026-09-01', ativo: false, cancelada_em: '2026-11-20' }
    expect(cobrancaNoMes(a, '2026-10')).toBe('2026-10-05')
    expect(cobrancaNoMes(a, '2026-11')).toBe('2026-11-05')
    expect(cobrancaNoMes(a, '2026-12')).toBe(null)
    expect(assinaturaConta(a)).toBe(true)
  })
  it('cancelada no meio da fatura: a cobrança de antes fica na fatura do cartão', () => {
    const d = dados()
    d.assinaturas = [{ id: 'ax', nome: 'Streaming', cartao_id: 'B', dia_cobranca: 10, valor: 30, ativo: false, cobrada_desde: '2026-10-01', cancelada_em: '2026-11-12' }]
    // B fecha 18, vence 25: a cobrança de 10/11 cai na fatura de nov; a de 10/12 já não existe
    expect(faturaDoCartao(B, '2026-11', d, HOJE).itens.filter((i) => i.id === 'ax').map((i) => i.data)).toEqual(['2026-11-10'])
    expect(faturaDoCartao(B, '2026-12', d, HOJE).itens.filter((i) => i.id === 'ax')).toHaveLength(0)
  })
  it('removida sem data (lancei errado) some de todos os meses, como antes', () => {
    const d = dados()
    d.assinaturas = [{ id: 'ay', nome: 'Errada', cartao_id: 'B', dia_cobranca: 10, valor: 30, ativo: false, cobrada_desde: '2026-10-01' }]
    expect(assinaturaConta(d.assinaturas[0])).toBe(false)
    expect(faturaDoCartao(B, '2026-11', d, HOJE).itens.filter((i) => i.id === 'ay')).toHaveLength(0)
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

describe('contas a vencer (avisos por e-mail e push)', () => {
  const resumo = (l) => l.map((i) => [i.tipo, i.nome, i.venc, i.valor])

  it('entra a fatura do cartão que vence na janela; o que já foi pago fica de fora', () => {
    // Itaú (A): fatura de nov paga · Aluguel: pago · Seguro app (sem cartão): pago em nov
    expect(resumo(contasAVencer(dados(), '2026-11-01', '2026-11-30', { hoje: HOJE }))).toEqual([
      ['parcela', 'Parcela', '2026-11-20', 291],
      ['fatura', 'Fatura Nubank', '2026-11-25', 90],
      ['conta_fixa', 'Plano de saúde', '2026-11-30', 300],
    ])
  })
  it('janela que cruza o mês (30/11 a 09/12)', () => {
    expect(resumo(contasAVencer(dados(), '2026-11-30', '2026-12-09', { hoje: '2026-11-30' }))).toEqual([
      ['conta_fixa', 'Plano de saúde', '2026-11-30', 300],
      ['assinatura', 'Seguro app', '2026-12-03', 15],
      ['fatura', 'Fatura Itaú', '2026-12-09', 195],
    ])
  })
  it('fatura marcada como paga não gera aviso', () => {
    expect(contasAVencer(dados(), '2026-11-09', '2026-11-10', { hoje: '2026-11-09' })).toEqual([])
  })
  it('cartão desativado não gera aviso de fatura', () => {
    const d = dados()
    d.cartoes = [A, { ...B, ativo: false }]
    expect(contasAVencer(d, '2026-11-01', '2026-11-30', { hoje: HOJE }).map((i) => i.tipo)).toEqual(['parcela', 'conta_fixa'])
  })
})

describe('reembolso previsto e A Receber por mês (A1.13 / A1.14)', () => {
  // Jack: compra no cartão A em 10/11 (A fecha dia 2 → fatura de dez), pix em 12/11,
  // parcela de nov no cartão B e uma de out já recebida. Raifran: parte da luz lançada à mão.
  function comTerceiros() {
    const d = dados()
    d.gastos.push(
      { id: 't1', cartao_id: 'A', data: '2026-11-10', valor: 80, categoria: 'lazer', pessoa_id: 'P2', pessoa_nome: 'Jack' },
      { id: 't2', cartao_id: null, tipo_pagamento: 'pix', data: '2026-11-12', valor: 30, categoria: 'saude', pessoa_id: 'P2', pessoa_nome: 'Jack' },
    )
    d.parcelas.push(
      { id: 't3', cartao_id: 'B', data_vencimento: '2026-11-25', valor: 50, numero: 3, num_parcelas: 10, pessoa_id: 'P2', pessoa_nome: 'Jack' },
      { id: 't4', cartao_id: 'B', data_vencimento: '2026-10-25', valor: 50, numero: 2, num_parcelas: 10, pessoa_id: 'P2', pessoa_nome: 'Jack', recebido: true },
    )
    d.aReceber = [{ id: 'm1', pessoa_id: 'P3', pessoa_nome: 'Raifran', descricao: 'parte da luz', valor: 120, data: '2026-11-10', recebido: false, conta_fixa_id: 'f9', conta_fixa_nome: 'Luz' }]
    return d
  }
  const quitarTudo = (d) => {
    for (const g of d.gastos) if (g.pessoa_id) g.reembolso_status = 'quitado'
    for (const p of d.parcelas) if (p.pessoa_id) p.recebido = true
    for (const m of d.aReceber) m.recebido = true
    return d
  }

  it('mês de cada item = mês em que o dinheiro sai (fatura, parcela, pix, data do lançado à mão)', () => {
    const porId = Object.fromEntries(itensDeTerceiros(comTerceiros()).map((i) => [i.id, i]))
    expect(porId.t1.comp).toBe('2026-12')                // cartão: vai na fatura que vence em dez
    expect(porId.t1.dataSaida).toBe('2026-12-09')
    expect(porId.t2.comp).toBe('2026-11')                // pix: data da compra
    expect(porId.t3.comp).toBe('2026-11')                // parcela: mês da parcela
    expect(porId.t3.origem).toEqual({ tipo: 'cartao', cartaoId: 'B', cartaoNome: 'Nubank' })
    expect(porId.m1.origem).toEqual({ tipo: 'conta_fixa', contaFixaId: 'f9', contaFixaNome: 'Luz' })
  })
  it('previsto por pessoa no mês; o que já foi recebido fica de fora', () => {
    const nov = reembolsosPrevistos('2026-11', comTerceiros())
    expect(nov.map((p) => [p.pessoaNome, p.total, p.itens.length])).toEqual([['Raifran', 120, 1], ['Jack', 80, 2]])
    expect(reembolsosPrevistos('2026-12', comTerceiros()).map((p) => [p.pessoaNome, p.total])).toEqual([['Jack', 80]])
    expect(reembolsosPrevistos('2026-10', comTerceiros())).toEqual([]) // a de out já foi recebida
  })
  it('o previsto entra no "vai sobrar", não no saldo do mês', () => {
    const com = resumoMes('2026-11', comTerceiros(), { hoje: HOJE })
    const sem = resumoMes('2026-11', quitarTudo(comTerceiros()), { hoje: HOJE })
    expect(com.entradas.filter((e) => e.origem === 'reembolso_previsto').map((e) => e.descricao)).toEqual(['A receber de Raifran', 'A receber de Jack'])
    expect(com.sobraDoMes - sem.sobraDoMes).toBeCloseTo(200, 2)
    expect(com.saldoDoMes).toBe(sem.saldoDoMes)
    expect(com.aReceber - sem.aReceber).toBeCloseTo(200, 2)
  })
  it('quando a pessoa paga, vira entrada de verdade e não conta 2x', () => {
    const pago = quitarTudo(comTerceiros())
    pago.entradas.push({ id: 'e9', descricao: 'Reembolso · Jack (2 itens)', valor: 80, data: '2026-11-20', recebido: true, origem: 'reembolso' })
    pago.aReceber[0].recebido = false // Raifran ainda não pagou
    const r = resumoMes('2026-11', pago, { hoje: HOJE })
    const previstos = r.entradas.filter((e) => e.origem === 'reembolso_previsto')
    expect(previstos.map((e) => [e.descricao, e.valor])).toEqual([['A receber de Raifran', 120]])
    expect(r.entradasPrevistas).toBe(3570 + 80 + 120) // as do mês + o reembolso real + o previsto
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

describe('cartão: parcelado novo, valor inicial e mover parcela (A2.5 / A2.7 / A2.9)', () => {
  const AMZ = { id: 'Z', nome: 'Amazon', dia_fechamento: 26, dia_vencimento: 10 } // vence no mês seguinte ao fechamento
  const F1 = { id: 'F1', nome: 'Fecha dia 1', dia_fechamento: 1, dia_vencimento: 8 }
  const F31 = { id: 'F31', nome: 'Fecha dia 31', dia_fechamento: 31, dia_vencimento: 7 }
  const B_ATUAL = { ...B, id: 'BA', compra_no_fechamento: 'atual' }

  it('parcelado no cartão: a 1ª parcela cai na fatura da compra (igual à compra à vista)', () => {
    expect(primeiroVencimentoParcelado(AMZ, '2026-11-12')).toBe('2026-12-10') // fecha 26/11, vence 10/12
    expect(primeiroVencimentoParcelado(AMZ, '2026-11-26')).toBe('2027-01-10') // no dia do fechamento -> próxima
    expect(primeiroVencimentoParcelado(A, '2026-11-10')).toBe('2026-12-09')
    expect(primeiroVencimentoParcelado(A, '2026-11-10', 1)).toBe('2027-01-09') // trocou a fatura no lançamento
    expect(primeiroVencimentoParcelado(A, '2026-11-10', -1)).toBe('2026-11-09')
    for (const c of [A, B, C, AMZ, F1, F31, B_ATUAL]) {
      for (const d of ['2026-01-31', '2026-02-27', '2026-02-28', '2026-11-01', '2026-11-18', '2026-11-30', '2026-12-31']) {
        expect(compDe(primeiroVencimentoParcelado(c, d))).toBe(compDaCompra(c, d))
      }
    }
  })

  // O WhatsApp faz esta mesma conta em SQL (public.vencimento_fatura_por_dias, migração 0063),
  // conferida dia a dia contra o motor em 19/11/2026. Mudou a regra? Mude lá também.
  it('parcelado no cartão: viradas e fim de mês (mesmos casos do SQL do WhatsApp)', () => {
    expect(primeiroVencimentoParcelado(C, '2027-01-31')).toBe('2027-03-08') // fecha 30/01: 31/01 já é da próxima
    expect(primeiroVencimentoParcelado(C, '2027-02-28')).toBe('2027-04-08') // fevereiro não tem 30: fecha 28/02
    expect(primeiroVencimentoParcelado(C, '2028-02-28')).toBe('2028-03-08') // ano bissexto: fecha 29/02
    expect(primeiroVencimentoParcelado(F31, '2026-11-29')).toBe('2026-12-07')
    expect(primeiroVencimentoParcelado(F31, '2026-11-30')).toBe('2027-01-07') // novembro fecha no dia 30
    expect(primeiroVencimentoParcelado(F1, '2026-10-31')).toBe('2026-11-08')
    expect(primeiroVencimentoParcelado(F1, '2026-11-01')).toBe('2026-12-08')
    expect(primeiroVencimentoParcelado(B, '2026-11-18')).toBe('2026-12-25')
    expect(primeiroVencimentoParcelado(B_ATUAL, '2026-11-18')).toBe('2026-11-25') // regra 'atual' segura o dia
    expect(primeiroVencimentoParcelado({ id: 'V31', dia_fechamento: 20, dia_vencimento: 31 }, '2026-10-25')).toBe('2026-11-30') // vence 31 em mês de 30 dias
    expect(primeiroVencimentoParcelado({ id: 'SEM' }, '2026-11-01')).toBe('2026-12-10') // sem dias: fecha 1, vence 10
  })

  it('valor inicial do cartão novo: a data usada cai na fatura pedida', () => {
    for (const c of [A, B, C, AMZ, F1, F31, B_ATUAL]) {
      for (const comp of ['2026-01', '2026-02', '2026-03', '2026-11', '2026-12', '2027-01', '2028-03']) {
        expect(compDaCompra(c, dataDeCompraNaFatura(c, comp))).toBe(comp)
      }
    }
    // Nubank fecha 18: a fatura fechada que vence 25/11 recebe a compra de 17/11
    expect(dataDeCompraNaFatura(B, '2026-11')).toBe('2026-11-17')
  })

  describe('mover parcela leva as seguintes', () => {
    // caso "Receitas": a 1/4 e a 2/4 caíram juntas na fatura de novembro
    const parc = [
      { id: 'r1', numero: 1, data_vencimento: '2026-11-25' },
      { id: 'r2', numero: 2, data_vencimento: '2026-11-25' },
      { id: 'r3', numero: 3, data_vencimento: '2026-12-25' },
      { id: 'r4', numero: 4, data_vencimento: '2027-01-25' },
    ]
    const pagaOut = [{ tipo: 'fatura', referencia_id: 'B', competencia: '2026-10', pago: true }]
    const mover = (parcelaId, delta, contasPagas = pagaOut) =>
      planoMoverParcelas({ cartao: B, parcelas: parc, parcelaId, delta, contasPagas, diaBase: 25 })

    it('pra frente: a parcela e as seguintes andam uma fatura; as anteriores ficam', () => {
      const p = mover('r2', 1)
      expect(p.ok).toBe(true)
      expect(p.mudancas.map((m) => [m.id, m.de, m.para])).toEqual([
        ['r2', '2026-11-25', '2026-12-25'], ['r3', '2026-12-25', '2027-01-25'], ['r4', '2027-01-25', '2027-02-25'],
      ])
    })
    it('pra trás: as seguintes voltam junto', () => {
      expect(mover('r3', -1).mudancas.map((m) => [m.id, m.para])).toEqual([['r3', '2026-11-25'], ['r4', '2026-12-25']])
    })
    it('parcela de fatura já paga não sai, e nenhuma entra em fatura paga', () => {
      const pagaNov = [...pagaOut, { tipo: 'fatura', referencia_id: 'B', competencia: '2026-11', pago: true }]
      expect(mover('r2', 1, pagaNov)).toMatchObject({ ok: false, motivo: 'fatura_paga', mudancas: [] })
      expect(mover('r3', -1, pagaNov)).toMatchObject({ ok: false, motivo: 'destino_pago', mudancas: [] })
      // fatura paga de OUTRO cartão não atrapalha
      expect(mover('r2', 1, [{ tipo: 'fatura', referencia_id: 'A', competencia: '2026-11', pago: true }]).ok).toBe(true)
    })
    it('uma seguinte que iria pra fatura paga fica onde está (e é contada)', () => {
      const pagaFev = [{ tipo: 'fatura', referencia_id: 'B', competencia: '2027-02', pago: true }]
      const p = mover('r2', 1, pagaFev)
      expect(p.mudancas.map((m) => m.id)).toEqual(['r2', 'r3'])
      expect(p.ficaram).toBe(1)
    })
    it('dia 31 não encolhe pra sempre (usa o dia da 1ª parcela)', () => {
      const fev = [{ id: 'x1', numero: 1, data_vencimento: '2027-02-28' }, { id: 'x2', numero: 2, data_vencimento: '2027-03-31' }]
      const p = planoMoverParcelas({ cartao: B, parcelas: fev, parcelaId: 'x1', delta: 1, contasPagas: [], diaBase: 31 })
      expect(p.mudancas.map((m) => m.para)).toEqual(['2027-03-31', '2027-04-30'])
    })
    it('parcela que não existe ou passo zero: nada muda', () => {
      expect(mover('zz', 1).ok).toBe(false)
      expect(mover('r2', 0).ok).toBe(false)
    })
  })
})

describe('contas que ficaram sem pagar (A8.13)', () => {
  it('lista fatura, conta fixa e parcela sem cartão não pagas; o que foi pago fica de fora', () => {
    const d = dados()
    const p = pendentesDoMes('2026-11', d, { hoje: '2026-12-02' })
    expect(p.map((x) => `${x.tipo}:${x.id}`)).toEqual(['parcela:p3', 'fatura:B', 'fixa:f2'])
    expect(p.find((x) => x.tipo === 'fixa').valor).toBe(300)
    expect(p.every((x) => x.comp === '2026-11')).toBe(true)
    // fatura A, aluguel e a assinatura sem cartão estavam pagas
    expect(p.some((x) => x.id === 'A' || x.id === 'f1' || x.id === 'a3')).toBe(false)
  })

  it('marcou como paga depois (no mês de origem): sai da lista', () => {
    const d = dados()
    d.fixasLanc.push({ conta_fixa_id: 'f2', competencia: '2026-11', valor_real: 310, pago: true })
    d.contasPagas.push({ tipo: 'fatura', referencia_id: 'B', competencia: '2026-11', pago: true })
    d.parcelas.find((x) => x.id === 'p3').paga = true
    expect(pendentesDoMes('2026-11', d, { hoje: '2026-12-02' })).toEqual([])
  })
})

describe('conta dividida e pago por conta (A8.6 / A8.4)', () => {
  it('só a SUA parte entra no seu gasto; a fatura continua com o total', () => {
    const d = dados()
    d.parcelas.find((p) => p.id === 'p3').parcelamento_id = 'pm3'
    d.partes = [
      { gasto_id: 'g8', valor: 50, data: '2026-11-09' },                                 // pix de 200: 50 é do Jack
      { parcelamento_id: 'pm3', parcela_num: 10, valor: 97, data: '2026-11-20' },         // 1/3 da parcela 10
      { conta_fixa_id: 'f2', valor: 150, data: '2026-11-30' },                            // metade do plano
    ]
    const antes = meuGastoDoMes('2026-11', dados())
    const depois = meuGastoDoMes('2026-11', d)
    expect(antes.porCategoria.transporte.total).toBe(200)
    expect(depois.porCategoria.transporte.total).toBe(150)
    expect(depois.porCategoria.moradia.total).toBe(antes.porCategoria.moradia.total - 97)
    expect(depois.porCategoria.saude.total).toBe(antes.porCategoria.saude.total - 150)
    // o dinheiro do mês (caixa) não muda: a fatura e o pagamento são o total
    expect(resumoMes('2026-11', d, { hoje: HOJE }).totalSaidas).toBe(resumoMes('2026-11', dados(), { hoje: HOJE }).totalSaidas)
    expect(partesDeOutros({ partes: [{ gasto_id: 'x', valor: -30 }] }).gasto.size).toBe(0) // "pago por conta" não conta
  })

  it('"pago por conta" abate o previsto da pessoa no mês em que ela pagou', () => {
    const d = dados()
    d.aReceber = [
      { id: 'm1', pessoa_id: 'P9', pessoa_nome: 'Jack', descricao: 'Lanche (parte)', valor: 100, data: '2026-11-10', recebido: false, gasto_id: 'g8' },
      { id: 'm2', pessoa_id: 'P9', pessoa_nome: 'Jack', descricao: 'Pago por conta', valor: -60, data: '2026-11-15', recebido: false, por_conta: true },
    ]
    const jack = reembolsosPrevistos('2026-11', d).find((p) => p.pessoaId === 'P9')
    expect(jack.total).toBe(40)
    const itens = itensDeTerceiros(d).filter((i) => i.pessoaId === 'P9')
    expect(itens.map((i) => i.origem.tipo).sort()).toEqual(['dividida', 'por_conta'])
  })
})

describe('assinatura dividida (A8.6)', () => {
  it('só a sua parte da assinatura entra no seu gasto; a parte fica no mês da fatura', () => {
    const d = dados()
    // a1 (Internet, R$ 20 no cartão A, dia 5): cobrança de 05/11 cai na fatura que vence 09/12
    d.partes = [{ assinatura_id: 'a1', valor: 10, data: '2026-12-09' }, { assinatura_id: 'a1', valor: 10, data: '2026-11-09' }]
    const item = (x) => meuGastoDoMes('2026-11', x).itens.find((i) => i.tipo === 'assinatura' && i.id === 'a1')
    expect(item(dados()).valor).toBe(20)
    expect(item(d).valor).toBe(10)
  })
})
