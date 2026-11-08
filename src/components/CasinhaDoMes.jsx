import Joca from './Joca'
import { copy } from '../copy/pt-BR'

const t = copy.mascote.casinha
// "Cada lançamento é um tijolinho": 3 etapas da casinha conforme os lançamentos do mês.
export function etapaDaCasinha(n) { return n >= 30 ? 3 : n >= 10 ? 2 : 1 }

export default function CasinhaDoMes({ lancamentos, mesFechado, noAzul }) {
  const etapa = etapaDaCasinha(lancamentos)
  const festa = mesFechado && noAzul
  return (
    <section className="card" aria-label={t.titulo} style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
      <Joca pose={festa ? 'comemorando' : 'construindo'} tamanho={96} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>{festa ? t.tituloFesta : t.titulo}</p>
        <div style={{ display: 'flex', gap: 4 }} aria-hidden="true">
          {[1, 2, 3].map(i => (
            <span key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i <= etapa ? 'var(--amber)' : 'var(--bg3)' }} />
          ))}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>{festa ? t.textoFesta : t.etapas[etapa - 1]}</p>
        <p style={{ fontSize: 12, color: 'var(--text3)' }}>{t.contador(lancamentos)}</p>
      </div>
    </section>
  )
}
