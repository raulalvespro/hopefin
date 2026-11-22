// regras.js — qual e-mail do remarketing sai hoje para cada pessoa (D11, 22/11/2026).
// Sem rede e sem banco (testes em tests/automacoes-email.test.js).

// Dias entre duas datas 'YYYY-MM-DD' (b − a).
export function diasEntre(a, b) {
  const [ay, am, ad] = String(a).slice(0, 10).split('-').map(Number)
  const [by, bm, bd] = String(b).slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

// Próxima etapa da sequência para uma pessoa, ou null.
//   etapas: modelos da sequência ({ chave, dias, ligado, ordem })
//   entrouEm: dia em que o teste acabou / o acesso pago acabou
//   enviadas: Set das chaves que a pessoa já recebeu
//   ultimoEnvio: data do último e-mail de remarketing pra ela (ou null)
//   intervalo: no máximo 1 e-mail a cada N dias
// Regra: a sequência só anda pra frente. Entre as etapas ligadas que já venceram e vêm DEPOIS da última
// que ela recebeu, sai a mais adiantada (quem entrou atrasado não recebe as antigas em fila).
export function proximaEtapa({ etapas, entrouEm, hoje, enviadas, ultimoEnvio = null, intervalo = 7 }) {
  if (ultimoEnvio && diasEntre(ultimoEnvio, hoje) < intervalo) return null
  const idade = diasEntre(entrouEm, hoje)
  const jaFoi = etapas.filter((e) => enviadas.has(e.chave)).reduce((mx, e) => Math.max(mx, Number(e.dias) || 0), -1)
  const vencidas = etapas
    .filter((e) => e.ligado && e.dias != null && Number(e.dias) <= idade && Number(e.dias) > jaFoi && !enviadas.has(e.chave))
    .sort((a, b) => (Number(b.dias) - Number(a.dias)) || ((b.ordem || 0) - (a.ordem || 0)))
  return vencidas[0] || null
}

// E-mail de data marcada (ex.: oferta até 31/12): sai no dia marcado ou até 2 dias depois (se o envio
// diário falhar), e só com a oferta de lançamento valendo quando a condição pede.
export function dataFixaValeHoje(modelo, hoje, precos) {
  if (!modelo?.ligado || modelo.gatilho !== 'data_fixa' || !modelo.data_envio) return false
  const d = diasEntre(modelo.data_envio, hoje)
  if (d < 0 || d > 2) return false
  if (modelo.condicao === 'oferta_lancamento' && !precos?.lancamento_ativo) return false
  return true
}
