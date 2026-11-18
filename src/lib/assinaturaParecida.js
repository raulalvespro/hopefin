// Compra que parece uma assinatura já cadastrada (A0.7, 18/11/2026).
//
// A assinatura cadastrada já entra sozinha todo mês (na fatura do cartão ou nas contas do
// mês) — se a pessoa lançar a mesma cobrança como gasto, ela conta 2x. O Novo gasto usa
// esta regra pra avisar antes de salvar.
//
// Parece quando: o NOME bate (palavras inteiras, sem acento, ignorando palavras genéricas
// como "pagamento" ou "mensal") ou o VALOR é o mesmo no mesmo cartão (ou os dois sem
// cartão). Se várias batem, vale a que bate nome E valor.

const GENERICAS = new Set([
  'mercado', 'compra', 'compras', 'pagamento', 'pgto', 'conta', 'cartao', 'plano', 'mensal', 'mensalidade',
  'assinatura', 'servico', 'servicos', 'loja', 'online', 'debito', 'credito', 'com', 'www',
])

export const palavras = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERICAS.has(w))

// form: { descricao, valor, tipo_pagamento, cartao_id } · assinaturas: [{ id, nome, valor, cartao_id }]
export function assinaturaParecida(form, assinaturas) {
  const pd = palavras(form.descricao)
  const v = parseFloat(form.valor)
  const cartao = form.tipo_pagamento === 'cartao' ? (form.cartao_id || '') : ''
  let achada = null
  for (const a of assinaturas || []) {
    const pa = palavras(a.nome)
    const nome = pd.length > 0 && pa.length > 0 && (pa.every((w) => pd.includes(w)) || pd.every((w) => pa.includes(w)))
    const valor = v > 0 && Math.abs(Number(a.valor) - v) < 0.005 && (a.cartao_id || '') === cartao
    if (nome && valor) return a
    if ((nome || valor) && !achada) achada = a
  }
  return achada
}
