// Receber de uma pessoa (A Receber). A8.4 (19/11/2026 noite): a pessoa pode pagar só uma PARTE.
// Quita do mais antigo pro mais novo; o que sobrar sem cobrir o próximo item inteiro vira
// "Pago por conta" (valor negativo que abate o que ela deve). Mesma regra da RPC
// receber_parte_de_pessoa (migração 0076) — aqui é só a prévia que aparece na tela.
const r2 = (v) => Math.round(Number(v || 0) * 100) / 100

// Ordem de quitar: "pago por conta" (negativo) primeiro, depois do mês mais antigo pro mais novo.
export function ordemParaReceber(itens) {
  return [...(itens || [])].sort((a, b) => {
    const ca = Number(a.valor) < 0, cb = Number(b.valor) < 0
    if (ca !== cb) return ca ? -1 : 1
    return String(a.comp || '').localeCompare(String(b.comp || '')) ||
      String(a.dataSaida || a.data || '').localeCompare(String(b.dataSaida || b.data || ''))
  })
}

export function simularRecebimento(itens, valor) {
  const ordem = ordemParaReceber(itens)
  const total = r2(ordem.reduce((s, i) => s + Number(i.valor || 0), 0))
  let resto = r2(valor)
  const quitados = []
  for (const i of ordem) {
    if (resto + 0.005 < Number(i.valor)) break
    resto = r2(resto - Number(i.valor))
    quitados.push(i)
  }
  const porConta = resto > 0.004 ? resto : 0
  return { ordem, quitados, porConta, total, faltam: r2(Math.max(0, total - r2(valor))), parcial: r2(valor) < total - 0.004 }
}
