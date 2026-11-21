import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Meter } from './ui'
import { copy } from '../copy/pt-BR'
import { usePrimeirosPassos, iniciarPasso, esconderNoInicio, escondidoNoInicio } from '../lib/primeirosPassos'

const t = copy.primeirosPassos
const DIAS_NO_INICIO = 30 // o card some sozinho depois de 30 dias de conta (ou quando tudo estiver feito)

// Card "Seus primeiros passos" no Início (A8.10): o checklist que lembra do que ficou pra depois.
export default function CardPrimeirosPassos() {
  const { perfil, user } = useAuth()
  const navigate = useNavigate()
  const pp = usePrimeirosPassos(perfil, user)
  const [escondido, setEscondido] = useState(() => escondidoNoInicio(user?.id))

  const contaNova = user?.created_at && (Date.now() - new Date(user.created_at).getTime()) < DIAS_NO_INICIO * 86400000
  if (!contaNova || escondido || pp.carregando || !pp.proximo) return null

  const comecar = () => { iniciarPasso(pp.proximo.key); navigate(pp.proximo.rota) }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>{t.cardTitulo}</p>
        <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{t.contador(pp.feitos, pp.total)}</span>
      </div>
      <Meter valor={(pp.feitos / pp.total) * 100} cor="var(--accent)" altura={6} />
      <button type="button" onClick={comecar}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-dim)', border: '1px solid var(--accent)', color: 'var(--text)', textAlign: 'left' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{pp.proximo.numero}. {pp.proximo.titulo}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text2)' }}>{pp.proximo.subtitulo}</span>
        </span>
        <ChevronRight size={18} color="var(--accent-text)" />
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <button type="button" onClick={() => navigate('/boas-vindas')} style={{ fontSize: 13, color: 'var(--accent-text)', fontWeight: 600, minHeight: 36 }}>{t.verTodos}</button>
        <button type="button" onClick={() => { esconderNoInicio(user?.id); setEscondido(true) }} style={{ fontSize: 13, color: 'var(--text2)', minHeight: 36 }}>{t.esconder}</button>
      </div>
    </div>
  )
}
