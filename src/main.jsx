import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App'
// O painel do dono só é baixado em admin.hopefin.com.br (fica fora do arquivo principal do app,
// que tem limite de 2 MB pra funcionar offline — 22/11/2026).
const AdminApp = React.lazy(() => import('./admin/AdminApp'))
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

// As telas baixam sob demanda (23/11/2026). Se a pessoa estava com a versão antiga aberta e saiu
// uma nova, o arquivo da tela antiga some do servidor: recarrega 1x pra pegar a versão nova
// (a marca na sessão evita ficar recarregando em loop se o problema for outro, ex.: sem internet).
function recarregarUmaVez() {
  try {
    if (sessionStorage.getItem('hopefin_recarregou_tela')) return false
    sessionStorage.setItem('hopefin_recarregou_tela', '1')
  } catch { return false }
  window.location.reload()
  return true
}
window.addEventListener('vite:preloadError', (e) => { if (recarregarUmaVez()) e.preventDefault() })

// 27/11: quando o arquivo PRINCIPAL da tela some (não só os auxiliares), o erro não passa pelo
// vite:preloadError — vai direto pra tela de "Algo deu errado". Mesmo remédio: recarrega 1x.
const ehVersaoVelha = (err) => /dynamically imported module|Importing a module script failed|error loading dynamically|Loading chunk|Failed to fetch/i.test(String(err?.message || err || ''))

// Último recurso da tela de erro: apaga a versão guardada no aparelho (service worker + cache) e recarrega.
async function recarregarLimpo() {
  try { for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) await r.unregister() } catch { /* sem SW */ }
  try { for (const k of (await caches?.keys?.()) || []) await caches.delete(k) } catch { /* sem cache */ }
  try { sessionStorage.removeItem('hopefin_recarregou_tela') } catch { /* ignore */ }
  window.location.reload()
}
function TelaDeErro() {
  return (
    <div style={{ padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ margin: '24px 0 16px' }}>Algo deu errado ao abrir o app.</p>
      <button type="button" onClick={recarregarLimpo} className="btn-primary" style={{ padding: '12px 24px' }}>Recarregar</button>
    </div>
  )
}
window.addEventListener('load', () => {
  setTimeout(() => { try { sessionStorage.removeItem('hopefin_recarregou_tela') } catch { /* ignore */ } }, 10000)
})

// Sem zoom de pinça (A8.11, pedido do Raul): o iPhone ignora o user-scalable=no do
// viewport, então barramos o gesto de pinça (gesturestart é só do Safari) e o toque com 2
// dedos arrastando. Rolagem e o arrastar das listas (1 dedo) continuam normais.
if (typeof document !== 'undefined') {
  const barrar = (e) => e.preventDefault()
  document.addEventListener('gesturestart', barrar, { passive: false })
  document.addEventListener('gesturechange', barrar, { passive: false })
  document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault() }, { passive: false })
}

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

  // PWA próprio do painel (26/11/2026): admin.hopefin.com.br é outra origem, então instala como
  // um app separado ("HF Admin") no celular. Troca o manifesto e os ícones do iPhone antes do
  // navegador checar se dá pra instalar. O ?admin=1 do start_url só importa no localhost.
  const setarLink = (rel, href) => {
    let l = document.querySelector(`link[rel="${rel}"]`)
    if (!l) { l = document.createElement('link'); l.rel = rel; document.head.appendChild(l) }
    l.href = href
  }
  const setarMeta = (name, content) => {
    let m = document.querySelector(`meta[name="${name}"]`)
    if (!m) { m = document.createElement('meta'); m.name = name; document.head.appendChild(m) }
    m.content = content
  }
  setarLink('manifest', '/manifest-admin.webmanifest')
  setarLink('apple-touch-icon', '/admin-apple-touch-180x180.png')
  setarMeta('apple-mobile-web-app-title', 'HF Admin')
  setarMeta('theme-color', '#0f172a')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<TelaDeErro />} onError={(err) => { if (ehVersaoVelha(err)) recarregarUmaVez() }}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            {ehAdmin ? <React.Suspense fallback={null}><AdminApp /></React.Suspense> : <BrowserRouter><App /></BrowserRouter>}
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
)
