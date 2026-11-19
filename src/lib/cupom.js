// Cupom de parceiro (A6.1, 19/11/2026). O link /c/CODIGO guarda o cupom até a pessoa:
//  - criar a conta: o cupom vai junto no cadastro e é resgatado no 1º acesso (AuthContext);
//  - ou, se já está logada, abrir o Meu plano com o cupom preenchido.
// O cupom saiu do formulário de cadastro (decisão do Raul em 18/11): só no Meu plano/checkout.
const CHAVE = 'hf_cupom'

export const normalizarCupom = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30)

export function guardarCupom(codigo) {
  try { localStorage.setItem(CHAVE, normalizarCupom(codigo)) } catch { /* sem storage: segue sem */ }
}
export function lerCupom() {
  try { return normalizarCupom(localStorage.getItem(CHAVE)) } catch { return '' }
}
export function limparCupom() {
  try { localStorage.removeItem(CHAVE) } catch { /* ignore */ }
}
