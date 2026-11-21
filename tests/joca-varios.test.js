// Joca no WhatsApp — vários lançamentos numa mensagem (21/11/2026).
import { describe, it, expect } from 'vitest'
import { limparIA, editarLista, lerValor, TEXTOS_VARIOS, VARIOS_MAX, ACOES } from '../supabase/functions/whatsapp-webhook/joca.js'

const HOJE = '2026-11-21'
const CARTOES = [{ id: 'c1', nome: 'Nubank' }]
const CATS = ['mercado', 'saude', 'transporte', 'outros']
const ITENS = [
  { tipo: 'gasto', valor: 300, descricao: 'Mercado', forma: 'pix', data: HOJE, parcelas: 1 },
  { tipo: 'gasto', valor: 80, descricao: 'Farmácia', forma: 'dinheiro', data: HOJE, parcelas: 1 },
  { tipo: 'gasto', valor: 25, descricao: 'Uber', forma: 'pix', data: '2026-11-20', parcelas: 1 },
]

describe('IA: lancar_varios', () => {
  it('é uma ação conhecida e cada item passa pela mesma limpeza', () => {
    expect(ACOES).toContain('lancar_varios')
    const d = limparIA({
      acao: 'lancar_varios', confianca: 0.9,
      itens: [
        { tipo: 'gasto', valor: 300, descricao: 'mercado', categoria: 'mercado', forma: 'pix' },
        { tipo: 'gasto', valor: 80, descricao: 'farmácia', categoria: 'saude', forma: 'dinheiro' },
        { tipo: 'gasto', valor: 55, descricao: 'netflix', cartao_id: 'c1', categoria: 'inventada' },
        { tipo: 'gasto', valor: 0, descricao: 'sem valor' },
        { tipo: 'gasto', valor: 20, descricao: 'x', cartao_id: 'cartao-que-nao-existe' },
      ],
    }, { texto: 'lista', hoje: HOJE, categorias: CATS, cartoes: CARTOES })
    expect(d.acao).toBe('lancar_varios')
    expect(d.itens).toHaveLength(4) // o sem valor sai
    expect(d.itens[1].forma).toBe('dinheiro')
    expect(d.itens[2]).toMatchObject({ cartao_id: 'c1', cartao_nome: 'Nubank', forma: null, categoria: 'outros' })
    expect(d.itens[3].cartao_id).toBeNull() // cartão fora da lista não passa
    expect(d.itens[0].descricao).toBe('Mercado')
  })
  it('lançamento único não traz itens', () => {
    const d = limparIA({ acao: 'lancar', tipo: 'gasto', valor: 10, descricao: 'pão' }, { texto: 'pão 10', hoje: HOJE, categorias: CATS, cartoes: [] })
    expect(d.itens).toBeNull()
  })
})

describe('correção da lista sem IA', () => {
  it('tira um item', () => {
    expect(editarLista('tira o 2', ITENS).itens.map(i => i.descricao)).toEqual(['Mercado', 'Uber'])
    expect(editarLista('Remove 1', ITENS).itens).toHaveLength(2)
  })
  it('troca o valor de um item', () => {
    expect(editarLista('o 3 é 70', ITENS).itens[2].valor).toBe(70)
    expect(editarLista('3 era 1.200,50', ITENS).itens[2].valor).toBe(1200.5)
    expect(editarLista('o 1 = R$ 45,90', ITENS).itens[0].valor).toBe(45.9)
  })
  it('número que não existe avisa; frase que não é edição volta null', () => {
    expect(editarLista('tira o 9', ITENS)).toEqual({ erro: 'numero', n: 9 })
    expect(editarLista('mercado 50', ITENS)).toBeNull()
    expect(editarLista('sim', ITENS)).toBeNull()
  })
  it('lê valor brasileiro', () => {
    expect([lerValor('70'), lerValor('70,5'), lerValor('1.200,50'), lerValor('abc')]).toEqual([70, 70.5, 1200.5, null])
  })
})

describe('mensagens', () => {
  it('lista numerada, uma linha por lançamento, com data só quando não é hoje', () => {
    const m = TEXTOS_VARIOS.pergunta(ITENS, HOJE)
    expect(m).toContain('*3 lançamentos*')
    expect(m).toContain('1. 💸 *R$ 300,00* · Mercado · Pix')
    expect(m).toContain('2. 💸 *R$ 80,00* · Farmácia · Dinheiro')
    expect(m).toContain('3. 💸 *R$ 25,00* · Uber · Pix · 📅 20/11')
    expect(m).toContain('tira o 1')
    expect(m).toContain('o 3 é 70')
  })
  it('muitos manda pro app', () => {
    expect(TEXTOS_VARIOS.muitos(8)).toContain(`até ${VARIOS_MAX}`)
    expect(TEXTOS_VARIOS.muitos(8)).toContain('lancar-varios')
  })
})
