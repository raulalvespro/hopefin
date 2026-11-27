// Regras de acesso do HopeFin (L39/L40, 19/11/2026): tamanho mínimo da senha, tradução dos
// erros de senha do Supabase e reenvio do e-mail de confirmação do cadastro.
// O servidor confere o mesmo mínimo (password_min_length = 8, scripts/config-auth-seguranca.mjs).
import { supabase } from './supabase'
import { copy } from '../copy/pt-BR'
import { comCaptcha } from './turnstile'

export const SENHA_MIN = 8
const t = copy.acesso

// Erro do Supabase ao criar ou trocar senha → texto pra pessoa (null se não for erro de senha).
export function mensagemErroSenha(error) {
  if (!error) return null
  const m = String(error.message || '').toLowerCase()
  const motivos = Array.isArray(error.reasons) ? error.reasons : []
  if (error.code === 'same_password' || m.includes('different from the old')) return t.senhaIgual
  if (motivos.includes('pwned') || /pwned|leaked|compromised|known to be weak/.test(m)) return t.senhaVazada
  if (motivos.includes('length') || m.includes('at least')) return t.senhaCurta
  if (error.code === 'weak_password') return t.senhaFraca
  return null
}

// O Supabase segura novos envios de e-mail por ~1 minuto (por segurança). Esse erro vira "aguarde".
export function ehEsperaDeEnvio(error) {
  if (!error) return false
  return error.status === 429 || /seconds|rate limit|too many|security purposes/i.test(error.message || '')
}

// Reenvia o e-mail de confirmação do cadastro. Devolve { ok, texto } pronto pra mostrar.
export async function reenviarConfirmacao(email) {
  const { error } = await comCaptcha((cap) => supabase.auth.resend({
    type: 'signup',
    email: String(email || '').trim(),
    options: { emailRedirectTo: `${window.location.origin}/`, ...cap },
  }))
  if (!error) return { ok: true, texto: t.reenviado }
  return { ok: false, texto: ehEsperaDeEnvio(error) ? t.reenviarEspere : t.reenviarErro }
}

// Esqueci minha senha (A6.4): manda o link de criar senha nova. Devolve { ok, espera, texto }.
// Por segurança a resposta é a mesma exista ou não conta com esse e-mail.
export const ESPERA_REENVIO_SEG = 60
export async function enviarRecuperacao(email) {
  const { error } = await comCaptcha((cap) => supabase.auth.resetPasswordForEmail(String(email || '').trim(), {
    redirectTo: `${window.location.origin}/redefinir-senha`,
    ...cap,
  }))
  if (!error) return { ok: true, espera: false, texto: t.recuperacaoReenviada }
  const espera = ehEsperaDeEnvio(error)
  return { ok: false, espera, texto: espera ? t.reenviarEspere : t.recuperacaoErro }
}

// Link de "esqueci minha senha" aberto (o Supabase devolve #...type=recovery na volta).
export function ehLinkDeRecuperacao(hash = '', search = '') {
  return /(^|[#&?])type=recovery(&|$)/.test(`${hash}&${search}`)
}
