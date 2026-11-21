// regua.js — régua de fim de teste (A6.2, 20/11/2026): quais e-mails saem em que dia e o texto
// de cada um. Sem rede e sem banco (testes em tests/regua.test.js).
//
// Régua de HOJE (no ar):   2 dias antes ('fim_trial_2d') e no último dia ('fim_trial_0d').
// Régua NOVA (desligada):  3 dias antes ('fim_trial_3d'), no último dia ('fim_trial_0d') e 1 dia
//                          depois ('fim_trial_d1', "sentimos sua falta"). Liga quando o Raul aprovar
//                          os textos: admin_config.regua_fim_teste_nova = true (migração 0079).
// Preços sempre de planos_publicos() (fonte única), nunca escritos aqui.

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Qual e-mail sai hoje: d = dias até o fim do teste (2 = faltam 2 dias, 0 = hoje, -1 = foi ontem).
export function tipoDoDia(d, nova) {
  if (nova) return d === 3 ? 'fim_trial_3d' : d === 0 ? 'fim_trial_0d' : d === -1 ? 'fim_trial_d1' : null
  return d === 2 ? 'fim_trial_2d' : d === 0 ? 'fim_trial_0d' : null
}

// Quem recebe: teste que ainda não virou assinatura nem cortesia. O "1 dia depois" também vale
// pra quem já foi marcado como 'expired' (o cron encerra os testes vencidos antes de mandar).
export function recebe(sub, tipo) {
  if (!sub || sub.is_cortesia) return false
  if (tipo === 'fim_trial_d1') return sub.status === 'trial' || sub.status === 'expired'
  return sub.status === 'trial'
}

export const reais = (centavos) => `R$ ${(Math.round(Number(centavos) || 0) / 100).toFixed(2).replace('.', ',')}`

// Dia/mês no fuso de São Paulo (o fim da oferta é 31/12 23:59 em SP).
export function ddmmSP(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(d)
}
const ddmm = (ymd) => { const [, m, d] = String(ymd || '').split('-'); return m && d ? `${d}/${m}` : '' }

// Parágrafo da oferta (com os preços do banco).
export function oferta(p) {
  if (!p) return ''
  if (p.lancamento_ativo) {
    return `🎁 <strong>Oferta de lançamento:</strong> o plano anual sai por <strong>${reais(p.lanc_anual_pix_centavos)} no Pix</strong> ` +
      `(ou 12x de ${reais(p.lanc_anual_cartao_parcela_centavos)} no cartão), com o preço travado nas renovações enquanto a ` +
      `assinatura seguir ativa. Vale até ${ddmmSP(p.lancamento_ate)}. Se preferir, tem o mensal de ${reais(p.mensal_centavos)}.`
  }
  return `O Plano Família custa ${reais(p.mensal_centavos)} por mês, ou ${reais(p.anual_pix_centavos)} no ano pagando no Pix.`
}

// Conteúdo de cada e-mail. `fim` = dia em que o teste acaba (YYYY-MM-DD, horário de SP).
export function conteudoRegua(tipo, { nome, fim, precos } = {}) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0]
  const ola = primeiro ? `Oi, ${escHtml(primeiro)}! ` : 'Oi! '
  const familia = 'Um plano só serve pra família toda: até 6 pessoas no mesmo painel.'
  const of = oferta(precos)
  if (tipo === 'fim_trial_3d') return {
    assunto: 'Faltam 3 dias do seu teste no HopeFin',
    titulo: 'Faltam 3 dias de teste 💚',
    preheader: 'Seus lançamentos ficam guardados. Escolha um plano em 2 minutos.',
    corpo: `${ola}Seu teste grátis do HopeFin termina em <strong>3 dias</strong>${fim ? `, no dia ${ddmm(fim)}` : ''}.<br><br>` +
      'Tudo o que vocês lançaram até aqui fica guardado: gastos, contas do mês, cartões e o ' +
      '<strong>planejado × praticado</strong>. Pra seguir usando, é só escolher um plano — leva 2 minutos. ' +
      `${familia}${of ? `<br><br>${of}` : ''}`,
    cta: { texto: 'Escolher meu plano', url: 'https://app.hopefin.com.br/planos' },
  }
  if (tipo === 'fim_trial_0d') return {
    assunto: 'Hoje é o último dia do seu teste no HopeFin',
    titulo: 'Seu teste termina hoje',
    preheader: 'Assinando hoje, nada muda: vocês continuam de onde pararam.',
    corpo: `${ola}Hoje é o <strong>último dia</strong> do seu teste grátis.<br><br>` +
      'Assinando, vocês continuam de onde pararam: nada se perde e o painel segue o mesmo pra todo mundo do grupo.<br><br>' +
      'Se não assinar agora, tudo bem: seus dados continuam guardados e dá pra ver e exportar quando quiser. ' +
      `Só os lançamentos novos ficam pausados até a assinatura.${of ? `<br><br>${of}` : ''}`,
    cta: { texto: 'Assinar o HopeFin', url: 'https://app.hopefin.com.br/planos' },
  }
  if (tipo === 'fim_trial_d1') return {
    assunto: 'Sentimos sua falta no HopeFin',
    titulo: 'Sentimos sua falta 💚',
    preheader: 'Seus lançamentos continuam guardados, do jeitinho que você deixou.',
    corpo: `${ola}Seu teste do HopeFin terminou ontem. Seus lançamentos continuam guardados, do jeitinho que você deixou.<br><br>` +
      `Quando quiser voltar a lançar, é só ativar o plano: em 2 minutos o grupo inteiro volta a usar.${of ? `<br><br>${of}` : ''}<br><br>` +
      'Ficou alguma dúvida ou algo não funcionou como você esperava? Responde este e-mail — a gente lê tudo.',
    cta: { texto: 'Ativar meu plano', url: 'https://app.hopefin.com.br/planos' },
  }
  // Régua de hoje (no ar desde o prompt 7) — mantida igual enquanto a nova não é aprovada.
  if (tipo === 'fim_trial_2d') return {
    assunto: 'Seu teste do HopeFin termina em 2 dias',
    titulo: 'Faltam 2 dias de teste 💚',
    preheader: 'Seu teste do HopeFin termina em 2 dias',
    corpo: `${ola}Seu teste grátis do HopeFin termina em <strong>2 dias</strong>.<br><br>` +
      'Pra não perder o histórico da sua família e seguir com o <strong>planejado × praticado</strong>, ' +
      'os lançamentos por voz e o painel compartilhado, é só escolher um plano — leva 2 minutos.',
    cta: { texto: 'Assinar o HopeFin', url: 'https://app.hopefin.com.br/planos' },
  }
  return null
}

// O último dia na régua de HOJE (texto antigo, mantido enquanto a nova está desligada).
export function conteudoAntigo0d(nome) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0]
  const ola = primeiro ? `Oi, ${escHtml(primeiro)}! ` : 'Oi! '
  return {
    assunto: 'Seu teste do HopeFin termina hoje',
    titulo: 'Seu teste termina hoje',
    preheader: 'Seu teste do HopeFin termina hoje',
    corpo: `${ola}Hoje é o <strong>último dia</strong> do seu teste grátis do HopeFin.<br><br>` +
      'Assinando agora você mantém tudo do jeitinho que está — nada se perde — e continua com o ' +
      'controle das contas da família no mesmo lugar.',
    cta: { texto: 'Assinar o HopeFin', url: 'https://app.hopefin.com.br/planos' },
  }
}

// Notificação no celular que acompanha cada e-mail da régua (A6.2 "reforço no app/push", 21/11/2026).
// Vai pros aparelhos de TODO o grupo (o teste é do grupo). Curta, sem preço (o preço fica no e-mail
// e no Meu plano). null = esse tipo não tem push.
export function pushRegua(tipo) {
  const url = '/planos'
  switch (tipo) {
    case 'fim_trial_3d': return { title: 'Faltam 3 dias do seu teste 💚', body: 'Assine pra continuar com tudo como está. Toque para ver os planos.', url, tag: 'fim-trial' }
    case 'fim_trial_2d': return { title: 'Faltam 2 dias do seu teste 💚', body: 'Assine pra continuar com tudo como está. Toque para ver os planos.', url, tag: 'fim-trial' }
    case 'fim_trial_0d': return { title: 'Seu teste termina hoje', body: 'Assine hoje e nada se perde. Toque para ver os planos.', url, tag: 'fim-trial' }
    case 'fim_trial_d1': return { title: 'Sentimos sua falta 💚', body: 'Seus dados continuam guardados. Assine e volte a lançar de onde parou.', url, tag: 'fim-trial' }
    default: return null
  }
}
