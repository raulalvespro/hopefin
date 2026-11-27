// Joca: gasto de OUTRA PESSOA pelo WhatsApp (26/11/2026) — "foi da Jack" vai pro A receber.
import { describe, it, expect } from 'vitest'
import { limparIA, pessoaDoGasto, emDuvida, paraSalvar, resumoLancamento, linhaItem, pendenteParaIA } from '../supabase/functions/whatsapp-webhook/joca.js'

const ctx = { texto: 'mercado 120 da jack', hoje: '2026-11-26', categorias: ['alimentacao', 'outros'], cartoes: [{ id: 'c1', nome: 'Nubank' }],
  pessoas: ['Jack', 'Raifran', 'Mãe'], membros: ['Raul Erickson', 'Larissa'] }

describe('pessoaDoGasto', () => {
  it('usa o nome do cadastro mesmo com maiúscula/acento diferente', () => {
    expect(pessoaDoGasto('jack', ctx)).toEqual({ pessoa: 'Jack', pessoa_nova: false })
    expect(pessoaDoGasto('mae', ctx)).toEqual({ pessoa: 'Mãe', pessoa_nova: false })
  })
  it('pessoa nova fica marcada como nova', () => {
    expect(pessoaDoGasto('eberlania', ctx)).toEqual({ pessoa: 'Eberlania', pessoa_nova: true })
  })
  it('membro da família no app não vira "outra pessoa"', () => {
    expect(pessoaDoGasto('Larissa', ctx).pessoa).toBe(null)
    expect(pessoaDoGasto('raul', ctx).pessoa).toBe(null)
  })
  it('vazio = ninguém', () => {
    expect(pessoaDoGasto(null, ctx).pessoa).toBe(null)
    expect(pessoaDoGasto('   ', ctx).pessoa).toBe(null)
  })
})

describe('limparIA com pessoa', () => {
  it('gasto da Jack (já cadastrada) salva com pessoa e não precisa perguntar', () => {
    const d = limparIA({ acao: 'lancar', tipo: 'gasto', valor: 120, descricao: 'Mercado', categoria: 'alimentacao', pessoa: 'jack', confianca: 0.9 }, ctx)
    expect(d.pessoa).toBe('Jack')
    expect(emDuvida(d)).toBe(false)
    expect(paraSalvar(d).pessoa_nome).toBe('Jack')
    expect(resumoLancamento(d, ctx.hoje)).toContain('👤 De Jack · vai pro A receber')
  })
  it('pessoa nova pergunta antes ("tá certo?")', () => {
    const d = limparIA({ acao: 'lancar', tipo: 'gasto', valor: 50, descricao: 'Lanche', pessoa: 'Jak', confianca: 0.95 }, ctx)
    expect(d.pessoa_nova).toBe(true)
    expect(emDuvida(d)).toBe(true)
  })
  it('entrada nunca tem pessoa', () => {
    const d = limparIA({ acao: 'lancar', tipo: 'entrada', valor: 100, descricao: 'Reembolso', pessoa: 'Jack', confianca: 0.9 }, ctx)
    expect(d.pessoa).toBe(null)
    expect(paraSalvar(d).pessoa_nome).toBe(null)
  })
  it('gasto sem pessoa continua igual', () => {
    const d = limparIA({ acao: 'lancar', tipo: 'gasto', valor: 30, descricao: 'Uber', confianca: 0.9 }, ctx)
    expect(d.pessoa).toBe(null)
    expect(paraSalvar(d).pessoa_nome).toBe(null)
    expect(resumoLancamento(d, ctx.hoje)).not.toContain('👤')
  })
  it('vários: cada item com a sua pessoa', () => {
    const d = limparIA({ acao: 'lancar_varios', confianca: 0.9, itens: [
      { tipo: 'gasto', valor: 300, descricao: 'Mercado' },
      { tipo: 'gasto', valor: 80, descricao: 'Farmácia', pessoa: 'raifran' },
    ] }, ctx)
    expect(d.itens.map((i) => i.pessoa)).toEqual([null, 'Raifran'])
    expect(linhaItem(d.itens[1], 2, ctx.hoje)).toContain('👤 Raifran')
  })
  it('o "pendente" leva a pessoa pra IA', () => {
    expect(pendenteParaIA({ tipo: 'gasto', valor: 1, pessoa: 'Jack' }).pessoa).toBe('Jack')
  })
})
