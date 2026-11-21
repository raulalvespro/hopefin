// desconto.js — a conta do cupom de desconto (0084, 21/11/2026). A MESMA no app (Meu plano e
// checkout) e no servidor (asaas-assinar), pra o preço que a pessoa vê ser o preço que ela paga.
// Sem rede e sem banco (testes em tests/desconto.test.js).

const pctValido = (pct) => Number.isInteger(pct) && pct >= 1 && pct <= 90

// Preço à vista com desconto, em centavos (arredonda pro centavo mais próximo).
export function comDesconto(centavos, pct) {
  const c = Math.round(Number(centavos) || 0)
  if (!pctValido(pct)) return c
  return Math.round((c * (100 - pct)) / 100)
}

// Anual no cartão em 12x: o desconto vale na parcela, e o total é 12 × a parcela (fecha certinho).
export function parceladoComDesconto(totalCentavos, parcelaCentavos, pct, n = 12) {
  if (!pctValido(pct)) return { total: Math.round(totalCentavos), parcela: Math.round(parcelaCentavos) }
  const parcela = comDesconto(parcelaCentavos, pct)
  return { total: parcela * n, parcela }
}

export { pctValido }
