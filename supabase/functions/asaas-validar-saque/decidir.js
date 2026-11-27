// Regra do "Mecanismo para validação de saque via webhooks" do Asaas (preparado em 27/11/2026, DESLIGADO até o
// Raul cadastrar a URL no Asaas — ver docs/REEMBOLSOS.md). Função pura: o index.ts busca os dados e chama aqui.
//
// O Asaas pergunta antes de cada saída de dinheiro: { type, <objeto> } e espera { status: 'APPROVED' } ou
// { status: 'REFUSED', refuseReason }. Resposta inválida ou 3 falhas seguidas = operação cancelada (seguro).
//
// Regra (só aprova o que o próprio app pediu):
//  - PIX_REFUND: aprova só se existe reembolso ABERTO (status 'pendente') em reembolsos_pendentes pra MESMA
//    cobrança (pixRefund.payment) e com o MESMO valor em centavos. Um estorno aprovado por cobrança: se já
//    aprovamos outro id pra essa cobrança, recusa (repetição do mesmo id = aprova de novo).
//  - Qualquer outro tipo (TRANSFER, BILL, PIX_QR_CODE, MOBILE_PHONE_RECHARGE, PAYMENT_SPLIT): o app nunca faz
//    isso pela API → recusa. Por isso, ao ligar no Asaas, NÃO marcar "incluir operações feitas pela interface web"
//    (senão os saques do Raul pelo site do Asaas também seriam recusados).

export const OK = { status: 'APPROVED' }
const nao = (refuseReason) => ({ status: 'REFUSED', refuseReason })

export function centavos(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
}

/**
 * @param {object} corpo        corpo que o Asaas mandou
 * @param {Array}  pendentes    linhas de reembolsos_pendentes da cobrança (id, asaas_payment_id, valor_centavos, status)
 * @param {Array}  aprovadosIds ids de estorno (pixRefund.id) já aprovados antes pra essa cobrança
 * @returns {{ status: 'APPROVED'|'REFUSED', refuseReason?: string, reembolsoId?: string }}
 */
export function decidir(corpo, pendentes = [], aprovadosIds = []) {
  const tipo = corpo?.type
  if (tipo !== 'PIX_REFUND') return nao(`Operação ${tipo || 'desconhecida'} não foi pedida pelo app HopeFin.`)

  const r = corpo?.pixRefund || {}
  const pagamento = r.payment
  if (!pagamento) return nao('Estorno sem cobrança de origem.')
  const valor = centavos(r.value)
  if (!valor) return nao('Valor do estorno inválido.')

  const aberto = pendentes.find((p) => p.asaas_payment_id === pagamento && p.status === 'pendente')
  if (!aberto) return nao('Nenhum pedido de reembolso aberto no HopeFin para essa cobrança.')
  if (Number(aberto.valor_centavos) !== valor) {
    return nao(`Valor diferente do reembolso pedido (pedido ${aberto.valor_centavos} centavos, estorno ${valor}).`)
  }
  const outros = aprovadosIds.filter((id) => id && id !== r.id)
  if (outros.length) return nao('Já existe um estorno aprovado para essa cobrança.')

  return { ...OK, reembolsoId: aberto.id }
}

// O que vai pro webhook_log: sem conta, CPF/CNPJ ou chave Pix de ninguém (LGPD).
export function resumoSeguro(corpo) {
  const r = corpo?.pixRefund
  if (!r) return { type: corpo?.type || null }
  return {
    type: corpo.type,
    id: r.id || null,
    payment: r.payment || null,
    value: r.value ?? null,
    status: r.status || null,
    originType: r.originType || null,
    originalTransaction: r.originalTransaction ? { id: r.originalTransaction.id, value: r.originalTransaction.value } : null,
  }
}
