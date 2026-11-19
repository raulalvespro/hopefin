// Cobrança do A Receber (A1.15 / A1.16): de onde veio cada item e a mensagem pro WhatsApp.
import { fmt, fmtData } from './format'

// Rótulo da origem de um item (itensDeTerceiros do motor → item.origem).
export function rotuloOrigem(o) {
  switch (o?.tipo) {
    case 'cartao': return o.cartaoNome || 'Cartão'
    case 'avista':
      if (o.forma === 'dinheiro') return 'Dinheiro'
      if (o.forma === 'debito') return 'Débito'
      if (o.forma === 'cartao') return 'Cartão (não informado)'
      return 'Pix'
    case 'parcelado': return 'Parcelado sem cartão'
    case 'conta_fixa': return o.contaFixaNome ? `Conta fixa: ${o.contaFixaNome}` : 'Conta fixa'
    case 'todo_mes': return 'Todo mês'
    default: return 'Lançado à mão'
  }
}

// Nome do item na lista: parcela (do parcelado ou do a receber parcelado, A8.17) ganha "(3/12)".
export const nomeItem = (i) => `${String(i.descricao || 'Sem descrição').trim()}${(i.tipo === 'parcela' || i.tipo === 'manual') && i.numero && i.deTotal ? ` (${i.numero}/${i.deTotal})` : ''}`

// Itens agrupados pela origem (cartão primeiro, na ordem em que aparecem), cada grupo com total.
export function agruparPorOrigem(itens) {
  const grupos = new Map()
  for (const i of [...itens].sort((a, b) => String(a.dataSaida || a.data).localeCompare(String(b.dataSaida || b.data)))) {
    const rotulo = rotuloOrigem(i.origem)
    if (!grupos.has(rotulo)) grupos.set(rotulo, { rotulo, itens: [], total: 0 })
    const g = grupos.get(rotulo)
    g.itens.push(i)
    g.total = Math.round((g.total + Number(i.valor || 0)) * 100) / 100
  }
  return [...grupos.values()]
}

// "Pagar até": por padrão, o último vencimento entre os itens do mês.
export const pagarAtePadrao = (itens) => itens.reduce((m, i) => ((i.dataSaida || i.data) > m ? (i.dataSaida || i.data) : m), '')

const semFormatacao = (s) => String(s || '').replace(/[*_~`]/g, '')

// Mensagem pro WhatsApp: *negrito* do próprio WhatsApp, só o mês, agrupada por origem.
export function textoCobranca({ nome, mesNome, itens, ate = '', pix = '' }) {
  const primeiro = semFormatacao(String(nome || '').trim().split(/\s+/)[0])
  const total = Math.round(itens.reduce((s, i) => s + Number(i.valor || 0), 0) * 100) / 100
  const linhas = [primeiro ? `Oi, ${primeiro}! 👋` : 'Oi! 👋', `Segue o resumo de *${mesNome}*:`, '']
  for (const g of agruparPorOrigem(itens)) {
    linhas.push(`*${semFormatacao(g.rotulo)}*`)
    for (const i of g.itens) linhas.push(`• ${semFormatacao(nomeItem(i))} — ${fmt(i.valor)}`)
    linhas.push('')
  }
  linhas.push(`*Total: ${fmt(total)}*`)
  if (ate) linhas.push(`Pode me pagar até *${fmtData(ate, 'dd/MM')}*? 🙏`)
  if (pix) linhas.push('', 'Pix copia e cola:', pix)
  return linhas.join('\n')
}
