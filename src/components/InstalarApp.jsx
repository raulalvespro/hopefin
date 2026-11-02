import { useEffect, useState } from 'react'
import { Download, X, Share } from 'lucide-react'

const KEY = 'hopefin_pwa_dispensado'

function estaInstalado() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}
function foiDispensado() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
function ehIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
}

export default function InstalarApp() {
  const [prompt, setPrompt] = useState(null)   // evento beforeinstallprompt (Android/desktop)
  const [iosBanner, setIosBanner] = useState(false)

  useEffect(() => {
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

  function dispensar() {
    setPrompt(null); setIosBanner(false)
    try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
  }

  if (!prompt && !iosBanner) return null

  return (
    <div style={{
      position: 'fixed', bottom: 72, left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 24px)', maxWidth: 456, zIndex: 40,
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      boxShadow: '0 10px 30px rgba(15,23,42,0.18)', padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, background: 'var(--accent-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Download size={20} color="var(--accent)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>Instalar o HopeFin</p>
        {prompt ? (
          <p style={{ fontSize: 12, color: 'var(--text2)' }}>Acesso rápido na tela inicial, como um app.</p>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            Toque em <Share size={13} style={{ verticalAlign: 'middle' }} /> e em "Adicionar à Tela de Início".
          </p>
        )}
      </div>
      {prompt && (
        <button onClick={instalar} style={{
          background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: 'Syne', fontWeight: 700,
          fontSize: 13, padding: '8px 14px', borderRadius: 'var(--radius-sm)', flexShrink: 0,
        }}>
          Instalar
        </button>
      )}
      <button onClick={dispensar} style={{ color: 'var(--text3)', flexShrink: 0, display: 'flex' }} aria-label="Dispensar">
        <X size={18} />
      </button>
    </div>
  )
}
