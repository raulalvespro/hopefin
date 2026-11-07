// Convite do grupo: o código do banco tem 8 caracteres (ex.: "a1b2c3d4"). Mostramos
// no formato "A1B2-C3D4" (mais fácil de ler/ditar) e aceitamos com ou sem hífen.
export const normalizarCodigo = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

export const codigoBonito = c => {
  const n = normalizarCodigo(c).toUpperCase()
  return n.length === 8 ? `${n.slice(0, 4)}-${n.slice(4)}` : n
}

// Link de convite: abre o app já com o código guardado (rota /entrar).
export const linkConvite = c => `${window.location.origin}/entrar?c=${normalizarCodigo(c)}`

// Código vindo de um link de convite fica guardado até a pessoa criar a conta / entrar no grupo.
const CHAVE = 'hf_convite'
export function guardarConvite(codigo) {
  try { localStorage.setItem(CHAVE, normalizarCodigo(codigo)) } catch { /* sem storage: segue sem */ }
}
export function lerConvite() {
  try { return normalizarCodigo(localStorage.getItem(CHAVE)) } catch { return '' }
}
export function limparConvite() {
  try { localStorage.removeItem(CHAVE) } catch { /* ignore */ }
}
