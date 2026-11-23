// PostHog — analytics de PRODUTO (funil cadastro → trial → checkout → assinatura).
// Sem autocapture e sem session replay. Só liga se a chave existir E o usuário
// tiver aceitado os cookies (LGPD: analytics é opcional, carrega após consentir).
// posthog-js (~500 KB) só é baixado depois do consentimento: fora do pacote principal (23/11/2026).

const KEY = import.meta.env.VITE_POSTHOG_KEY
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'
const CONSENT_KEY = 'hopefin_cookies_consent' // 'aceito' | 'recusado'

let iniciado = false
let carregando = null // Promise do posthog já iniciado

// Roda `fn(posthog)` quando o PostHog estiver pronto (eventos que chegam durante o download esperam).
function comPosthog(fn) {
  if (!carregando) return
  carregando.then(ph => { if (ph) { try { fn(ph) } catch { /* ok */ } } })
}

export function consentimento() {
  try { return localStorage.getItem(CONSENT_KEY) } catch { return null }
}

export function definirConsentimento(valor) {
  try { localStorage.setItem(CONSENT_KEY, valor) } catch { /* modo privado */ }
  if (valor === 'aceito') initPostHog()
  else if (iniciado) comPosthog(ph => ph.opt_out_capturing())
}

export function initPostHog() {
  if (iniciado || !KEY) return
  if (consentimento() !== 'aceito') return
  iniciado = true
  carregando = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: HOST,
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: false,              // sem captura automática de cliques
        disable_session_recording: true, // sem replay de sessão
        disable_surveys: true,           // não usamos surveys
        person_profiles: 'identified_only',
        persistence: 'localStorage+cookie',
      })
      return posthog
    })
    .catch(() => null) // não deixa analytics derrubar o app
}

// Vincula os eventos a um usuário (só o id; nunca e-mail/nome aqui).
export function identificar(id) {
  if (!iniciado || !id) return
  comPosthog(ph => ph.identify(id))
}

export function resetarUsuario() {
  if (!iniciado) return
  comPosthog(ph => ph.reset())
}

// Evento de funil. No-op silencioso se o analytics não estiver ligado.
export function track(evento, props) {
  if (!iniciado) return
  comPosthog(ph => ph.capture(evento, props))
}
