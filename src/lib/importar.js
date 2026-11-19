// Importar extrato ou fatura em CSV (A4.1, 19/11/2026): pra onde vai cada linha.
// Funções puras (testadas em tests/importar.test.js); a tela é src/pages/Importar.jsx.
import { compDaCompra, addMeses, compDe, cobrancasNaFatura, assinaturaConta } from '@motor/motor.js'

const centavos = (v) => Math.round(Math.abs(Number(v) || 0) * 100)

// O que é o arquivo:
//  • 'extrato'  — extrato da conta: negativo vira gasto, positivo vira entrada (como sempre foi);
//  • 'entradas' — tudo vira entrada;
//  • 'gastos'   — tudo vira gasto à vista (Pix/débito ou dinheiro);
//  • 'cartao'   — fatura de um cartão: cada compra vira gasto naquele cartão; pagamento da
//                 fatura e estorno (o sinal contrário ao das compras) ficam de fora.
export const DESTINOS = ['extrato', 'cartao', 'gastos', 'entradas']

// { tipo: 'gasto' | 'entrada' | null, fora?: 'zero' | 'pagamento' }
export function classificarLinha(valor, destino, sinalCompras = 1) {
  if (!Number.isFinite(valor) || Math.abs(valor) < 0.005) return { tipo: null, fora: 'zero' }
  if (destino === 'entradas') return { tipo: 'entrada' }
  if (destino === 'gastos') return { tipo: 'gasto' }
  if (destino === 'cartao') return Math.sign(valor) === sinalCompras ? { tipo: 'gasto' } : { tipo: null, fora: 'pagamento' }
  return { tipo: valor >= 0 ? 'entrada' : 'gasto' }
}

// No extrato da conta, a linha que PAGA a fatura do cartão não é gasto novo: as compras já contam
// pela fatura no app. Vem desmarcada (dá pra marcar). Conservador de propósito.
const RE_PAGAMENTO_FATURA = [
  /\b(pagamento|pagto|pgto|pag)\b[^0-9]{0,20}\b(fatura|cart[aã]o|cartao de cr[eé]dito)\b/i,
  /\bfatura\b[^0-9]{0,20}\bcart[aã]o\b/i,
  /\bcart[aã]o\b[^0-9]{0,20}\bfatura\b/i,
]
export const parecePagamentoDeFatura = (descricao) => RE_PAGAMENTO_FATURA.some((re) => re.test(String(descricao || '')))

// Na fatura do cartão as compras vêm positivas (quase todo banco) ou negativas: vale a maioria.
export function sinalDasCompras(valores) {
  let pos = 0, neg = 0
  for (const v of valores) { if (v > 0) pos++; else if (v < 0) neg++ }
  return neg > pos ? -1 : 1
}

const mesesEntre = (de, ate) => {
  const [ya, ma] = de.split('-').map(Number)
  const [yb, mb] = ate.split('-').map(Number)
  return (yb * 12 + mb) - (ya * 12 + ma)
}

// Fatura (mês do vencimento, 'YYYY-MM') em que a compra cai pela data — a "natural".
export const faturaDaData = (cartao, data) => compDaCompra(cartao, data, 0)

// Quantas faturas mover (gastos.fatura_ajuste) pra uma compra feita em `data` cair na fatura
// `compAlvo`. Serve pra fatura importada: parcela "3/10" vem com a data da compra original,
// mas é cobrada NESTA fatura.
export function ajusteParaFatura(cartao, data, compAlvo) {
  return mesesEntre(faturaDaData(cartao, data), compAlvo)
}

// A fatura que o arquivo provavelmente é: a da compra mais recente.
export function faturaProvavel(cartao, datas) {
  const validas = (datas || []).filter(Boolean).sort()
  if (!validas.length) return null
  return faturaDaData(cartao, validas[validas.length - 1])
}

export const outraFatura = (comp, delta) => addMeses(comp, delta)

// Chave pra achar o que já foi lançado: mesma data e mesmo valor (em centavos).
export const chaveRepetido = (data, valor) => `${data}|${centavos(valor)}`
// ...e, na fatura do cartão, mesmo valor na mesma fatura (parcela de parcelado ou assinatura).
export const chaveFatura = (comp, valor) => `${comp}|${centavos(valor)}`

// O que já está no app, pra marcar as linhas que parecem repetidas (vêm desmarcadas):
//  • gasto/entrada com a mesma data e o mesmo valor;
//  • na fatura do cartão, também parcela (de parcelado do app) e assinatura DAQUELE cartão com o
//    mesmo valor na mesma fatura — senão a parcela "3/10" e a Netflix entrariam duas vezes.
// `parcelas`: [{ valor, data_vencimento, parcelamentos: { cartao_id } }]; `comps`: faturas em jogo.
export function montarJaLancados({ gastos = [], entradas = [], parcelas = [], assinaturas = [], cartao = null, comps = [] }) {
  const g = new Set(gastos.map((x) => chaveRepetido(x.data, x.valor)))
  const e = new Set(entradas.map((x) => chaveRepetido(x.data, x.valor)))
  const f = new Set()
  if (cartao) {
    for (const p of parcelas) {
      if (p.parcelamentos?.cartao_id === cartao.id) f.add(chaveFatura(compDe(p.data_vencimento), p.valor))
    }
    for (const a of assinaturas) {
      if (a.cartao_id !== cartao.id || !assinaturaConta(a)) continue
      for (const comp of comps) if (cobrancasNaFatura(a, cartao, comp).length) f.add(chaveFatura(comp, a.valor))
    }
  }
  return { gastos: g, entradas: e, fatura: f }
}
