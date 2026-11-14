import { useRef, useState } from 'react'
import { Pencil, Trash2, ChevronLeft } from 'lucide-react'

// Linha com ações reveladas ao arrastar para a esquerda (toque ou mouse).
// Arrasta → aparece lápis (amarelo, editar) e/ou lixeira (vermelho, excluir).
// Mostra um "handle" (‹) na borda direita como dica de que dá pra arrastar.
// Sem onEdit/onDelete, renderiza o conteúdo direto (sem gesto).
export default function SwipeRow({ children, onEdit, onDelete, style }) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startDx = useRef(0)
  const moved = useRef(false)

  const temAcoes = !!(onEdit || onDelete)
  const PANEL = (onEdit ? 64 : 0) + (onDelete ? 64 : 0)

  if (!temAcoes) return <div style={style}>{children}</div>

  function onDown(e) {
    startX.current = e.clientX
    startDx.current = dx
    moved.current = false
    setDragging(true)
    // NÃO capturar o ponteiro aqui: capturar no down faz o clique ir pro wrapper
    // e os botões internos (ex.: abrir fatura) deixam de receber o toque.
  }
  function onMove(e) {
    if (!dragging) return
    const delta = e.clientX - startX.current
    if (Math.abs(delta) > 4 && !moved.current) {
      moved.current = true
      try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch {}  // só ao arrastar de fato
    }
    if (moved.current) setDx(Math.max(-PANEL, Math.min(0, startDx.current + delta)))
  }
  function onUp(e) {
    if (!dragging) return
    setDragging(false)
    setDx(d => (d < -PANEL / 2 ? -PANEL : 0))
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch {}
  }
  function acionar(fn) { setDx(0); fn?.() }

  const aberto = dx !== 0

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius)', ...style }}>
      {/* Ações atrás da linha */}
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, display: 'flex' }}>
        {onEdit && (
          <button onClick={() => acionar(onEdit)} aria-label="Editar"
            style={{ width: 64, background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Pencil size={18} color="#1a1203" />
          </button>
        )}
        {onDelete && (
          <button onClick={() => acionar(onDelete)} aria-label="Excluir"
            style={{ width: 64, background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trash2 size={18} color="#fff" />
          </button>
        )}
      </div>
      {/* Conteúdo arrastável */}
      <div
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onClickCapture={e => {
          // Se arrastou, ou está aberto, o toque fecha em vez de clicar dentro.
          if (moved.current || dx !== 0) { e.stopPropagation(); e.preventDefault(); setDx(0) }
        }}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease',
          touchAction: 'pan-y', position: 'relative', background: 'var(--bg2)',
          paddingRight: 20,
        }}
      >
        {children}
        {/* Dica de swipe — handle na borda direita (some ao abrir) */}
        {!aberto && (
          <span aria-hidden style={{
            position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 34, borderRadius: 6, background: 'var(--bg3)',
            color: 'var(--text3)', pointerEvents: 'none', opacity: 0.9,
          }}>
            <ChevronLeft size={15} />
          </span>
        )}
      </div>
    </div>
  )
}
