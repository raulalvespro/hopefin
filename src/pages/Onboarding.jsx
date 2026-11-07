// Onboarding em 3 telas com "Pular". Mostrado automaticamente na 1ª visita de quem
// não está logado (ver App.jsx / jaViuOnboarding). A última leva ao cadastro ou ao
// login. Não mexe na auth — só navega. Marca localStorage ao sair pra não repetir.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import { copy } from '../copy/pt-BR'

const t = copy.onboarding
const BG = ['var(--accent-dim)', 'var(--blue-dim)', 'var(--purple-dim)']

export function marcarOnboarded() {
  try { localStorage.setItem('hopefin_onboarded', '1') } catch { /* ignore */ }
}

// Ilustração do passo 1: a família orbitando o saldo compartilhado.
function IlustraCasa() {
  return (
    <svg width="300" height="260" viewBox="0 0 300 260" aria-hidden="true">
      <circle cx="150" cy="130" r="92" fill="none" stroke="#a7f3d0" strokeWidth="2" strokeDasharray="4 8" />
      <rect x="110" y="100" width="80" height="60" rx="16" fill="#10b981" />
      <path d="M128 140 L146 126 L158 132 L174 116" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <g className="hf-ob-orbit">
        <g className="hf-ob-counter"><circle cx="150" cy="38" r="24" fill="#ffffff" stroke="#10b981" strokeWidth="3" /><text x="150" y="44" textAnchor="middle" fontFamily="Syne, sans-serif" fontWeight="700" fontSize="16" fill="#065f46">{t.passos[0].avatar}</text></g>
        <g className="hf-ob-counter"><circle cx="230" cy="176" r="22" fill="#ffffff" stroke="#3b82f6" strokeWidth="3" /><circle cx="230" cy="170" r="6" fill="#3b82f6" /><path d="M219 186 a11 9 0 0 1 22 0" fill="#3b82f6" /></g>
        <g className="hf-ob-counter"><circle cx="70" cy="176" r="22" fill="#ffffff" stroke="#8b5cf6" strokeWidth="3" /><circle cx="70" cy="170" r="6" fill="#8b5cf6" /><path d="M59 186 a11 9 0 0 1 22 0" fill="#8b5cf6" /></g>
      </g>
    </svg>
  )
}

// Ilustração do passo 2: microfone com anel pulsando + balão de fala.
function IlustraVoz() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <div style={{ position: 'relative', width: 104, height: 104, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="hf-ring" aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 52, background: '#10b981' }} />
        <span aria-hidden="true" style={{ position: 'relative', width: 88, height: 88, borderRadius: 44, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="36" height="36" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="#06281e" strokeWidth="2" /><path d="M5 11 a7 7 0 0 0 14 0 M12 18 v3" fill="none" stroke="#06281e" strokeWidth="2" strokeLinecap="round" /></svg>
        </span>
      </div>
      <span style={{ background: 'var(--bg2)', borderRadius: '16px 16px 16px 4px', padding: '12px 16px', fontSize: 15, boxShadow: 'var(--shadow-sm)', color: 'var(--text)' }}>{t.passos[1].bolha}</span>
    </div>
  )
}

// Ilustração do passo 3: projeção do saldo subindo até o próximo mês.
function IlustraProjecao() {
  return (
    <svg width="300" height="220" viewBox="0 0 300 220" aria-hidden="true">
      <line x1="20" y1="190" x2="280" y2="190" stroke="var(--border2)" strokeWidth="2" />
      <line x1="20" y1="130" x2="280" y2="130" stroke="var(--border)" strokeWidth="2" />
      <line x1="20" y1="70" x2="280" y2="70" stroke="var(--border)" strokeWidth="2" />
      <path className="hf-ob-draw" d="M20 160 L80 150 L130 166 L180 120 L230 100 L280 60" fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M180 120 L230 100 L280 60" fill="none" stroke="var(--bg2)" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
      <g className="hf-ob-dot"><circle cx="280" cy="60" r="10" fill="#10b981" /><circle cx="280" cy="60" r="4" fill="#ffffff" /></g>
      <rect x="196" y="16" width="98" height="30" rx="15" fill="var(--bg2)" stroke="var(--border2)" />
      <text x="245" y="36" textAnchor="middle" fontFamily="DM Sans, sans-serif" fontWeight="500" fontSize="13" fill="var(--purple-text)">{t.passos[2].mes}</text>
    </svg>
  )
}

const ILUSTRA = [IlustraCasa, IlustraVoz, IlustraProjecao]

function Dots({ ativo }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', gap: 6 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: i === ativo ? 22 : 8, height: 8, borderRadius: 4, background: i === ativo ? 'var(--accent)' : 'var(--border2)', transition: 'width var(--dur-2) var(--ease)' }} />
      ))}
    </div>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [passo, setPasso] = useState(0)
  const Ilustra = ILUSTRA[passo]
  const ultimo = passo === 2

  const sair = destino => { marcarOnboarded(); navigate(destino) }

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 20, marginTop: -8 }}>
          {!ultimo && (
            <button onClick={() => sair('/login')} style={{ fontSize: 14, color: 'var(--text2)' }}>{t.pular}</button>
          )}
        </div>

        <div className="onboarding-ilustra" style={{ background: BG[passo] }} key={passo}>
          <Ilustra />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0, fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 26, lineHeight: '30px' }}>{t.passos[passo].titulo}</h2>
          <p style={{ margin: 0, fontSize: 15, lineHeight: '22px', color: 'var(--text2)' }}>{t.passos[passo].texto}</p>
        </div>

        {!ultimo ? (
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Dots ativo={passo} />
            <Button onClick={() => setPasso(p => p + 1)}>{t.proximo}</Button>
          </div>
        ) : (
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
            <Dots ativo={passo} />
            <Button onClick={() => sair('/cadastro')} style={{ width: '100%' }}>{t.comecar}</Button>
            <button onClick={() => sair('/login')} style={{ fontSize: 14, color: 'var(--accent-text)', fontWeight: 600 }}>{t.jaTenho}</button>
          </div>
        )}
      </div>
    </div>
  )
}
