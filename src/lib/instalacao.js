// Instalação do app (PWA) e detecção do ambiente.
//
// O Chrome oferece a instalação (evento `beforeinstallprompt`) UMA vez por
// carregamento da página — quase sempre ainda na tela de login. O aviso
// "Instalar o HopeFin" só aparece depois do login, então ele precisa de um
// convite GUARDADO: a captura começa no main.jsx, antes de o React montar.

let convite = null
const ouvintes = new Set()
const avisar = () => ouvintes.forEach(fn => { try { fn(convite) } catch { /* ignora */ } })

export function iniciarCapturaInstalacao() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault() // segura o convite pra usar no nosso aviso
    convite = e
    avisar()
  })
  window.addEventListener('appinstalled', () => { convite = null; avisar() })
}

export const conviteInstalacao = () => convite

export function aoMudarConvite(fn) {
  ouvintes.add(fn)
  return () => ouvintes.delete(fn)
}

// Abre a janela de instalação do navegador. Devolve 'accepted' | 'dismissed' | null.
// O convite só pode ser usado uma vez.
export async function abrirInstalacao() {
  const e = convite
  if (!e) return null
  convite = null
  avisar()
  e.prompt()
  try { return (await e.userChoice)?.outcome || null } catch { return null }
}

export function estaInstalado() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function ehIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
}

export function ehAndroid() {
  return /android/i.test(navigator.userAgent)
}

// Navegador "de dentro" de outro app (Instagram, Facebook, WebView): ali não dá pra instalar.
export function navegadorInterno() {
  return /Instagram|FBAN|FBAV|FB_IAB|Line\/|; wv\)/i.test(navigator.userAgent || '')
}

// Link que abre esta mesma página no Chrome (Android).
export function linkAbrirNoChrome() {
  const { host, pathname, search } = window.location
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`
}
