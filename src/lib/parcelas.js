// Parcelas (A3.5, 19/11/2026): de qual mês a qual mês vão as parcelas criadas,
// pro aviso "6 parcelas criadas (nov/26 → abr/27)".
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Entrada parcelada (A3.4): divide o total em `n` parcelas mensais a partir de `dataPrimeira`,
// no mesmo dia de cada mês (31 vira o último dia em mês menor). A última parcela fica com os
// centavos que sobram, pra a soma bater exatamente com o total. Devolve [{ numero, data, valor }].
export function dividirEmParcelas(total, n, dataPrimeira) {
  const qtd = Math.max(1, Math.floor(Number(n) || 1))
  const centavos = Math.round(Number(total) * 100)
  const base = Math.floor(centavos / qtd)
  const [a, m, d] = String(dataPrimeira).slice(0, 10).split('-').map(Number)
  const ini = a * 12 + (m - 1)
  return Array.from({ length: qtd }, (_, i) => {
    const t = ini + i
    const ano = Math.floor(t / 12), mes = (t % 12) + 1
    const dia = Math.min(d, new Date(Date.UTC(ano, mes, 0)).getUTCDate())
    const valor = (i === qtd - 1 ? centavos - base * (qtd - 1) : base) / 100
    return { numero: i + 1, data: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, valor }
  })
}

// Confere o pedido antes de dividir: null = pode; 'qtd' = fora de 2 a 120 parcelas;
// 'pequeno' = não dá nem R$ 0,01 por parcela.
export function problemaParcelas(total, n) {
  const qtd = Number(n)
  if (!Number.isInteger(qtd) || qtd < 2 || qtd > 120) return 'qtd'
  if (!(Math.round(Number(total) * 100) >= qtd)) return 'pequeno'
  return null
}

// `dataPrimeira` = 'YYYY-MM-DD' da 1ª parcela; `n` = quantas parcelas. Devolve { de, ate } tipo 'nov/26'.
export function periodoParcelas(n, dataPrimeira) {
  const [a, m] = String(dataPrimeira || '').slice(0, 7).split('-').map(Number)
  if (!a || !m) return { de: '', ate: '' }
  const ini = a * 12 + (m - 1)
  const fim = ini + Math.max(1, Number(n) || 1) - 1
  const rotulo = (t) => `${MESES[t % 12]}/${String(Math.floor(t / 12)).slice(-2)}`
  return { de: rotulo(ini), ate: rotulo(fim) }
}
