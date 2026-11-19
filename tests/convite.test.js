// Convite do grupo (L38, 19/11/2026): mensagens de erro ao entrar pelo código e formato do código.
import { describe, it, expect } from 'vitest'
import { mensagemErroConvite, normalizarCodigo, codigoBonito } from '../src/lib/convite.js'
import { copy } from '../src/copy/pt-BR.js'

describe('convite: mensagens ao entrar no grupo', () => {
  it('código errado, muitas tentativas e grupo cheio têm textos próprios', () => {
    expect(mensagemErroConvite({ message: 'codigo_invalido' })).toBe(copy.cadastro.erroCodigoInvalido)
    expect(mensagemErroConvite({ message: 'muitas_tentativas' })).toBe(copy.cadastro.erroMuitasTentativas)
    expect(mensagemErroConvite({ message: 'grupo_cheio' })).toBe(copy.cadastro.erroGrupoCheio)
  })
  it('erro desconhecido ou vazio cai no "código inválido"', () => {
    expect(mensagemErroConvite(null)).toBe(copy.cadastro.erroCodigoInvalido)
    expect(mensagemErroConvite({ message: 'Failed to fetch' })).toBe(copy.cadastro.erroCodigoInvalido)
  })
  it('aceita o código com ou sem hífen e mostra em A1B2-C3D4', () => {
    expect(normalizarCodigo('A1B2-C3D4')).toBe('a1b2c3d4')
    expect(codigoBonito('a1b2c3d4')).toBe('A1B2-C3D4')
  })
})
