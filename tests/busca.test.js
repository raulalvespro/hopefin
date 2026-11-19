// A3.1 (19/11/2026): busca que ignora acento/maiúscula e acha pedaço da palavra + filtros.
import { describe, it, expect } from 'vitest'
import { casaTexto, filtrar, filtroVazio, lerValor, qtdFiltros, temFiltro, periodoAtalho, distintos } from '../src/lib/busca.js'

const itens = [
  { id: 1, descricao: 'Supermercado Extra', categoria: 'mercado', origem: 'Nubank', data: '2026-11-03', valor: 250, pessoas: ['Raul'], tipos: ['avista'] },
  { id: 2, descricao: 'Farmácia São João', categoria: 'saude', origem: 'pix', data: '2026-11-10', valor: 48.9, pessoas: ['Larissa'], tipos: ['avista'] },
  { id: 3, descricao: 'Geladeira', categoria: 'eletronico', origem: 'Nubank', data: '2026-11-15', valor: 400, pessoas: ['Raul'], tipos: ['parcela'] },
  { id: 4, descricao: 'Remédio do Pai', categoria: 'saude', origem: 'Itaú', data: '2026-10-28', valor: 80, pessoas: ['Raul', 'Pai'], tipos: ['avista', 'terceiro'] },
]
const ler = (i) => ({ texto: [i.descricao, i.origem, i.categoria, ...i.pessoas], data: i.data, categoria: i.categoria, origem: i.origem, pessoas: i.pessoas, tipos: i.tipos, valor: i.valor })
const ids = (f) => filtrar(itens, { ...filtroVazio(), ...f }, ler).map((i) => i.id)

describe('busca', () => {
  it('ignora acento e maiúscula e acha pedaço da palavra', () => {
    expect(casaTexto('farmacia', ['Farmácia São João'])).toBe(true)
    expect(casaTexto('SAO joao', ['Farmácia São João'])).toBe(true)
    expect(casaTexto('mercado extra', ['Supermercado Extra'])).toBe(true)
    expect(casaTexto('mercado pix', ['Supermercado Extra', 'Nubank'])).toBe(false)
    expect(casaTexto('  ', ['qualquer'])).toBe(true)
  })
  it('procura em todos os campos (cartão, categoria, pessoa)', () => {
    expect(ids({ texto: 'nubank' })).toEqual([1, 3])
    expect(ids({ texto: 'pai' })).toEqual([4])
  })
})

describe('filtros', () => {
  it('período, categoria, forma de pagamento, pessoa, tipo e valor', () => {
    expect(ids({ de: '2026-11-01', ate: '2026-11-30' })).toEqual([1, 2, 3])
    expect(ids({ categorias: ['saude'] })).toEqual([2, 4])
    expect(ids({ origens: ['pix', 'Itaú'] })).toEqual([2, 4])
    expect(ids({ pessoas: ['Larissa', 'Pai'] })).toEqual([2, 4])
    expect(ids({ tipos: ['parcela'] })).toEqual([3])
    expect(ids({ tipos: ['terceiro'] })).toEqual([4])
    expect(ids({ min: '50', max: '300' })).toEqual([1, 4])
    expect(ids({ min: '48,90' })).toEqual([1, 2, 3, 4])
    expect(ids({ texto: 'raul', categorias: ['saude'], max: '100' })).toEqual([4])
  })
  it('conta os filtros ligados e diz se tem algum', () => {
    expect(qtdFiltros({ ...filtroVazio(), de: '2026-11-01', categorias: ['x'], min: '10' })).toBe(3)
    expect(temFiltro(filtroVazio())).toBe(false)
    expect(temFiltro({ ...filtroVazio(), texto: 'a' })).toBe(true)
  })
  it('valor digitado', () => {
    expect(lerValor('9,90')).toBe(9.9)
    expect(lerValor('')).toBe(null)
    expect(lerValor('abc')).toBe(null)
  })
  it('atalhos de período', () => {
    expect(periodoAtalho('mes', '2026-11-19')).toEqual({ de: '2026-11-01', ate: '2026-11-30' })
    expect(periodoAtalho('3m', '2026-02-10')).toEqual({ de: '2025-12-01', ate: '2026-02-28' })
    expect(periodoAtalho('12m', '2026-11-19')).toEqual({ de: '2025-12-01', ate: '2026-11-30' })
  })
  it('opções distintas em ordem', () => {
    expect(distintos(['pix', 'Nubank', '', 'pix', 'Itaú'])).toEqual(['Itaú', 'Nubank', 'pix'])
  })
})
