// Avatar do usuário: foto (data URL) quando houver, senão a inicial do nome.
export default function Avatar({ nome, foto, size = 32 }) {
  const inicial = (nome || '?').trim()[0]?.toUpperCase() || '?'
  if (foto) {
    return <img src={foto} alt={nome || 'Foto'} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent-text)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.42,
      fontFamily: 'Syne', flexShrink: 0,
    }}>{inicial}</span>
  )
}
