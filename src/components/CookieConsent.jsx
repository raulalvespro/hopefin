// Aviso de cookies (LGPD). Cookies essenciais (login) sempre ligados; os de
// analytics (PostHog) só carregam se o usuário clicar em "Aceitar". Some assim
// que ele escolhe, e a escolha fica salva no navegador.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cookie } from 'lucide-react'
import { consentimento, definirConsentimento } from '../lib/analytics'

export default function CookieConsent() {
  const [escolhido, setEscolhido] = useState(() => consentimento() != null)
  if (escolhido) return null

  const decidir = (valor) => { definirConsentimento(valor); setEscolhido(true) }

  return (
    <div role="dialog" aria-label="Aviso de cookies" style={{
      position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 1000,
      maxWidth: 560, margin: '0 auto', padding: '14px 16px',
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
      background: 'var(--bg2)', border: '1px solid var(--border2)',
      borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)',
    }}>
      <Cookie size={22} color="var(--accent)" style={{ flexShrink: 0 }} />
      <p style={{ flex: '1 1 240px', fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45, margin: 0 }}>
        Usamos cookies essenciais pra você entrar na conta e, se você permitir, cookies
        de análise pra melhorar o app. <Link to="/privacidade" style={{ color: 'var(--accent)' }}>Saiba mais</Link>.
      </p>
      <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
        <button onClick={() => decidir('recusado')} className="btn-ghost"
          style={{ padding: '8px 14px', fontSize: 13 }}>Recusar</button>
        <button onClick={() => decidir('aceito')} className="btn-primary"
          style={{ padding: '8px 16px', fontSize: 13 }}>Aceitar</button>
      </div>
    </div>
  )
}
