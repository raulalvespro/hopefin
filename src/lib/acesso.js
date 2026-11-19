// Regras de acesso do HopeFin (L39/L40, 19/11/2026): tamanho mínimo da senha, tradução dos
// erros de senha do Supabase e reenvio do e-mail de confirmação do cadastro.
// O servidor confere o mesmo mínimo (password_min_length = 8, scripts/config-auth-seguranca.mjs).
import { supabase } from './supabase'
import { copy } from '../copy/pt-BR'

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

// Reenvia o e-mail de confirmação do cadastro. Devolve { ok, texto } pronto pra mostrar.
export async function reenviarConfirmacao(email) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: String(email || '').trim(),
    options: { emailRedirectTo: `${window.location.origin}/` },
  })
  if (!error) return { ok: true, texto: t.reenviado }
  const espera = /seconds|rate limit|too many|security purposes/i.test(error.message || '')
  return { ok: false, texto: espera ? t.reenviarEspere : t.reenviarErro }
}
