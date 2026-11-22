// Financiamentos (0120, 22/11/2026): contas de Price, SAC e parcela fixa, saldo devedor
// estimado e o "e se eu amortizar X?". JavaScript puro (testado em tests/financiamento.test.js).
//
// Como guardamos: o financiamento é um parcelamento sem cartão (as parcelas, que o motor já
// conhece) + a ficha em public.financiamentos. Aqui só calculamos; nada vai pro banco daqui.
//
// Juros: taxa em FRAÇÃO ao mês (0,89% a.m. = 0.0089). Sem juros conhecidos e sem valor
// financiado, o "saldo devedor" é só a soma das parcelas que faltam (sem desconto de juros).

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100
const pad = (n) => String(n).padStart(2, '0')
export const numero = (v) => {
  if (v == null || v === '') return null
  const s = String(v).trim()
  // "350.000,00" (com vírgula) → tira os pontos de milhar; "350000.5" fica como está
  const n = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : null
}

// Tipo → categoria padrão (a pessoa pode trocar) e rótulo.
export const TIPOS = ['imovel', 'carro', 'consignado', 'pessoal', 'estudantil', 'outro']
export const CATEGORIA_DO_TIPO = {
  imovel: 'imóveis e terrenos', carro: 'transporte', consignado: 'empréstimos',
  pessoal: 'empréstimos', estudantil: 'educacao', outro: 'empréstimos',
}

// Taxa informada (valor em %, período 'mes' | 'ano') → fração ao mês.
export function taxaMensal(valor, periodo = 'mes') {
  const v = numero(valor)
  if (v == null || v < 0) return null
  const f = v / 100
  return periodo === 'ano' ? Math.pow(1 + f, 1 / 12) - 1 : f
}

// Parcela da tabela Price.
export function parcelaPrice(pv, i, n) {
  if (!(pv > 0) || !(n > 0)) return 0
  if (!(i > 0)) return pv / n
  return (pv * i) / (1 - Math.pow(1 + i, -n))
}

// Saldo devedor depois de `k` parcelas pagas.
export function saldoPrice(pv, i, n, k) {
  if (k >= n) return 0
  if (!(i > 0)) return Math.max(0, pv - (pv / n) * k)
  const pmt = parcelaPrice(pv, i, n)
  const f = Math.pow(1 + i, k)
  return Math.max(0, pv * f - (pmt * (f - 1)) / i)
}
export function saldoSac(pv, n, k) {
  if (k >= n) return 0
  return Math.max(0, pv - (pv / n) * k)
}

// Parcela número `k` (1..n) do SAC, só amortização + juros (sem seguro/taxas).
export function parcelaSac(pv, i, n, k) {
  const a = pv / n
  return a + (pv - (k - 1) * a) * (i > 0 ? i : 0)
}

// Juros "embutidos" de uma parcela fixa: acha a taxa que faz `pmt` × `n` pagar `pv`
// (bissecção). Sem juros (pmt × n ≤ pv) devolve 0.
export function taxaImplicita(pv, pmt, n) {
  if (!(pv > 0) || !(pmt > 0) || !(n > 0)) return null
  if (pmt * n <= pv + 0.005) return 0
  let lo = 0, hi = 1
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2
    if (parcelaPrice(pv, mid, n) > pmt) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

// Datas das parcelas: no dia `dia` de cada mês a partir de `primeira` ('YYYY-MM-DD').
export function dataDaParcela(primeira, k) {
  const [a, m, d] = String(primeira).slice(0, 10).split('-').map(Number)
  const t = a * 12 + (m - 1) + (k - 1)
  const ano = Math.floor(t / 12), mes = (t % 12) + 1
  const dia = Math.min(d, new Date(Date.UTC(ano, mes, 0)).getUTCDate())
  return `${ano}-${pad(mes)}-${pad(dia)}`
}

// 1ª parcela a partir da "próxima parcela a pagar" (número `prox`, vencendo em `dataProx`).
export function primeiraParcelaDe(prox, dataProx) {
  const [a, m, d] = String(dataProx).slice(0, 10).split('-').map(Number)
  const t = a * 12 + (m - 1) - (Math.max(1, Number(prox) || 1) - 1)
  const ano = Math.floor(t / 12), mes = (t % 12) + 1
  const dia = Math.min(d, new Date(Date.UTC(ano, mes, 0)).getUTCDate())
  return `${ano}-${pad(mes)}-${pad(dia)}`
}

// Valores das `n` parcelas. Price e parcela fixa: todas iguais à parcela informada.
// SAC: calcula pela tabela (valor financiado + juros) e soma a diferença que existir na
// parcela informada (seguro e taxas do banco), com a parcela informada sendo a `ref`.
// Sem dados pro SAC (falta valor financiado), cai no fixo.
export function valoresDasParcelas({ sistema, n, parcela, pv, i, ref = 1 }) {
  const qtd = Math.max(1, Math.floor(Number(n) || 1))
  const pmt = r2(parcela)
  if (sistema !== 'sac' || !(pv > 0)) return Array.from({ length: qtd }, () => pmt)
  const juros = i > 0 ? i : 0
  const k = Math.min(Math.max(1, Number(ref) || 1), qtd)
  const extra = pmt > 0 ? pmt - parcelaSac(pv, juros, qtd, k) : 0
  return Array.from({ length: qtd }, (_, x) => r2(Math.max(0.01, parcelaSac(pv, juros, qtd, x + 1) + extra)))
}

// Resumo de um financiamento a partir da ficha e das parcelas guardadas.
// `fin`: { sistema, valor_financiado, taxa_valor, taxa_periodo }; `parcelas`: [{ numero, valor, paga, data_vencimento }].
export function resumoFinanciamento(fin, parcelas, hoje) {
  const lista = [...(parcelas || [])].sort((a, b) => a.numero - b.numero)
  const n = lista.length
  const pagas = lista.filter((p) => p.paga).length
  const restantes = lista.filter((p) => !p.paga)
  const faltaPagar = r2(restantes.reduce((s, p) => s + Number(p.valor || 0), 0))
  const jaPago = r2(lista.filter((p) => p.paga).reduce((s, p) => s + Number(p.valor || 0), 0))
  const proxima = restantes[0] || null
  const ultima = lista[n - 1] || null
  const atrasadas = hoje ? restantes.filter((p) => p.data_vencimento < hoje).length : 0
  const pv = Number(fin?.valor_financiado) || 0
  const parcelaRef = Number(proxima?.valor || lista[0]?.valor || 0)

  let i = taxaMensal(fin?.taxa_valor, fin?.taxa_periodo)
  let jurosEstimados = false
  if (i == null && pv > 0 && fin?.sistema !== 'sac') { i = taxaImplicita(pv, parcelaRef, n); jurosEstimados = i != null }

  let saldo, base
  if (pv > 0 && i != null) {
    saldo = fin?.sistema === 'sac' ? saldoSac(pv, n, pagas) : saldoPrice(pv, i, n, pagas)
    base = 'juros'
  } else {
    saldo = faltaPagar
    base = 'soma'
  }
  saldo = r2(Math.min(saldo, faltaPagar || saldo))
  return {
    n, pagas, restantes: restantes.length, faltaPagar, jaPago, proxima, ultima, atrasadas,
    saldo, base, taxaMensal: i, jurosEstimados, parcelaRef, pv,
    progresso: n ? Math.round((pagas / n) * 100) : 0, quitado: n > 0 && pagas >= n,
  }
}

// Pagamentos (só amortização + juros) a partir de um saldo, até zerar.
function cronograma({ saldo, i, sistema, pmt, amort, limite = 1200 }) {
  const out = []
  let s = saldo
  for (let k = 0; k < limite && s > 0.005; k++) {
    const juros = s * (i > 0 ? i : 0)
    let a = sistema === 'sac' ? amort : pmt - juros
    if (!(a > 0)) return null // parcela não cobre os juros
    if (a > s) a = s
    out.push(juros + a)
    s -= a
  }
  return out
}

// "E se eu amortizar X agora?" — modo 'prazo' (mesma parcela, termina antes) ou 'parcela'
// (mesmo prazo, parcela menor). Usa o saldo estimado e a taxa do resumo.
// Devolve { ok, motivo?, parcelasAntes, parcelasDepois, menosParcelas, parcelaAntes,
// parcelaDepois, totalAntes, totalDepois, economia, terminaDepois? } (valores sem seguro/taxas).
export function simularAmortizacao(resumo, sistema, extra, modo = 'prazo') {
  const x = Number(extra) || 0
  const m = resumo?.restantes || 0
  const s = Number(resumo?.saldo) || 0
  const i = resumo?.taxaMensal
  if (!(x > 0)) return { ok: false, motivo: 'valor' }
  if (!m || !(s > 0)) return { ok: false, motivo: 'quitado' }
  if (x >= s - 0.005) return { ok: true, quita: true, economia: r2(Math.max(0, totalAntes() - x)), parcelasAntes: m, parcelasDepois: 0, menosParcelas: m }

  function totalAntes() {
    if (!(i > 0)) return s
    const base = sistema === 'sac' ? cronograma({ saldo: s, i, sistema, amort: s / m }) : cronograma({ saldo: s, i, sistema, pmt: parcelaPrice(s, i, m) })
    return (base || []).reduce((a, b) => a + b, 0)
  }

  // Sem juros: amortizar só adianta parcelas (nada de economia).
  if (!(i > 0)) {
    const p = s / m
    const novo = s - x
    const depois = modo === 'prazo' ? Math.ceil(novo / p - 1e-9) : m
    return {
      ok: true, semJuros: true, parcelasAntes: m, parcelasDepois: depois, menosParcelas: m - depois,
      parcelaAntes: r2(p), parcelaDepois: r2(modo === 'prazo' ? p : novo / m), totalAntes: r2(s), totalDepois: r2(novo), economia: 0,
    }
  }

  const antes = sistema === 'sac'
    ? cronograma({ saldo: s, i, sistema, amort: s / m })
    : cronograma({ saldo: s, i, sistema, pmt: parcelaPrice(s, i, m) })
  const novo = s - x
  let depois
  if (modo === 'prazo') {
    depois = sistema === 'sac'
      ? cronograma({ saldo: novo, i, sistema, amort: s / m })
      : cronograma({ saldo: novo, i, sistema, pmt: parcelaPrice(s, i, m) })
  } else {
    depois = sistema === 'sac'
      ? cronograma({ saldo: novo, i, sistema, amort: novo / m })
      : cronograma({ saldo: novo, i, sistema, pmt: parcelaPrice(novo, i, m) })
  }
  if (!antes || !depois) return { ok: false, motivo: 'juros' }
  const totalA = antes.reduce((a, b) => a + b, 0)
  const totalD = depois.reduce((a, b) => a + b, 0)
  return {
    ok: true, parcelasAntes: antes.length, parcelasDepois: depois.length, menosParcelas: antes.length - depois.length,
    parcelaAntes: r2(antes[0]), parcelaDepois: r2(depois[0]), totalAntes: r2(totalA), totalDepois: r2(totalD),
    economia: r2(Math.max(0, totalA - totalD - x)),
  }
}
