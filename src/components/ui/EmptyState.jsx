// EmptyState — ilustração, título (Syne), texto e ação opcional. Usado em telas
// vazias (primeiro gasto do mês, tudo pago, sem internet).
export default function EmptyState({ ilustracao, titulo, texto, acao, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 'var(--space-40)', ...style }}>
      {ilustracao}
      <h3 style={{ margin: 0, fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>{titulo}</h3>
      {texto && <p style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: 'var(--text2)', maxWidth: 300 }}>{texto}</p>}
      {acao}
    </div>
  )
}
