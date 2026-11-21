// Primeiros passos guiados (A8.10): contagem e qual é o próximo passo.
import { describe, it, expect, vi } from 'vitest'
vi.mock('../src/lib/supabase', () => ({ supabase: {} }))
const { montarItens, PASSOS } = await import('../src/lib/primeirosPassos.js')

describe('primeiros passos', () => {
  it('seis passos, na ordem combinada', () => {
    expect(PASSOS.map(p => p.key)).toEqual(['renda', 'gasto', 'cartao', 'conta', 'categorias', 'convidar'])
  })
  it('sem nada feito: o próximo é o 1º', () => {
    const r = montarItens({}, {})
    expect([r.feitos, r.total, r.proximo.key]).toEqual([0, 6, 'renda'])
  })
  it('pula o que foi deixado pra depois', () => {
    const r = montarItens({ renda: true }, { gasto: true })
    expect(r.proximo.key).toBe('cartao')
    expect(r.itens.find(i => i.key === 'gasto').adiado).toBe(true)
  })
  it('se só sobrou o adiado, ele volta a ser o próximo', () => {
    const r = montarItens({ renda: true, cartao: true, conta: true, categorias: true, convidar: true }, { gasto: true })
    expect(r.proximo.key).toBe('gasto')
  })
  it('tudo feito: sem próximo', () => {
    const tudo = Object.fromEntries(PASSOS.map(p => [p.key, true]))
    expect(montarItens(tudo, {}).proximo).toBeNull()
  })
})
