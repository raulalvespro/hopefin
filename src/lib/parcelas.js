// Parcelas (A3.5, 19/11/2026): de qual mês a qual mês vão as parcelas criadas,
// pro aviso "6 parcelas criadas (nov/26 → abr/27)".
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// `dataPrimeira` = 'YYYY-MM-DD' da 1ª parcela; `n` = quantas parcelas. Devolve { de, ate } tipo 'nov/26'.
export function periodoParcelas(n, dataPrimeira) {
  const [a, m] = String(dataPrimeira || '').slice(0, 7).split('-').map(Number)
  if (!a || !m) return { de: '', ate: '' }
  const ini = a * 12 + (m - 1)
  const fim = ini + Math.max(1, Number(n) || 1) - 1
  const rotulo = (t) => `${MESES[t % 12]}/${String(Math.floor(t / 12)).slice(-2)}`
  return { de: rotulo(ini), ate: rotulo(fim) }
}
