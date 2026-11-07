// Money — valor em reais, Syne 700, com sinal e cor por tipo.
// tipo: 'entrada' (+ verde) | 'gasto' (− vermelho) | 'neutro' (sem sinal, cor do texto)
export default function Money({ valor, tipo = 'neutro', size = 15, style }) {
  const brl = Math.abs(Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  // 'neutro' herda a cor do contexto (currentColor) — assim some o texto escuro
  // sobre o cartão de destaque (painel escuro), onde a cor herdada é branca.
  const cor = tipo === 'entrada' ? 'var(--accent-text)' : tipo === 'gasto' ? 'var(--red-text)' : 'currentColor'
  const sinal = tipo === 'entrada' ? '+ ' : tipo === 'gasto' ? '− ' : ''
  return (
    <span style={{ fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: size, lineHeight: 1.1, color: cor, whiteSpace: 'nowrap', ...style }}>
      {sinal}{brl}
    </span>
  )
}
