// Detecta se estamos no painel do dono (subdomínio admin). Nesse caso o main.jsx
// renderiza o AdminApp (login próprio + ERP), não o app normal.
//  - admin.hopefin.com.br          -> oficial
//  - admin-preview.hopefin.com.br  -> PRÉVIA (deploy separado, pra revisar sem publicar no oficial)
//  - localhost?admin=1             -> dev, pra testar o painel no navegador
export function ehHostAdmin() {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  if (h === 'admin.hopefin.com.br' || h === 'admin-preview.hopefin.com.br') return true
  if ((h === 'localhost' || h === '127.0.0.1') &&
      new URLSearchParams(window.location.search).get('admin') === '1') return true
  return false
}

export const ehPrevia = () =>
  typeof window !== 'undefined' && window.location.hostname === 'admin-preview.hopefin.com.br'
