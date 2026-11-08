import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App'
import './index.css'
import { initSentry, Sentry } from './lib/sentry'
import { initPostHog } from './lib/analytics'
import { iniciarAutoAtualizacao } from './lib/atualizarPwa'

// Observabilidade: Sentry (erros) sempre que houver DSN; PostHog (analytics) só
// se o usuário já tiver aceitado os cookies numa visita anterior.
initSentry()
initPostHog()
iniciarAutoAtualizacao()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p style={{ padding: 24, textAlign: 'center' }}>Algo deu errado. Recarregue a página.</p>}>
      <BrowserRouter>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
)
