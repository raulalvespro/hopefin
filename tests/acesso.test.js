// Acesso (L39/L40 + A6.1, 19/11/2026): erros de senha do Supabase em português e cupom de parceiro.
import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { resend: vi.fn() } } }))
const { mensagemErroSenha, SENHA_MIN } = await import('../src/lib/acesso.js')
const { normalizarCupom } = await import('../src/lib/cupom.js')
const { copy } = await import('../src/copy/pt-BR.js')

describe('senha', () => {
  it('mínimo de 8 caracteres', () => {
    expect(SENHA_MIN).toBe(8)
  })
  it('traduz os erros do Supabase', () => {
    expect(mensagemErroSenha({ code: 'weak_password', message: 'Password should be at least 8 characters.', reasons: ['length'] })).toBe(copy.acesso.senhaCurta)
    expect(mensagemErroSenha({ code: 'weak_password', message: 'Password is known to be weak and easy to guess, please choose a different one.', reasons: ['pwned'] })).toBe(copy.acesso.senhaVazada)
    expect(mensagemErroSenha({ code: 'same_password', message: 'New password should be different from the old password.' })).toBe(copy.acesso.senhaIgual)
    expect(mensagemErroSenha({ code: 'weak_password', message: 'weak', reasons: ['characters'] })).toBe(copy.acesso.senhaFraca)
  })
  it('erro que não é de senha volta vazio (a tela usa a mensagem dela)', () => {
    expect(mensagemErroSenha({ message: 'User already registered' })).toBe(null)
    expect(mensagemErroSenha(null)).toBe(null)
  })
})

describe('cupom de parceiro', () => {
  it('normaliza o código do link', () => {
    expect(normalizarCupom(' igreja2026 ')).toBe('IGREJA2026')
    expect(normalizarCupom('a b<script>c')).toBe('ABSCRIPTC')
    expect(normalizarCupom('x'.repeat(50))).toHaveLength(30)
  })
})
