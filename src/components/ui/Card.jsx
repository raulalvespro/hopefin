// Card — superfície branca com borda e sombra suave. `destaque` usa o painel
// escuro da marca (--panel-ink) com texto branco nos dois temas.
export default function Card({ children, pad = 'var(--space-20)', destaque = false, style, ...rest }) {
  const base = destaque
    ? { background: 'var(--panel-ink)', color: '#ffffff', border: 'none', boxShadow: 'none' }
    : { background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }
  return (
    <div style={{ borderRadius: 'var(--radius-lg)', padding: pad, ...base, ...style }} {...rest}>
      {children}
    </div>
  )
}
