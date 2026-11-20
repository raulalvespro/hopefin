import { describe, it, expect } from 'vitest'
import { partesIguais, resumoPartes, dataSaidaGasto, linhasPartesGasto, linhasPartesParcelado, partesDoBanco } from '../src/lib/dividir.js'
import { simularRecebimento, ordemParaReceber } from '../src/lib/receber.js'

const NUBANK = { id: 'C', dia_fechamento: 3, dia_vencimento: 10, compra_no_fechamento: 'proxima' }

describe('dividir conta (A8.6)', () => {
  it('lanche de R$ 80 em 3 (você + 2): 26,66 cada pra eles, os centavos ficam com você', () => {
    expect(partesIguais(80, 2)).toEqual([26.66, 26.66])
    const r = resumoPartes(80, [{ nome: 'Jack', valor: '26.66' }, { nome: 'Raifran', valor: '26,66' }])
    expect(r.soma).toBe(53.32)
    expect(r.minha).toBe(26.68)
    expect(r.excede).toBe(false)
    expect(resumoPartes(50, [{ nome: 'Jack', valor: '60' }]).excede).toBe(true)
  })

  it('a parte fica a receber no mês em que o dinheiro sai (cartão = vencimento da fatura)', () => {
    expect(dataSaidaGasto(NUBANK, '2026-11-19')).toBe('2026-12-10')
    expect(dataSaidaGasto(null, '2026-11-19')).toBe('2026-11-19')
    const l = linhasPartesGasto({ grupoId: 'g', gasto: { id: 'x', descricao: 'Lanche' }, partes: [{ pessoaId: 'p1', valor: 25 }], dataSaida: '2026-12-10' })
    expect(l).toEqual([{ grupo_id: 'g', pessoa_id: 'p1', descricao: 'Lanche (parte)', valor: 25, data: '2026-12-10', gasto_id: 'x', recorrente: false }])
  })

  it('entrada dos terrenos: 1/3 de cada parcela pra cada um, a partir da parcela escolhida', () => {
    const parcelamento = { id: 'pm', descricao: 'Entrada terrenos', valor_total: 900, num_parcelas: 3 }
    const parcelas = [1, 2, 3].map((n) => ({ numero: n, valor: 300, data_vencimento: `2026-${String(9 + n).padStart(2, '0')}-10` }))
    let k = 0
    const linhas = linhasPartesParcelado({
      grupoId: 'g', parcelamento, parcelas, partes: [{ pessoaId: 'jack', valor: 300 }, { pessoaId: 'pai', valor: 300 }],
      aPartirDe: 2, jaRecebidas: new Set(['pai|3']), novoId: () => `s${++k}`,
    })
    expect(linhas.map((l) => `${l.pessoa_id}:${l.parcela_num}:${l.valor}`)).toEqual(['jack:2:100', 'jack:3:100', 'pai:2:100'])
    expect(linhas[0]).toMatchObject({ parcelamento_id: 'pm', parcela_total: 3, serie_id: 's1', data: '2026-11-10', descricao: 'Entrada terrenos (parte)' })
  })

  it('volta pro formulário: parte da parcela vira valor no total', () => {
    const p = partesDoBanco([{ pessoa_id: 'jack', pessoas: { nome: 'Jack' }, valor: 100, valor_parcela: 300 }], { total: 900, parcelado: true })
    expect(p).toEqual([{ nome: 'Jack', valor: '300.00' }])
    // 1/3 de 300 em 3x: a parcela guarda 33,33 → volta 100,00 (fração redonda), não 99,99
    expect(partesDoBanco([{ pessoa_id: 'b', pessoas: { nome: 'Bia' }, valor: 33.33, valor_parcela: 100, parcela_total: 3 }], { total: 300, parcelado: true })).toEqual([{ nome: 'Bia', valor: '100.00' }])
  })
})

describe('receber uma parte (A8.4)', () => {
  const itens = [
    { chave: 'b', comp: '2026-11', dataSaida: '2026-11-20', valor: 100 },
    { chave: 'a', comp: '2026-10', dataSaida: '2026-10-10', valor: 50 },
    { chave: 'c', comp: '2026-11', dataSaida: '2026-11-25', valor: 30 },
  ]

  it('quita do mais antigo pro mais novo e o resto fica "pago por conta"', () => {
    const s = simularRecebimento(itens, 120)
    expect(s.quitados.map((i) => i.chave)).toEqual(['a'])
    expect(s.porConta).toBe(70)
    expect(s.faltam).toBe(60)
    expect(s.parcial).toBe(true)
  })

  it('pagou tudo: quita tudo, nada por conta; o crédito antigo entra primeiro', () => {
    expect(simularRecebimento(itens, 180)).toMatchObject({ porConta: 0, faltam: 0, parcial: false })
    const comCredito = [...itens, { chave: 'cred', comp: '2026-11', valor: -70 }]
    expect(ordemParaReceber(comCredito)[0].chave).toBe('cred')
    const s = simularRecebimento(comCredito, 110) // 180 − 70 de crédito = 110 quita tudo
    expect(s.quitados).toHaveLength(4)
    expect(s.porConta).toBe(0)
  })
})
