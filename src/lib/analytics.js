// PostHog — analytics de PRODUTO (funil cadastro → trial → checkout → assinatura).
// Sem autocapture e sem session replay. Só liga se a chave existir E o usuário
// tiver aceitado os cookies (LGPD: analytics é opcional, carrega após consentir).
import posthog from 'posthog-js'

const KEY = import.meta.env.VITE_POSTHOG_KEY
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'
const CONSENT_KEY = 'hopefin_cookies_consent' // 'aceito' | 'recusado'

let iniciado = false

export function consentimento() {
  try { return localStorage.getItem(CONSENT_KEY) } catch { return null }
}

export function definirConsentimento(valor) {
  try { localStorage.setItem(CONSENT_KEY, valor) } catch { /* modo privado */ }
  if (valor === 'aceito') initPostHog()
  else if (iniciado) { try { posthog.opt_out_capturing() } catch { /* ok */ } }
}

export function initPostHog() {
  if (iniciado || !KEY) return
  if (consentimento() !== 'aceito') return
  try {
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
    iniciado = true
  } catch { /* não deixa analytics derrubar o app */ }
}

// Vincula os eventos a um usuário (só o id; nunca e-mail/nome aqui).
export function identificar(id) {
  if (!iniciado || !id) return
  try { posthog.identify(id) } catch { /* ok */ }
}

export function resetarUsuario() {
  if (!iniciado) return
  try { posthog.reset() } catch { /* ok */ }
}

// Evento de funil. No-op silencioso se o analytics não estiver ligado.
export function track(evento, props) {
  if (!iniciado) return
  try { posthog.capture(evento, props) } catch { /* ok */ }
}
