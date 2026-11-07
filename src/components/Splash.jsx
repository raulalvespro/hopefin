// Abertura do app: logo que se monta (caixa, hastes, barra) + "hopefin" + tagline.
// É um overlay por cima de tudo; o App decide quando mostrar (1x por dia). Some
// sozinho depois de ~1,2s (ou 0,4s com prefers-reduced-motion). Não toca na auth.
import { useEffect } from 'react'
import { copy } from '../copy/pt-BR'

export default function Splash({ onDone }) {
  useEffect(() => {
    const reduz = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const tid = setTimeout(onDone, reduz ? 400 : 1200)
    return () => clearTimeout(tid)
  }, [onDone])

  return (
    <div className="splash-fundo" role="status" aria-label="HopeFin">
      <svg className="hf-sp-loop" width="128" height="128" viewBox="0 0 512 512" aria-hidden="true">
        <rect className="hf-sp-box" x="8" y="8" width="496" height="496" rx="108" fill="#ffffff" stroke="#10b981" strokeWidth="16" />
        <rect className="hf-sp-post" x="150" y="146" width="58" height="220" rx="18" fill="#10b981" style={{ animationDelay: '.45s' }} />
        <rect className="hf-sp-post" x="304" y="146" width="58" height="220" rx="18" fill="#10b981" style={{ animationDelay: '.65s' }} />
        <path className="hf-sp-bar" d="M190 300 L322 222" fill="none" stroke="#10b981" strokeWidth="54" strokeLinecap="round" />
      </svg>
      <span className="hf-sp-word" style={{ fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 34, color: 'var(--text)' }}>
        hope<span style={{ color: 'var(--logo-fin)' }}>fin</span>
      </span>
      <span style={{ position: 'absolute', bottom: 40, fontSize: 13, color: 'var(--text2)' }}>{copy.splash.tagline}</span>
    </div>
  )
}
