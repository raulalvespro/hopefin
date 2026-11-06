// Fonte da verdade dos preços é a tabela planos_config no banco (RPC
// planos_publicos()). Aqui ficam só o fallback (caso a RPC não responda) e os
// helpers que derivam os preços "vigentes" conforme o lançamento ainda vale.
//
// Oferta (06/11/2026):
//   Mensal           : R$ 24,90 (Pix ou cartão, sem desconto)
//   Anual normal     : R$ 199,90 Pix  ou 12x R$ 19,90 (R$ 238,80)
//   Anual lançamento : R$ 149,90 Pix  ou 12x R$ 14,90 (R$ 178,80) até 31/12/2026

export const PRECOS_PADRAO = {
  mensal_centavos: 2490,
  anual_pix_centavos: 19990,
  anual_cartao_centavos: 23880,
  anual_cartao_parcela_centavos: 1990,
  lanc_anual_pix_centavos: 14990,
  lanc_anual_cartao_centavos: 17880,
  lanc_anual_cartao_parcela_centavos: 1490,
  lancamento_ate: '2026-12-31T23:59:59-03:00',
  lancamento_ativo: true,
  trial_dias: 7,
}

// 12 meses do mensal — referência para o % de economia do anual.
export const anoNoMensal = p => p.mensal_centavos * 12

// Preços vigentes (aplica o lançamento quando ainda vale) num formato estável
// para as telas. Centavos.
export function precosVigentes(cfg) {
  const p = { ...PRECOS_PADRAO, ...(cfg || {}) }
  const lanc = !!p.lancamento_ativo
  return {
    bruto: p,
    lancamentoAtivo: lanc,
    lancamentoAte: p.lancamento_ate,
    trialDias: p.trial_dias,
    mensal: p.mensal_centavos,
    // anual — Pix à vista
    anualPix: lanc ? p.lanc_anual_pix_centavos : p.anual_pix_centavos,
    anualPixNormal: p.anual_pix_centavos,
    // anual — cartão 12x (total e valor da parcela)
    anualCartao: lanc ? p.lanc_anual_cartao_centavos : p.anual_cartao_centavos,
    anualCartaoParcela: lanc ? p.lanc_anual_cartao_parcela_centavos : p.anual_cartao_parcela_centavos,
    anualCartaoNormal: p.anual_cartao_centavos,
    anualCartaoParcelaNormal: p.anual_cartao_parcela_centavos,
  }
}

// % de economia do anual (num dado método) frente a 12x o mensal.
export function economiaPct(anualCentavos, mensalCentavos) {
  return Math.round((1 - anualCentavos / (mensalCentavos * 12)) * 100)
}

// Equivalente por mês de um preço anual (centavos -> reais).
export const porMesReais = anualCentavos => anualCentavos / 12 / 100
