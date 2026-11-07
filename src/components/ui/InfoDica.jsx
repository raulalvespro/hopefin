// InfoDica — "?" discreto que, ao tocar, abre um balão curto explicando um termo.
// Pensado pra mobile (toque, não hover): fecha ao tocar fora ou apertar Esc.
// Usado no Início (Saldo em caixa, projeção) e reaproveitável em qualquer tela.
import { useState, useRef, useEffect, useId } from 'react'
import { HelpCircle } from 'lucide-react'

export default function InfoDica({
  titulo,
  texto,
  cor = 'var(--text3)',     // cor do ícone "?" (clarinho no card escuro, --text3 no claro)
  tamanho = 15,             // diâmetro do ícone
  alinhar = 'left',         // 'left' abre pra direita, 'right' abre pra esquerda (borda da tela)
  largura = 230,
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)
  const id = useId()

  useEffect(() => {
    if (!aberto) return
    const foraClick = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    const esc = e => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('pointerdown', foraClick)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', foraClick)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        type="button"
        aria-label={`O que é ${titulo}`}
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setAberto(a => !a) }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: tamanho + 4, height: tamanho + 4, borderRadius: '50%',
          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: cor,
        }}
      >
        <HelpCircle size={tamanho} strokeWidth={2} />
      </button>
      {aberto && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', [alinhar]: 0, zIndex: 60,
            width: largura, maxWidth: '80vw', textAlign: 'left',
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
            padding: '10px 12px', boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{titulo}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)', lineHeight: '18px' }}>{texto}</span>
        </span>
      )}
    </span>
  )
}
