// Marca HopeFin (prompt 12): ícone oficial (H com a barra subindo, verde #10b981
// sobre branco com contorno) + wordmark "hopefin" em Syne 700, com "fin" em verde
// (#059669 claro / #10b981 escuro, via --logo-fin). Use no login, no topo do app
// e em telas de marca. `wordmark={false}` mostra só o ícone.
export default function Logo({ size = 28, wordmark = true, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.34), ...style }}>
      <svg width={size} height={size} viewBox="0 0 512 512" aria-label="HopeFin" role="img" style={{ display: 'block', flexShrink: 0 }}>
        <rect x="8" y="8" width="496" height="496" rx="108" fill="#ffffff" stroke="#10b981" strokeWidth="16" />
        <g fill="#10b981">
          <rect x="150" y="146" width="58" height="220" rx="18" />
          <rect x="304" y="146" width="58" height="220" rx="18" />
        </g>
        <path d="M190 300 L322 222" fill="none" stroke="#10b981" strokeWidth="54" strokeLinecap="round" />
      </svg>
      {wordmark && (
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: Math.round(size * 0.82), letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--text)' }}>
          hope<span style={{ color: 'var(--logo-fin)' }}>fin</span>
        </span>
      )}
    </span>
  )
}
