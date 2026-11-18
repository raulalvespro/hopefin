import { X } from 'lucide-react'
import { fmt, fmtData } from '../lib/format'

// "De onde vem esse número?" — mostra a conta item a item, em blocos que somam
// (+) ou subtraem (−), e o resultado no fim. Usado no Início (saldo, sobra, quanto
// posso gastar) e reaproveitável em qualquer tela.
//
// blocos: [{ titulo, sinal: '+'|'−', itens: [{ descricao, valor, detalhe? }], total }]
export default function Explicacao({ titulo, subtitulo, blocos, resultado, onFechar }) {
  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '86vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
          <h2 style={{ fontSize: 18 }}>{titulo}</h2>
          <button onClick={onFechar} aria-label="Fechar"><X size={20} color="var(--text2)" /></button>
        </div>
        {subtitulo && <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 14 }}>{subtitulo}</p>}

        {blocos.filter(b => b.itens.length || b.mostrarVazio).map((b, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid var(--border2)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                <span style={{ color: b.sinal === '+' ? 'var(--accent-text)' : 'var(--red-text)', marginRight: 6 }}>{b.sinal}</span>{b.titulo}
              </span>
              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: b.sinal === '+' ? 'var(--accent-text)' : 'var(--red-text)' }}>{fmt(b.total)}</span>
            </div>
            {b.itens.map((it, j) => (
              <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0 6px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.descricao}</p>
                  {(it.detalhe || it.data) && (
                    <p style={{ fontSize: 11, color: 'var(--text3)' }}>{[it.data ? fmtData(it.data, 'dd/MM') : null, it.detalhe].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(it.valor)}</span>
              </div>
            ))}
          </div>
        ))}

        {resultado && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg3)', marginTop: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>= {resultado.rotulo}</span>
            <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: resultado.valor >= 0 ? 'var(--accent-text)' : 'var(--red-text)' }}>{fmt(resultado.valor)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
