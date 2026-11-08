import { useEffect, useState } from 'react'
import Joca from './Joca'
import { copy } from '../copy/pt-BR'

// Faixa discreta quando o aparelho fica sem internet (Joca preocupado, nunca desesperado).
export default function AvisoOffline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (online) return null
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--amber-dim)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 14px 8px 8px', marginBottom: 12 }}>
      <Joca pose="preocupado" tamanho={52} eager style={{ flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600 }}>{copy.mascote.offline.titulo}</p>
        <p style={{ fontSize: 12.5, color: 'var(--text2)' }}>{copy.mascote.offline.texto}</p>
      </div>
    </div>
  )
}
