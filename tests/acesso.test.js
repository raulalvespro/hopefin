// Acesso (L39/L40 + A6.1, 19/11/2026): erros de senha do Supabase em português e cupom de parceiro.
import { describe, it, expect, vi } from 'vitest'

const resetPasswordForEmail = vi.fn()
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { resend: vi.fn(), resetPasswordForEmail } } }))
const { mensagemErroSenha, SENHA_MIN, ehEsperaDeEnvio, ehLinkDeRecuperacao, enviarRecuperacao, ESPERA_REENVIO_SEG } = await import('../src/lib/acesso.js')
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

describe('esqueci minha senha (A6.4)', () => {
  it('reconhece o "aguarde" do Supabase', () => {
    expect(ehEsperaDeEnvio({ status: 429, message: 'x' })).toBe(true)
    expect(ehEsperaDeEnvio({ message: 'For security purposes, you can only request this after 42 seconds.' })).toBe(true)
    expect(ehEsperaDeEnvio({ message: 'Email rate limit exceeded' })).toBe(true)
    expect(ehEsperaDeEnvio({ status: 500, message: 'Error sending recovery email' })).toBe(false)
    expect(ehEsperaDeEnvio(null)).toBe(false)
    expect(ESPERA_REENVIO_SEG).toBe(60)
  })
  it('reconhece o link de recuperação na volta do e-mail', () => {
    expect(ehLinkDeRecuperacao('#access_token=a&expires_in=3600&refresh_token=b&token_type=bearer&type=recovery')).toBe(true)
    expect(ehLinkDeRecuperacao('#type=recovery&access_token=a')).toBe(true)
    expect(ehLinkDeRecuperacao('', '?type=recovery')).toBe(true)
    expect(ehLinkDeRecuperacao('#access_token=a&type=signup')).toBe(false)
    expect(ehLinkDeRecuperacao('#error=access_denied&error_code=otp_expired')).toBe(false)
    expect(ehLinkDeRecuperacao('#type=recoveryx')).toBe(false)
    expect(ehLinkDeRecuperacao()).toBe(false)
  })
  it('manda o link pra /redefinir-senha deste endereço e traduz a resposta', async () => {
    globalThis.window = { location: { origin: 'https://app.hopefin.com.br' } }
    resetPasswordForEmail.mockResolvedValueOnce({ error: null })
    expect(await enviarRecuperacao('  ana@x.com ')).toEqual({ ok: true, espera: false, texto: copy.acesso.recuperacaoReenviada })
    expect(resetPasswordForEmail).toHaveBeenLastCalledWith('ana@x.com', { redirectTo: 'https://app.hopefin.com.br/redefinir-senha' })
    resetPasswordForEmail.mockResolvedValueOnce({ error: { status: 429, message: 'For security purposes, you can only request this after 30 seconds.' } })
    expect(await enviarRecuperacao('ana@x.com')).toEqual({ ok: false, espera: true, texto: copy.acesso.reenviarEspere })
    resetPasswordForEmail.mockResolvedValueOnce({ error: { status: 500, message: 'Error sending recovery email' } })
    expect(await enviarRecuperacao('ana@x.com')).toEqual({ ok: false, espera: false, texto: copy.acesso.recuperacaoErro })
    delete globalThis.window
  })
})
