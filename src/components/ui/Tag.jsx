// Tag / etiqueta — fundo da cor a ~12% (-dim) e texto na versão legível (-text).
// cor: 'verde' | 'vermelho' | 'azul' | 'amber' | 'roxo' | 'cinza'
const CORES = {
  verde: ['--accent-dim', '--accent-text'],
  vermelho: ['--red-dim', '--red-text'],
  azul: ['--blue-dim', '--blue-text'],
  amber: ['--amber-dim', '--amber-text'],
  roxo: ['--purple-dim', '--purple-text'],
  cinza: ['--bg3', '--text2'],
}
export default function Tag({ children, cor = 'verde', style }) {
  const [bg, fg] = CORES[cor] || CORES.verde
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 12, fontWeight: 500, lineHeight: '16px',
      padding: '3px 10px', borderRadius: 'var(--radius-pill)',
      background: `var(${bg})`, color: `var(${fg})`, whiteSpace: 'nowrap', ...style,
    }}>{children}</span>
  )
}
