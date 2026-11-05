import { Link } from 'react-router-dom'
import { AlertTriangle, Clock } from 'lucide-react'
import { useAssinatura } from '../hooks/useAssinatura'

// Faixa fina no topo do conteúdo:
//  - assinatura vencida -> aviso vermelho: pode ver/exportar, novos lançamentos travados.
//  - trial acabando (<= 5 dias) -> lembrete âmbar com contagem regressiva.
// Fora disso não mostra nada. A trava de verdade é no banco (RLS).
export default function BannerAssinatura() {
  const { loading, vencida, emTrial, diasRestantes } = useAssinatura()
  if (loading) return null

  if (vencida) {
    return (
      <Link to="/planos" style={{ textDecoration: 'none' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', marginBottom: 16,
          borderRadius: 'var(--radius-sm)', background: 'var(--red-dim, rgba(220,60,60,0.12))',
          border: '1px solid var(--red)', color: 'var(--text)',
        }}>
          <AlertTriangle size={18} color="var(--red)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600 }}>Assinatura vencida</p>
            <p style={{ fontSize: 11.5, color: 'var(--text2)' }}>
              Você ainda vê e exporta tudo, mas novos lançamentos estão bloqueados. Toque para reativar.
            </p>
          </div>
        </div>
      </Link>
    )
  }

  if (emTrial && diasRestantes != null && diasRestantes <= 5) {
    return (
      <Link to="/planos" style={{ textDecoration: 'none' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', marginBottom: 16,
          borderRadius: 'var(--radius-sm)', background: 'var(--amber-dim, rgba(230,160,30,0.12))',
          border: '1px solid var(--amber)', color: 'var(--text)',
        }}>
          <Clock size={18} color="var(--amber)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600 }}>
              {diasRestantes === 0
                ? 'Seu teste grátis termina hoje'
                : `Seu teste grátis termina em ${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'}`}
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--text2)' }}>Garanta o preço de fundador antes de acabar.</p>
          </div>
        </div>
      </Link>
    )
  }

  return null
}
