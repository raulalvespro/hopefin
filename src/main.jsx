import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App'
import AdminApp from './admin/AdminApp'
import { ehHostAdmin } from './admin/host'
import './index.css'
import { initSentry, Sentry } from './lib/sentry'
import { initPostHog } from './lib/analytics'
import { iniciarAutoAtualizacao } from './lib/atualizarPwa'
import { iniciarCapturaInstalacao } from './lib/instalacao'

// Observabilidade: Sentry (erros) sempre que houver DSN; PostHog (analytics) só
// se o usuário já tiver aceitado os cookies numa visita anterior.
initSentry()
initPostHog()
iniciarAutoAtualizacao()
// Guarda o convite de instalação do Chrome já na abertura (antes do login).
iniciarCapturaInstalacao()

// No subdomínio do painel (admin.hopefin.com.br / admin-preview / localhost?admin=1)
// renderizamos o PAINEL DO DONO — login próprio + ERP, nada a ver com o app.
const ehAdmin = ehHostAdmin()

// Painel com identidade própria na aba do navegador (título + ícone), pra não
// confundir com o app aberto ao lado.
if (ehAdmin) {
  document.title = 'Painel Admin - Hopefin'
  document.querySelectorAll('link[rel~="icon"]').forEach(l => l.remove())
  const icone = document.createElement('link')
  icone.rel = 'icon'
  icone.type = 'image/svg+xml'
  icone.href = '/favicon-admin.svg'
  document.head.appendChild(icone)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p style={{ padding: 24, textAlign: 'center' }}>Algo deu errado. Recarregue a página.</p>}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            {ehAdmin ? <AdminApp /> : <BrowserRouter><App /></BrowserRouter>}
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
)
