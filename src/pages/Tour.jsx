// Tour guiado "Conheça o HopeFin": 9 telas (8 recursos + convidar a família), com "Pular" em todas.
// Aparece uma vez por conta (ver Layout) e dá pra rever em Configurações → Conhecer o app (?rever=1).
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button, Tag } from '../components/ui'
import ConviteGrupo from '../components/ConviteGrupo'
import { ILUSTRAS } from '../components/TourIlustra'
import { marcarTourVisto } from '../lib/tour'
import { copy } from '../copy/pt-BR'

const t = copy.tour
const BG = ['var(--accent-dim)', 'var(--accent-dim)', 'var(--blue-dim)', 'var(--purple-dim)', 'var(--amber-dim)', 'var(--blue-dim)', 'var(--purple-dim)', 'var(--accent-dim)', 'var(--accent-dim)']

function Dots({ total, ativo }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ width: i === ativo ? 22 : 8, height: 8, borderRadius: 4, background: i === ativo ? 'var(--accent)' : 'var(--border2)', transition: 'width var(--dur-2) var(--ease)' }} />
      ))}
    </div>
  )
}

export default function Tour() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const rever = params.get('rever') === '1'
  const [passo, setPasso] = useState(0)

  const total = t.passos.length
  const p = t.passos[passo]
  const ultimo = passo === total - 1
  const Ilustra = ILUSTRAS[passo]

  // Pular ou terminar: marca como visto. Quem está revendo volta pra Configurações;
  // quem terminou o 1º tour segue pros primeiros passos; quem pulou vai direto pro Início.
  function sair(destino) { marcarTourVisto(user?.id); navigate(destino, { replace: true }) }
  const aoPular = () => sair(rever ? '/configuracoes' : '/')
  const aoTerminar = () => sair(rever ? '/configuracoes' : '/boas-vindas')

  return (
    <div className="onboarding" style={{ alignItems: ultimo ? 'flex-start' : 'center' }}>
      <div className="onboarding-card" style={{ gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 28, marginTop: -8 }}>
          {passo > 0 ? (
            <button onClick={() => setPasso(n => n - 1)} aria-label={t.voltar} style={{ display: 'flex', alignItems: 'center', color: 'var(--text2)', fontSize: 14, minHeight: 44 }}>
              <ChevronLeft size={18} /> {t.voltar}
            </button>
          ) : <span />}
          {!ultimo && <button onClick={aoPular} style={{ fontSize: 14, color: 'var(--text2)', minHeight: 44 }}>{t.pular}</button>}
        </div>

        {!ultimo && Ilustra && (
          <div className="onboarding-ilustra" style={{ background: BG[passo], height: 240 }} key={passo}>
            <Ilustra />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {p.onde && <Tag cor="cinza" style={{ alignSelf: 'flex-start' }}>{p.onde}</Tag>}
          <h2 style={{ margin: 0, fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 26, lineHeight: '30px' }}>{p.titulo}</h2>
          <p style={{ margin: 0, fontSize: 15, lineHeight: '22px', color: 'var(--text2)' }}>{p.texto}</p>
        </div>

        {/* Último passo: o convite de verdade (QR, WhatsApp, link, código) */}
        {ultimo && <div style={{ marginBottom: -16 }}><ConviteGrupo /></div>}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14, alignItems: ultimo ? 'stretch' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Dots total={total} ativo={passo} />
            {!ultimo && <Button onClick={() => setPasso(n => n + 1)}>{t.proximo}</Button>}
          </div>
          {ultimo && (
            <>
              <Button onClick={aoTerminar} style={{ width: '100%' }}>{rever ? t.fechar : t.comecar}</Button>
              {!rever && <button onClick={aoPular} style={{ fontSize: 14, color: 'var(--text2)', minHeight: 44 }}>{t.convidarDepois}</button>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
