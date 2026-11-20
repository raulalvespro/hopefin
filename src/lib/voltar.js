// Para onde voltar depois de editar algo que foi aberto por outra tela (A8.7).
// Só destinos conhecidos: nada de endereço livre vindo da URL.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COMP = /^\d{4}-(0[1-9]|1[0-2])$/

const faturaValida = (cardId, comp) => UUID.test(cardId || '') && COMP.test(comp || '')

// Pedaço da URL que leva de volta à fatura que estava aberta (cartão + mês da fatura).
export function paramsVoltarFatura(detalhe) {
  if (!detalhe || !faturaValida(detalhe.cardId, detalhe.comp)) return 'voltar=cartoes'
  return `voltar=cartoes&cartao=${detalhe.cardId}&comp=${detalhe.comp}`
}

// Destino do "voltar" de ?voltar=gastos|assinaturas|cartoes (+ cartao e comp da fatura).
export function destinoVoltar(params) {
  const v = params.get('voltar')
  if (v === 'gastos') return '/gastos'
  if (v === 'assinaturas') return '/assinaturas'
  if (v === 'cartoes') {
    const c = params.get('cartao'), m = params.get('comp')
    return faturaValida(c, m) ? `/cartoes?cartao=${c}&comp=${m}` : '/cartoes'
  }
  return null
}

// Fatura pra reabrir quando Cartões abre com ?cartao=&comp= (volta do editar), ou null.
export function faturaPedida(params) {
  const c = params.get('cartao'), m = params.get('comp')
  return faturaValida(c, m) ? { cardId: c, comp: m } : null
}
