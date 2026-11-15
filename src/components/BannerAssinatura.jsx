import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, BadgeInfo } from 'lucide-react'
import { useAssinatura } from '../hooks/useAssinatura'

// Faixa fina no topo do conteúdo. Mostra o aviso da assinatura quando há um:
//  - vencido (vermelho): vencida / teste acabou / pagamento pendente — lançamentos travados.
//  - vence   (âmbar):    trial ou acesso cancelado terminando em breve (contagem regressiva).
//  - info    (accent):   assinatura ativa renovando em breve (heads-up com o preço).
// Cortesia e assinatura ativa longe da renovação não mostram nada. A fonte do aviso é
// estadoAssinatura() (lib/assinatura.js); a trava de verdade é no banco (RLS).
const ESTILO = {
  vencido: { Icon: AlertTriangle, cor: 'var(--red)', bg: 'var(--red-dim, rgba(220,60,60,0.12))', borda: 'var(--red)' },
  vence: { Icon: Clock, cor: 'var(--amber)', bg: 'var(--amber-dim, rgba(230,160,30,0.12))', borda: 'var(--amber)' },
  info: { Icon: BadgeInfo, cor: 'var(--accent)', bg: 'var(--accent-dim)', borda: 'var(--accent)' },
}

export default function BannerAssinatura() {
  const { loading, aviso } = useAssinatura()
  if (loading || !aviso) return null

  const e = ESTILO[aviso.severidade] || ESTILO.info
  const { Icon } = e

  return (
    <Link to="/planos" style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', marginBottom: 16,
        borderRadius: 'var(--radius-sm)', background: e.bg, border: `1px solid ${e.borda}`, color: 'var(--text)',
      }}>
        <Icon size={18} color={e.cor} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600 }}>{aviso.titulo}</p>
          <p style={{ fontSize: 11.5, color: 'var(--text2)' }}>{aviso.texto}</p>
        </div>
      </div>
    </Link>
  )
}
