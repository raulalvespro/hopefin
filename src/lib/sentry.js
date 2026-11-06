// Sentry — monitoramento de ERROS apenas (sem performance tracing, sem session
// replay). Só liga se VITE_SENTRY_DSN existir, então o dev local roda sem ele.
//
// Privacidade: nunca mandamos e-mail, IP ou valores em reais pro Sentry.
// `beforeSend`/`beforeBreadcrumb` limpam PII de qualquer evento antes de sair.
import * as Sentry from '@sentry/react'

const DSN = import.meta.env.VITE_SENTRY_DSN

// Troca e-mails e valores "R$ ..." por marcadores, em qualquer texto.
function limpar(txt) {
  if (typeof txt !== 'string') return txt
  return txt
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/R\$\s?\d[\d.,]*/g, 'R$[valor]')
}

export function initSentry() {
  if (!DSN) return
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // Só erros: sem tracing de performance e sem replay de sessão.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Remove qualquer dado pessoal do usuário.
      if (event.user) {
        delete event.user.email
        delete event.user.ip_address
        delete event.user.username
      }
      if (event.message) event.message = limpar(event.message)
      if (event.request?.url) event.request.url = limpar(event.request.url)
      event.exception?.values?.forEach((v) => { if (v.value) v.value = limpar(v.value) })
      return event
    },
    beforeBreadcrumb(b) {
      if (b?.message) b.message = limpar(b.message)
      if (b?.data?.url) b.data.url = limpar(b.data.url)
      return b
    },
  })
}

export { Sentry }
