// Link assinado do "não quero receber novidades por e-mail" (comunicados, A8.15).
// Assinatura = HMAC-SHA256(CRON_SECRET, usuario_id), 32 primeiros caracteres em hex: o link só
// funciona pra pessoa certa e não dá pra montar o de outra pessoa.
const enc = new TextEncoder()

export async function assinarDescadastro(usuarioId: string): Promise<string> {
  const segredo = Deno.env.get('CRON_SECRET') || ''
  const chave = await crypto.subtle.importKey('raw', enc.encode(`descadastro:${segredo}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', chave, enc.encode(usuarioId)))
  return Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

export async function linkDescadastro(usuarioId: string): Promise<string> {
  const t = await assinarDescadastro(usuarioId)
  return `https://app.hopefin.com.br/sair-comunicados?u=${usuarioId}&t=${t}`
}
