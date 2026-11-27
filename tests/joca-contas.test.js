// "Paguei a parcela da usina solar" (27/11/2026): o Joca marca conta fixa, parcela sem cartão e assinatura
// fora do cartão como paga — a mesma linha de Contas do mês, achada pelo motor do app.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { contasDoMotor, nomesDeContas, alvoDaConta } from '../supabase/functions/whatsapp-webhook/contas.js'
import { limparIA, contaDaLista, valorPago, TEXTOS, instrucoesIA, ACOES } from '../supabase/functions/whatsapp-webhook/joca.js'

const { contexto: CTX } = JSON.parse(readFileSync(new URL('./joca-casos.json', import.meta.url), 'utf8'))
const H = '2026-11-27'
const parc = (numero, venc, paga) => ({
  id: `p${numero}`, parcelamento_id: 'pl1', descricao: 'Empréstimo usina', num_parcelas: 10, cartao_id: null,
  numero, valor: 95.64, data_vencimento: venc, paga, categoria: 'moradia',
})
const D = {
  ...CTX.dados,
  inicioComp: '2026-06',
  fixas: [
    ...CTX.dados.fixas,
    { id: 'fs', nome: 'Parcela usina solar', valor: 255.02, dia_vencimento: 30, categoria: 'moradia', ativo: true, criado_em: '2026-06-01' },
  ],
  fixasLanc: [
    ...CTX.dados.fixasLanc,
    { conta_fixa_id: 'fs', competencia: '2026-10', valor_real: null, pago: true },
    { conta_fixa_id: 'fs', competencia: '2026-09', valor_real: null, pago: true },
    { conta_fixa_id: 'fs', competencia: '2026-08', valor_real: null, pago: true },
  ],
  parcelas: [parc(4, '2026-10-25', true), parc(5, '2026-11-25', false), parc(6, '2026-12-25', false)],
}
const itens = contasDoMotor(D, H)

describe('contas do mês que o Joca enxerga', () => {
  it('fixas, parcelas sem cartão e assinatura fora do cartão (sem fatura)', () => {
    const nomes = nomesDeContas(itens)
    expect(nomes).toContain('Parcela usina solar')
    expect(nomes).toContain('Empréstimo usina')
    expect(nomes).toContain('Luz')
    expect(itens.some((i) => i.tipo === 'fatura')).toBe(false)
  })
  it('usina solar: a de novembro (vence 30/11), não a de dezembro', () => {
    const r = alvoDaConta(itens, 'parcela usina solar', H)
    expect(r.alvo).toMatchObject({ tipo: 'fixa', id: 'fs', comp: '2026-11', valor: 255.02 })
  })
  it('parcela: a mais antiga sem pagar até este mês', () => {
    const r = alvoDaConta(itens, 'Empréstimo usina', H)
    expect(r.alvo).toMatchObject({ tipo: 'parcela', id: 'p5', comp: '2026-11', numero: 5, total: 10 })
  })
  it('conta em atraso (mês passado sem pagar) vem antes da deste mês', () => {
    const D2 = { ...D, fixasLanc: D.fixasLanc.filter((l) => !(l.conta_fixa_id === 'fs' && l.competencia === '2026-10')) }
    const r = alvoDaConta(contasDoMotor(D2, H), 'Parcela usina solar', H)
    expect(r.alvo).toMatchObject({ comp: '2026-10' })
  })
  it('deste mês já paga: avisa (Aluguel de novembro está paga no exemplo)', () => {
    // grupo começou em outubro: out e nov pagas, nada em atraso
    const r = alvoDaConta(contasDoMotor({ ...D, inicioComp: '2026-10' }, H), 'Aluguel', H)
    expect(r.jaPaga).toMatchObject({ comp: '2026-11', paga: true })
    expect(r.alvo).toBeUndefined()
  })
  it('parcela deste mês paga e a próxima aberta: pagou adiantado (a do mês que vem)', () => {
    const D3 = { ...D, parcelas: [parc(5, '2026-11-25', true), parc(6, '2026-12-25', false)] }
    const r = alvoDaConta(contasDoMotor(D3, H), 'Empréstimo usina', H)
    expect(r.jaPaga).toMatchObject({ comp: '2026-11' })
  })
  it('conta que não existe', () => {
    expect(alvoDaConta(itens, 'Água', H)).toEqual({ nada: true })
  })
})

describe('o que a IA mandou (limparIA)', () => {
  const ctx = { texto: 'x', hoje: H, categorias: CTX.categorias, cartoes: CTX.cartoes, contas: CTX.contas }
  it('pagar_conta é ação conhecida e a conta só vale se estiver na lista', () => {
    expect(ACOES).toContain('pagar_conta')
    expect(limparIA({ acao: 'pagar_conta', conta: 'parcela USINA solar' }, ctx).conta).toBe('Parcela usina solar')
    expect(limparIA({ acao: 'pagar_conta', conta: 'Água' }, ctx).conta).toBe(null)
    expect(limparIA({ acao: 'lancar', conta: 'Luz', valor: 10 }, ctx).conta).toBe(null)
  })
  it('contaDaLista ignora acento e maiúscula', () => {
    expect(contaDaLista('escola das criancas', CTX.contas)).toBe('Escola das crianças')
    expect(contaDaLista('', CTX.contas)).toBe(null)
  })
  it('o prompt explica a ação e o campo conta', () => {
    const p = instrucoesIA({ hoje: H, semana: 'sexta', categorias: CTX.categorias })
    expect(p).toContain('"pagar_conta"')
    expect(p).toContain('- conta:')
  })
})

describe('valor e textos', () => {
  const fixa = { tipo: 'fixa', nome: 'Luz', valor: 200, comp: '2026-11', data: '2026-11-28' }
  const parcela = { tipo: 'parcela', nome: 'Empréstimo usina', valor: 95.64, comp: '2026-11', data: '2026-11-25', numero: 5, total: 10 }
  it('fixa aceita o valor dito; parcela fica com o do app', () => {
    expect(valorPago(fixa, 180)).toBe(180)
    expect(valorPago(fixa, null)).toBe(200)
    expect(valorPago(parcela, 120)).toBe(95.64)
  })
  it('pergunta mostra conta, vencimento e valor', () => {
    const t = TEXTOS.contaPergunta({ conta: parcela }, H)
    expect(t).toContain('*Empréstimo usina*')
    expect(t).toContain('Parcela 5 de 10')
    expect(t).toContain('Venceu 25/11')
    expect(t).toContain('R$ 95,64')
    expect(t).toContain('*sim*')
  })
  it('valor diferente: fixa fica com o dito, parcela avisa', () => {
    expect(TEXTOS.contaPergunta({ conta: fixa, valorDito: 180 }, H)).toContain('fica R$ 180,00 neste mês')
    expect(TEXTOS.contaPergunta({ conta: parcela, valorDito: 120 }, H)).toContain('a parcela no app é R$ 95,64')
  })
  it('em atraso aparece na pergunta', () => {
    expect(TEXTOS.contaPergunta({ conta: { ...fixa, comp: '2026-10', data: '2026-10-28' } }, H)).toContain('ficou em atraso')
  })
  it('confirmação, já paga, nada e qual conta', () => {
    expect(TEXTOS.contaPaga('Raul Erikson', { ...fixa, valorPago: 180 }, H)).toContain('Prontinho, Raul! Conta paga ✅')
    expect(TEXTOS.contaPaga('Raul', { ...fixa, valorPago: 180 }, H)).toContain('R$ 180,00')
    expect(TEXTOS.contaJaPaga(fixa, H)).toContain('já está paga')
    expect(TEXTOS.contaNada('Água')).toContain('*Água*')
    expect(TEXTOS.contaQual(['Luz', 'Aluguel'])).toContain('Suas contas: Luz, Aluguel')
    expect(TEXTOS.contaQual([])).toContain('mercado 120')
  })
})
