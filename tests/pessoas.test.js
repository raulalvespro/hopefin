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

// A8.5 (19/11/2026): aviso de nome parecido antes de criar pessoa nova.
const { nomesParecidos, pessoasParecidas, nomeNormal } = await import('../src/lib/pessoas.js')

describe('nomes parecidos (A8.5)', () => {
  it('pega os casos do Raul: Jack × Jacqueline × Jak × Jaqueline', () => {
    expect(nomesParecidos('Jack', 'Jacqueline')).toBe(true)
    expect(nomesParecidos('Jak', 'Jack')).toBe(true)
    expect(nomesParecidos('Jaqueline', 'Jacqueline')).toBe(true)
    expect(nomesParecidos('jácqueline', 'Jacqueline')).toBe(true)
  })
  it('não confunde nomes diferentes', () => {
    expect(nomesParecidos('Raifran', 'Rafael')).toBe(false)
    expect(nomesParecidos('Ana', 'Bia')).toBe(false)
    expect(nomesParecidos('Pai', 'Eduarda')).toBe(false)
    expect(nomesParecidos('Eduarda', 'Eduardo')).toBe(true) // 1 letra: melhor perguntar
  })
  it('lista as parecidas sem a idêntica (essa o app reaproveita)', () => {
    const ps = [{ id: 1, nome: 'Jack' }, { id: 2, nome: 'Raifran' }, { id: 3, nome: 'Jacqueline' }]
    expect(pessoasParecidas('Jak', ps).map((p) => p.id)).toEqual([1])
    expect(pessoasParecidas('Jacqueline', ps).map((p) => p.id)).toEqual([1])
    expect(pessoasParecidas('jack', ps).map((p) => p.id)).toEqual([3])
    expect(pessoasParecidas('J', ps)).toEqual([])
  })
  it('normaliza acento, maiúscula e espaço', () => {
    expect(nomeNormal('  Ândréa   Souza ')).toBe('andrea souza')
  })
})
