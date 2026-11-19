// Busca e filtros (A3.1, 19/11/2026) — Gastos, Parcelamentos e Assinaturas.
// A busca ignora acento e maiúscula e acha pedaço da palavra; todas as palavras digitadas
// precisam aparecer em algum campo do item ("mercado extra" acha "Supermercado Extra").

export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function casaTexto(texto, campos) {
  const termos = semAcento(texto).split(/\s+/).filter(Boolean)
  if (!termos.length) return true
  const alvo = (campos || []).map(semAcento).join(' ')
  return termos.every((t) => alvo.includes(t))
}

// Valor digitado ("9,90", "9.9", "1200") → número, ou null se vazio/inválido.
export function lerValor(s) {
  const t = String(s ?? '').trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export const filtroVazio = () => ({ texto: '', de: '', ate: '', categorias: [], origens: [], pessoas: [], tipos: [], min: '', max: '' })

// Quantos filtros (fora a busca) estão ligados — mostrado no botão "Filtros".
export const qtdFiltros = (f) =>
  (f.de || f.ate ? 1 : 0) + (f.categorias.length ? 1 : 0) + (f.origens.length ? 1 : 0) + (f.pessoas.length ? 1 : 0)
  + (f.tipos.length ? 1 : 0) + (lerValor(f.min) != null || lerValor(f.max) != null ? 1 : 0)

export const temFiltro = (f) => !!f.texto.trim() || qtdFiltros(f) > 0

// `ler(item)` devolve { texto: [campos], data, categoria, origem, pessoas: [nomes], tipos: [..], valor }.
// Listas vazias no filtro = não filtra por aquilo. Pessoas e tipos: basta um em comum.
export function filtrar(itens, f, ler) {
  const min = lerValor(f.min)
  const max = lerValor(f.max)
  return (itens || []).filter((it) => {
    const v = ler(it)
    if (!casaTexto(f.texto, v.texto)) return false
    if (f.de && v.data && v.data < f.de) return false
    if (f.ate && v.data && v.data > f.ate) return false
    if (f.categorias.length && !f.categorias.includes(v.categoria)) return false
    if (f.origens.length && !f.origens.includes(v.origem)) return false
    if (f.pessoas.length && !(v.pessoas || []).some((p) => f.pessoas.includes(p))) return false
    if (f.tipos.length && !(v.tipos || []).some((t) => f.tipos.includes(t))) return false
    if (min != null && Number(v.valor) < min) return false
    if (max != null && Number(v.valor) > max) return false
    return true
  })
}

// Valores distintos (sem vazio), em ordem alfabética — opções dos filtros.
export const distintos = (lista) => [...new Set((lista || []).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'))

// Atalhos de período a partir de hoje ('YYYY-MM-DD'): este mês, últimos 3 e 12 meses (até o fim do mês).
export function periodoAtalho(tipo, hoje) {
  const [a, m] = String(hoje).slice(0, 7).split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const fim = `${a}-${String(m).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
  const voltar = tipo === '12m' ? 11 : tipo === '3m' ? 2 : 0
  const t = a * 12 + (m - 1) - voltar
  const de = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`
  return { de, ate: fim }
}
