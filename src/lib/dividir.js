// Dividir uma conta com outras pessoas (A8.6, 19/11/2026 noite).
// A compra continua inteira na fatura/no pagamento; a PARTE de cada pessoa vira um "a receber"
// ligado à compra (a_receber.gasto_id / parcelamento_id) e sai do SEU gasto (motor: meuGastoDoMes).
import { vencimentoDaComp, compDaCompra, compDe, arred } from '@motor/motor.js'

const valorNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }

// Partes iguais entre você e N pessoas; os centavos que sobram ficam na sua parte.
export function partesIguais(total, n) {
  if (!(n > 0) || !(total > 0)) return []
  const p = Math.floor((total / (n + 1)) * 100) / 100
  return Array.from({ length: n }, () => p)
}

// Partes com pessoa e valor > 0; soma, a sua parte e se passou do total.
export function resumoPartes(total, partes) {
  const ok = (partes || []).filter((p) => String(p.nome || '').trim() && valorNum(p.valor) > 0)
    .map((p) => ({ ...p, valor: arred(valorNum(p.valor)) }))
  const soma = arred(ok.reduce((s, p) => s + p.valor, 0))
  return { ok, soma, minha: arred(total - soma), excede: soma > total + 0.004, vazias: (partes || []).length - ok.length }
}

// Dia em que o dinheiro sai (mês em que a parte fica "a receber"): no cartão, o vencimento da
// fatura em que a compra cai; à vista, a própria data. Mesma regra do A Receber (itensDeTerceiros).
export function dataSaidaGasto(cartao, data, ajuste = 0) {
  return cartao ? vencimentoDaComp(cartao, compDaCompra(cartao, data, ajuste)) : data
}

const texto = (d) => `${String(d || '').trim()} (parte)`.slice(0, 120)

// Linhas de a_receber das partes de UMA compra (à vista ou no cartão).
export function linhasPartesGasto({ grupoId, gasto, partes, dataSaida }) {
  return partes.filter((p) => p.pessoaId && p.valor > 0).map((p) => ({
    grupo_id: grupoId, pessoa_id: p.pessoaId, descricao: texto(gasto.descricao), valor: arred(p.valor),
    data: dataSaida, gasto_id: gasto.id, recorrente: false,
  }))
}

// Linhas das partes de um PARCELADO: em cada parcela (a partir de `aPartirDe`), a mesma fração
// da pessoa (parte ÷ total da compra). Uma série por pessoa. Parcela que a pessoa já te pagou
// (`jaRecebidas`: "pessoaId|numero") não ganha outra.
export function linhasPartesParcelado({ grupoId, parcelamento, parcelas, partes, cartao = null, aPartirDe = 1, jaRecebidas = new Set(), novoId }) {
  const total = Number(parcelamento.valor_total) || (parcelas || []).reduce((s, p) => s + Number(p.valor || 0), 0)
  if (!(total > 0)) return []
  const out = []
  for (const p of partes.filter((x) => x.pessoaId && x.valor > 0)) {
    const fracao = p.valor / total
    const serie = novoId()
    for (const pc of parcelas) {
      if (Number(pc.numero) < aPartirDe || jaRecebidas.has(`${p.pessoaId}|${pc.numero}`)) continue
      const valor = arred(Number(pc.valor) * fracao)
      if (!(valor > 0)) continue
      out.push({
        grupo_id: grupoId, pessoa_id: p.pessoaId, descricao: texto(parcelamento.descricao), valor,
        data: cartao ? vencimentoDaComp(cartao, compDe(pc.data_vencimento)) : pc.data_vencimento,
        parcelamento_id: parcelamento.id, parcela_num: Number(pc.numero), parcela_total: Number(parcelamento.num_parcelas),
        serie_id: serie, recorrente: false,
      })
    }
  }
  return out
}

// Parcela arredonda pra centavo, então 1/3 de 300 volta como 99,99: perto de uma fração redonda
// do total (1/2, 1/3, 2/3, 1/4…), mostra a fração (100,00). Não muda as partes: salvar de novo dá igual.
function fracaoRedonda(valor, total, nParcelas = 1) {
  const tolerancia = Math.max(0.05, 0.01 * (Number(nParcelas) || 1))
  let melhor = valor
  let dif = Infinity
  for (let d = 2; d <= 6; d++) {
    for (let k = 1; k < d; k++) {
      const alvo = Math.floor((total * k / d) * 100) / 100
      const x = Math.abs(alvo - valor)
      if (x < dif) { dif = x; melhor = alvo }
    }
  }
  return dif <= tolerancia ? melhor : valor
}

// Partes salvas de uma compra → formulário (nome + valor no total). Parcelado: a fração da
// parcela vira valor no total da compra.
export function partesDoBanco(linhas, { total, parcelado = false } = {}) {
  const porPessoa = new Map()
  for (const l of linhas || []) {
    const nome = l.pessoas?.nome || l.pessoa_nome
    if (!l.pessoa_id || !nome || porPessoa.has(l.pessoa_id)) continue
    let valor = Number(l.valor)
    if (parcelado && l.valor_parcela > 0) valor = fracaoRedonda(arred((Number(l.valor) / Number(l.valor_parcela)) * total), total, l.parcela_total)
    porPessoa.set(l.pessoa_id, { nome, valor: valor.toFixed(2) })
  }
  return [...porPessoa.values()]
}

// Grava as partes de uma compra (gasto) OU de um parcelado no banco: apaga as que ainda não foram
// recebidas e cria as novas. O que a pessoa já te pagou fica (e não ganha outra). `partes`: as
// válidas, com pessoaId. Sem partes = só apaga as em aberto (deixou de dividir). Devolve true/false.
export async function salvarPartes(cliente, { grupoId, gasto = null, parcelamento = null, partes = [], cartao = null, data = null, ajuste = 0, aPartirDe = 1 }) {
  const campo = gasto ? 'gasto_id' : 'parcelamento_id'
  const id = gasto ? gasto.id : parcelamento?.id
  if (!id) return false
  const { data: ja, error: e1 } = await cliente.from('a_receber').select('pessoa_id, parcela_num').eq(campo, id).eq('recebido', true)
  if (e1) return false
  const del = await cliente.from('a_receber').delete().eq(campo, id).eq('recebido', false)
  if (del.error) return false
  if (!partes.length) return true
  let linhas
  if (gasto) {
    const recebidas = new Set((ja || []).map((x) => x.pessoa_id))
    linhas = linhasPartesGasto({ grupoId, gasto, partes: partes.filter((p) => !recebidas.has(p.pessoaId)), dataSaida: dataSaidaGasto(cartao, data || gasto.data, ajuste) })
  } else {
    const { data: parcelas, error: e2 } = await cliente.from('parcelas').select('numero, valor, data_vencimento').eq('parcelamento_id', id).order('numero')
    if (e2) return false
    linhas = linhasPartesParcelado({
      grupoId, parcelamento, parcelas: parcelas || [], partes, cartao, aPartirDe,
      jaRecebidas: new Set((ja || []).map((x) => `${x.pessoa_id}|${x.parcela_num}`)),
      novoId: () => crypto.randomUUID(),
    })
  }
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await cliente.from('a_receber').insert(linhas.slice(i, i + 500))
    if (error) return false
  }
  return true
}
