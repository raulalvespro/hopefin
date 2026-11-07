// ListItem — ícone 40x40 em quadrado arredondado, título, subtítulo, e à direita
// valor e/ou tag. `onClick` torna o item clicável; `divisoria` liga a linha de baixo.
export default function ListItem({ icone, titulo, subtitulo, valor, tag, onClick, divisoria = true, style }) {
  return (
    <div onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
        borderBottom: divisoria ? '1px solid var(--border)' : 'none',
        cursor: onClick ? 'pointer' : 'default', ...style,
      }}>
      {icone != null && (
        <span style={{ width: 40, height: 40, borderRadius: 'var(--radius)', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', flexShrink: 0, fontSize: 20 }}>
          {icone}
        </span>
      )}
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</span>
        {subtitulo != null && <span style={{ fontSize: 13, color: 'var(--text2)' }}>{subtitulo}</span>}
      </span>
      {(valor != null || tag != null) && (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {valor}
          {tag}
        </span>
      )}
    </div>
  )
}
