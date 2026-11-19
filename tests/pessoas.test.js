// A3.3 (19/11/2026): pessoas da mais usada pra menos usada no "foi de outra pessoa".
import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({ supabase: {} }))
const { ordenarPorUso } = await import('../src/hooks/usePessoas.js')

describe('pessoas por uso', () => {
  const ps = [{ id: 'a', nome: 'Ana' }, { id: 'p', nome: 'Pai' }, { id: 'j', nome: 'Jacqueline' }, { id: 'b', nome: 'Bia' }]
  it('mais usada primeiro, empate em ordem alfabética', () => {
    const ordem = ordenarPorUso(ps, ['p', 'j', 'p', null, 'j', 'p']).map((x) => x.nome)
    expect(ordem).toEqual(['Pai', 'Jacqueline', 'Ana', 'Bia'])
  })
  it('sem uso nenhum: alfabética', () => {
    expect(ordenarPorUso(ps, []).map((x) => x.nome)).toEqual(['Ana', 'Bia', 'Jacqueline', 'Pai'])
  })
  it('não mexe na lista original', () => {
    const copia = [...ps]
    ordenarPorUso(ps, ['b'])
    expect(ps).toEqual(copia)
  })
})
