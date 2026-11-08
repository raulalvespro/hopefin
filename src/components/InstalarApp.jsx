import { useEffect, useState } from 'react'
import { Download, X, Share, ChevronRight } from 'lucide-react'
import { copy } from '../copy/pt-BR'

const t = copy.avisos
const KEY = 'hopefin_pwa_dispensado'

export function estaInstalado() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}
function foiDispensado() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
export function ehIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
}

// Aviso "Instalar o HopeFin" no TOPO do conteúdo (não flutua sobre o botão do microfone) e clicável:
// no Android/desktop o toque abre a instalação; no iPhone o toque mostra o passo a passo.
export default function InstalarApp() {
  const [prompt, setPrompt] = useState(null)   // evento beforeinstallprompt (Android/desktop)
  const [iosBanner, setIosBanner] = useState(false)
  const [passos, setPassos] = useState(false)

  useEffect(() => {
    // SÓ EM DESENVOLVIMENTO: ?demo=avisos mostra a versão do iPhone (passo a passo)
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('demo') === 'avisos') { setIosBanner(true); return }
    if (estaInstalado() || foiDispensado()) return

    const handler = e => { e.preventDefault(); setPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)

    const instalado = () => { setPrompt(null); setIosBanner(false) }
    window.addEventListener('appinstalled', instalado)

    // iOS/Safari não dispara beforeinstallprompt → mostra instrução manual
    if (ehIOS()) setIosBanner(true)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', instalado)
    }
  }, [])

  async function instalar() {
    if (!prompt) return
    prompt.prompt()
    try { await prompt.userChoice } catch { /* ignore */ }
    setPrompt(null)
  }

  function dispensar(e) {
    e.stopPropagation()
    setPrompt(null); setIosBanner(false)
    try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
  }

  if (!prompt && !iosBanner) return null

  const acao = () => (prompt ? instalar() : setPassos(p => !p))

  return (
    <div role="button" tabIndex={0} onClick={acao} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); acao() } }}
      style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer',
        boxShadow: 'var(--shadow-sm)', padding: '12px 14px', marginBottom: 12,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Download size={20} color="var(--accent)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>{t.instalarTitulo}</p>
          <p style={{ fontSize: 12.5, color: 'var(--text2)' }}>{prompt ? t.instalarTexto : t.instalarTextoIos}</p>
        </div>
        {prompt && <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: 'var(--accent-text)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>{t.instalarBotao}<ChevronRight size={16} /></span>}
        <button onClick={dispensar} style={{ color: 'var(--text3)', flexShrink: 0, display: 'flex', minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' }} aria-label={t.dispensar}>
          <X size={18} />
        </button>
      </div>
      {!prompt && passos && (
        <ol style={{ margin: '10px 0 0 52px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45 }}>
          <li style={{ display: 'flex', alignItems: 'center', gap: 6 }}>1. {t.iosPasso1} <Share size={14} /></li>
          <li>2. {t.iosPasso2}</li>
          <li>3. {t.iosPasso3}</li>
        </ol>
      )}
    </div>
  )
}
