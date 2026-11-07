// Avatar do usuário: foto (data URL) quando houver, senão a inicial do nome num
// círculo colorido. A cor vem do nome (determinística) usando os pares -dim/-text
// (legíveis nos dois temas). `empilhado` dá borda + margem negativa para formar
// pilhas de membros; `bordaCor` casa a borda com o fundo onde a pilha aparece.
const PARES = [
  ['--accent-dim', '--accent-text'],
  ['--blue-dim', '--blue-text'],
  ['--purple-dim', '--purple-text'],
  ['--amber-dim', '--amber-text'],
  ['--red-dim', '--red-text'],
]

function hashNome(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export default function Avatar({ nome, foto, size = 34, empilhado = false, bordaCor = 'var(--bg)', corIndice, style }) {
  const borda = empilhado ? { border: `2px solid ${bordaCor}`, marginLeft: -10 } : {}
  if (foto) {
    return <img src={foto} alt={nome || 'Foto'} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, ...borda, ...style }} />
  }
  const inicial = (nome || '?').trim()[0]?.toUpperCase() || '?'
  const idx = corIndice != null ? corIndice % PARES.length : (nome ? hashNome(nome) % PARES.length : 0)
  const [bg, fg] = PARES[idx]
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: `var(${bg})`, color: `var(${fg})`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
      fontSize: Math.round(size * 0.4), fontFamily: 'Syne', flexShrink: 0, ...borda, ...style,
    }}>{inicial}</span>
  )
}
