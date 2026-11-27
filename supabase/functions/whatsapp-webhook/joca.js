// joca.js — como o Joca fala e as regras puras dele (WhatsApp, A8.23 + A8.24, 20/11/2026).
//
// Sem rede e sem banco: o webhook (index.ts) usa daqui os textos, a leitura do "sim"/"não", a
// limpeza da resposta da IA e as instruções da IA. Os testes (tests/joca.test.js) conferem tudo
// isso sem mandar nenhuma mensagem. JavaScript puro: roda no Deno (Edge Function) e no Node.
//
// Textos marcados "(aprovado)" foram aprovados pelo Raul em 20/11/2026. Os outros são novos e
// esperam o ok dele (hoje só o grupo do Raul usa o WhatsApp, no número de teste da Meta).

export const LIMIAR_CONFIANCA = 0.6   // abaixo disso o Joca pergunta "tá certo?" antes de salvar
export const PENDENCIA_MIN = 30       // a confirmação ("sim") vale 30 minutos
export const AUDIO_MAX_BYTES = 1_000_000 // ~4 min de nota de voz; acima disso nem transcreve (custo)

// ---------------------------------------------------------------- formatação
// Nome de categoria pra mostrar (a mesma regra de src/lib/categorias.js → rotuloCategoria).
const COM_ACENTO = {
  alimentacao: 'Alimentação', saude: 'Saúde', vestuario: 'Vestuário',
  eletronico: 'Eletrônico', moveis: 'Móveis', educacao: 'Educação',
}
export function rotuloCategoria(nome) {
  if (!nome) return ''
  const n = COM_ACENTO[nome] || String(nome)
  return n.charAt(0).toUpperCase() + n.slice(1)
}

// R$ 1.234,56 (sem depender do Intl, pra ser igual no Deno e nos testes).
export function brl(v) {
  const n = Math.round((Number(v) || 0) * 100) / 100
  const [int, dec] = Math.abs(n).toFixed(2).split('.')
  return `${n < 0 ? '-' : ''}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`
}
export const ddmm = (iso) => {
  const [, m, d] = String(iso || '').split('-')
  return m && d ? `${d.slice(0, 2)}/${m}` : ''
}
export const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || ''
// "vence 10/12" ou "venceu 08/11" (quando a data já passou).
export const venceOuVenceu = (vencimento, hoje) => (hoje && vencimento && String(vencimento) < String(hoje) ? 'venceu' : 'vence')
const compDeData = (iso) => String(iso || '').slice(0, 7)
// Quanto fica pago: conta fixa e assinatura aceitam o valor dito (vira o valor real do mês); parcela é a do app.
export const valorPago = (conta, valorDito) => (conta?.tipo !== 'parcela' && Number(valorDito) > 0 ? Math.round(Number(valorDito) * 100) / 100 : Number(conta?.valor))
const comNome = (prefixo, nome) => (primeiroNome(nome) ? `${prefixo}, ${primeiroNome(nome)}!` : `${prefixo}!`)
const maiuscula = (s) => { const t = String(s || '').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t }

// Forma de pagamento sem cartão, do jeito que o app mostra (o app só tem Cartão, Pix e Dinheiro).
export const rotuloForma = (forma) => (forma === 'dinheiro' ? 'Dinheiro' : 'Pix')

// Uma informação por linha (aprovado pelo Raul em 20/11/2026, tarde — nota do Obsidian
// "Joca - mensagens do WhatsApp"):
//   💸 *R$ 100,00* · Janta
//   🏷️ Alimentação
//   💳 Itaú azul · 3x de R$ 33,33      (ou 💵 Pix / 💵 Dinheiro, sem cartão)
//   📅 18/11                            (só quando não é hoje)
// Entrada: 💰 *valor* · descrição (+ data quando não é hoje).
export function resumoLancamento(d, hoje) {
  const entrada = d.tipo === 'entrada'
  const linhas = [`${entrada ? '💰' : '💸'} *${brl(d.valor)}* · ${d.descricao}`]
  if (!entrada) {
    if (d.categoria) linhas.push(`🏷️ ${rotuloCategoria(d.categoria)}`)
    if (d.cartao_nome) linhas.push(`💳 ${d.cartao_nome}${d.parcelas > 1 ? ` · ${d.parcelas}x de ${brl(d.valor_parcela ?? d.valor / d.parcelas)}` : ''}`)
    else linhas.push(`💵 ${rotuloForma(d.forma)}`)
  }
  if (d.data && d.data !== hoje) linhas.push(`📅 ${ddmm(d.data)}`)
  if (!entrada && d.pessoa) linhas.push(`👤 De ${d.pessoa} · vai pro A receber`)
  return linhas.join('\n')
}

// O último lançamento como o banco devolve (wa_ultimo_lancamento) -> mesmo resumo.
export function resumoUltimo(u, hoje) {
  return resumoLancamento({
    tipo: u.tipo === 'entrada' ? 'entrada' : 'gasto', valor: Number(u.valor), descricao: u.descricao,
    categoria: u.categoria, cartao_nome: u.cartao_nome, parcelas: Number(u.num_parcelas) || 1,
    valor_parcela: u.valor_parcela != null ? Number(u.valor_parcela) : undefined, data: u.data,
    forma: u.tipo_pagamento === 'dinheiro' ? 'dinheiro' : 'pix',
  }, hoje)
}

// ---------------------------------------------------------------- textos
export const TEXTOS = {
  // (aprovado) gasto lançado — uma informação por linha (20/11, tarde)
  gastoLancado: (nome, d, hoje) => `${comNome('Prontinho', nome)} Lancei aqui 👇\n\n${resumoLancamento(d, hoje)}`,
  // (aprovado) entrada lançada
  entradaLancada: (d, hoje) => `Oba, entrou dinheiro! 💰\n\n${resumoLancamento(d, hoje)}\nJá está nas suas entradas.`,
  // (aprovado) não entendeu
  naoEntendi: 'Hmm, esse eu não entendi 😅 Me manda assim: *farmácia 48,90* ou *uber 23,50 ontem*.',
  // (aprovado) faltou o valor
  semValor: 'Quase lá! Só faltou o valor 🤔 Ex.: *farmácia 48,90*.',
  // (aprovado) áudio que não deu pra ouvir
  audio: 'Não consegui ouvir direito 😅 Pode repetir mais devagar ou mandar por texto?',
  // (aprovado) limite do mês
  limite: 'Você usou todos os lançamentos por WhatsApp deste mês 🗓️ Eles voltam no dia 1º. Pelo app segue tudo normal.',
  // (aprovado) número não conectado
  naoConectado: 'Oi! Eu sou o Joca, do HopeFin 👋 Pra lançar por aqui, abra o app › Minha conta › Configurações › Conectar meu WhatsApp e me mande o código.',

  // --- já existiam (mantidos) ---
  pausado: 'O lançamento por WhatsApp está pausado no momento. Tenta de novo mais tarde 🙏',
  vazio: 'Não peguei nenhum lançamento aí 🤔. Ex.: *mercado 120* ou *recebi 2000 de salário*.',
  semGrupo: 'No momento você não faz parte de nenhum grupo no HopeFin, então não consigo lançar nada por aqui. Pra voltar, entre ou crie um grupo no app e conecte o WhatsApp de novo em Configurações. 💙',
  assinatura: 'Sua assinatura está inativa — reative no app pra voltar a lançar por aqui. 💙',
  falhaSalvar: 'Não consegui salvar agora 😕. Tenta de novo ou lança pelo app, por favor.',
  boasVindas: (nome) => [
    `${comNome('Prontinho', nome)} ✅ Seu WhatsApp agora está conectado ao HopeFin.`,
    '',
    'Daqui pra frente, é só me mandar seus gastos e entradas em português normal que eu lanço no app na hora. Veja como:',
    '',
    '💸 *Gastos*',
    '• "mercado 120"',
    '• "uber 23,50 ontem"',
    '• "farmácia 48,90 no crédito"',
    '• "almoço 35 parcelado em 3x"',
    '',
    '💰 *Entradas*',
    '• "recebi 2000 de salário"',
    '• "entrou 150 de freela sexta"',
    '',
    '💳 *Fatura paga:* "paguei a fatura do Nubank"',
    '🧾 *Conta paga:* "paguei a luz" ou "paguei a parcela do financiamento"',
    '✏️ *Errou?* "o valor era 50" ou "apaga o último"',
    '📋 *Vários de uma vez:* "mercado 300, farmácia 80 e uber 25" (até 5, eu mostro a lista antes de lançar)',
    '📸 *Comprovante:* manda a foto ou o PDF do comprovante, nota ou cupom que eu leio o valor',
    '',
    'Eu entendo sozinho o valor, a data ("ontem", "sexta", "dia 3"), a categoria, o cartão e as parcelas. 💙',
  ].join('\n'),

  // --- novos (organização aprovada em 20/11, tarde; textos na nota do Obsidian) ---
  taCerto: (d, hoje) => [
    'Deixa eu conferir antes de lançar 🤔',
    '',
    resumoLancamento(comoVaiSalvar(d), hoje),
    '',
    'Tá certo? Responde *sim* pra eu lançar, ou me manda do jeito certo.',
  ].join('\n'),
  cancelado: 'Beleza, deixei pra lá 👍 Se quiser, me manda de novo do jeito certo.',
  expirou: 'Essa confirmação passou do tempo ⏱️ Me manda de novo, que eu confiro.',
  okSemPendencia: '👍',
  naoSemPendencia: 'Tudo bem 😉',
  limiteDia: 'Por hoje chegou no limite de mensagens por aqui 😅 Amanhã eu volto a lançar. Pelo app segue tudo normal.',
  audioLongo: 'Esse áudio ficou longo demais pra mim 😅 Manda um mais curtinho (até 1 minuto) ou por texto?',
  saudacao: (nome) => `Oi${primeiroNome(nome) ? `, ${primeiroNome(nome)}` : ''}! 👋 Me manda um gasto ou uma entrada, tipo *mercado 120* ou *recebi 2000 de salário*, que eu lanço na hora.`,
  agradecimento: (nome) => `Por nada${primeiroNome(nome) ? `, ${primeiroNome(nome)}` : ''}! 💙`,
  ajuda: [
    'Eu sou o Joca 👋 Por aqui eu:',
    '💸 lanço gastos: *mercado 120*, *uber 23,50 ontem*, *tênis 300 em 3x no Nubank*',
    '💰 lanço entradas: *recebi 2000 de salário*',
    '💳 marco fatura paga: *paguei a fatura do Nubank*',
    '🧾 marco conta do mês paga: *paguei a luz*, *paguei a parcela do financiamento*',
    '✏️ arrumo o último: *o valor era 50* ou *apaga o último*',
    '📋 lanço vários de uma vez (até 5): *mercado 300, farmácia 80 e uber 25* — eu mostro a lista e você confirma',
    '📸 leio *foto ou PDF* de comprovante, nota fiscal ou cupom — eu mostro o que li e você confirma',
    '📊 respondo com os números do app: *quanto gastei com mercado?*, *quanto falta pagar?*, *quanto está a fatura do Nubank?*, *quanto sobra?*',
  ].join('\n'),
  // Pergunta que não é sobre os números (ou que o Joca ainda não sabe responder) — 26/11/2026.
  pergunta: 'Essa eu ainda não sei responder por aqui 🚧 Com os números do app eu respondo: *quanto gastei com mercado?*, *quanto falta pagar?*, *quanto está a fatura do Nubank?*, *quanto sobra este mês?* e *quanto entrou?*',
  consultaFalhou: 'Não consegui olhar os números agora 😕 Tenta de novo daqui a pouco ou confere no Início do app.',
  investimento: 'Dica de investimento eu não dou 🙏 Isso é com um assessor de investimentos registrado na CVM. O que eu faço é te ajudar a organizar as contas da família pra sobrar mais todo mês 💙',

  // fatura ("paguei a fatura do X")
  faturaPergunta: ({ cartao, fatura, valorDito, temParcelas }) => {
    const verbo = fatura.status === 'atrasada' ? 'Venceu' : 'Vence'
    const linhas = [`Achei a fatura do *${cartao}* 💳`, '', `📅 ${verbo} ${ddmm(fatura.vencimento)}`, `💰 *${brl(fatura.total)}*`]
    if (valorDito && Math.abs(Number(valorDito) - Number(fatura.total)) >= 0.01) {
      linhas.push(`(Você falou ${brl(valorDito)}. Se tiver compra faltando ou sobrando nela, ajusta no app em Cartões.)`)
    }
    linhas.push('', `Marco como paga?${temParcelas ? ' As parcelas dela entram como pagas também.' : ''}`)
    linhas.push('Responde *sim* pra confirmar.')
    return linhas.join('\n')
  },
  faturaPaga: (nome, { cartao, vencimento, total, parcelas }, hoje) => [
    `${comNome('Prontinho', nome)} Fatura paga ✅`,
    '',
    `💳 ${cartao} · ${venceOuVenceu(vencimento, hoje)} ${ddmm(vencimento)}`,
    `💰 *${brl(total)}*`,
    ...(parcelas ? [`${parcelas} ${parcelas === 1 ? 'parcela entrou' : 'parcelas entraram'} como paga${parcelas === 1 ? '' : 's'}`] : []),
  ].join('\n'),
  faturaJaPaga: (cartao, vencimento, hoje) => `A fatura do ${cartao} que ${venceOuVenceu(vencimento, hoje)} ${ddmm(vencimento)} já está paga 👍`,
  faturaNada: (cartao, aberta) => `Não tem fatura do ${cartao} pra pagar agora 👍 A aberta fecha ${ddmm(aberta.fechamento)} e vence ${ddmm(aberta.vencimento)}.`,
  faturaMudou: (cartao, total) => `O valor da fatura do ${cartao} mudou desde a pergunta: agora está em *${brl(total)}*.\n\nMarco como paga? Responde *sim*.`,
  // conta do mês ("paguei a parcela da usina solar", 27/11/2026)
  contaPergunta: ({ conta, valorDito }, hoje) => {
    const atrasada = conta.comp < compDeData(hoje)
    const linhas = [`Achei a conta *${conta.nome}* 🧾`, '']
    if (conta.numero && conta.total) linhas.push(`🔢 Parcela ${conta.numero} de ${conta.total}`)
    if (conta.data) linhas.push(`📅 ${maiuscula(venceOuVenceu(conta.data, hoje))} ${ddmm(conta.data)}${atrasada ? ' ⚠️ (ficou em atraso)' : ''}`)
    const valor = valorPago(conta, valorDito)
    linhas.push(`💰 *${brl(valor)}*`)
    if (valorDito && Math.abs(Number(valorDito) - Number(conta.valor)) >= 0.01) {
      linhas.push(conta.tipo === 'parcela'
        ? `(Você falou ${brl(valorDito)}, mas a parcela no app é ${brl(conta.valor)}. Se mudou, ajusta no app em Parcelamentos.)`
        : `(No app estava ${brl(conta.valor)}: fica ${brl(valor)} neste mês.)`)
    }
    linhas.push('', 'Marco como paga? Responde *sim* pra confirmar.')
    return linhas.join('\n')
  },
  contaPaga: (nome, conta, hoje) => [
    `${comNome('Prontinho', nome)} Conta paga ✅`,
    '',
    `🧾 ${conta.nome}${conta.numero && conta.total ? ` · parcela ${conta.numero}/${conta.total}` : ''}${conta.data ? ` · ${venceOuVenceu(conta.data, hoje)} ${ddmm(conta.data)}` : ''}`,
    `💰 *${brl(conta.valorPago ?? conta.valor)}*`,
  ].join('\n'),
  contaJaPaga: (conta, hoje) => `A *${conta.nome}*${conta.data ? ` que ${venceOuVenceu(conta.data, hoje)} ${ddmm(conta.data)}` : ''} já está paga 👍`,
  contaNada: (nome) => `Não tem *${nome}* pra pagar agora 👍`,
  contaQual: (nomes) => (nomes.length
    ? `Qual conta? Me manda com o nome dela, tipo *paguei ${nomes[0]}*.\nSuas contas: ${nomes.slice(0, 15).join(', ')}${nomes.length > 15 ? '…' : ''}.`
    : 'Não achei conta fixa, parcela ou assinatura no app pra marcar 🤔 Se foi um gasto novo, me manda com o valor, tipo *mercado 120*.'),
  faturaQualCartao: (nomes) => (nomes.length
    ? `De qual cartão? Me manda assim: *paguei a fatura do ${nomes[0]}*.\nSeus cartões: ${nomes.join(', ')}.`
    : 'Você ainda não tem cartão cadastrado no app. Cadastra em Cartões › Novo e me chama de novo 😉'),

  // último lançamento ("apaga o último", "o valor era 50")
  apagarPergunta: (u, hoje) => `Apago este lançamento? 🗑️\n\n${resumoUltimo(u, hoje)}\n\nResponde *sim* pra apagar.`,
  apagado: (u) => `Apaguei ✅\n\n${u.tipo === 'entrada' ? '💰' : '💸'} ${brl(u.valor)} · ${u.descricao}\nSe precisar, é só me mandar de novo.`,
  corrigirPergunta: (u, novo) => `Corrijo o último lançamento? ✏️\n\n${u.descricao}: de ${brl(u.valor)} pra *${brl(novo)}*\n\nResponde *sim* pra confirmar.`,
  corrigido: (r, hoje) => `Arrumei ✅ Agora ficou assim 👇\n\n${resumoUltimo({ ...r, valor: r.valor, valor_parcela: r.valor_parcela }, hoje)}\n(antes: ${brl(r.valor_antes)})`,
  nenhumUltimo: 'Não achei nenhum lançamento seu feito por aqui pra mexer 🤔 Pelo app dá pra mudar qualquer um: Gastos › toque nele.',
  sumiu: 'Esse último lançamento não existe mais (talvez já tenha sido apagado no app) 🤔',
  mudou: 'O último lançamento mudou desde a pergunta. Me manda de novo que eu confiro 😉',
  bloqueio: (motivo) => ({
    terceiro: 'Esse lançamento está dividido com outras pessoas no app. Pra não bagunçar as contas, muda por lá: Gastos › toque nele 😉',
    dividido: 'Esse lançamento está dividido com outras pessoas no app. Pra não bagunçar as contas, muda por lá: Gastos › toque nele 😉',
    pago: 'Esse parcelado já tem parcela paga. Pra não bagunçar a fatura, muda pelo app: Gastos › toque nele 😉',
    serie: 'Essa entrada se repete todo mês no app. Pra não bagunçar, muda por lá: Entradas › toque nela 😉',
    ligado: 'Essa entrada está ligada a um reembolso no app. Pra não bagunçar, muda por lá: Entradas › toque nela 😉',
  }[motivo] || 'Esse eu não consigo mudar por aqui. Muda pelo app, tá? 😉'),
}

// ---------------------------------------------------------------- "sim" e "não"
// Minúsculas, sem acento, sem pontuação nas pontas, sem tom de pele/seletor de emoji.
export function normalizar(t) {
  return String(t || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\u{1F3FB}-\u{1F3FF}️]/gu, '')
    .toLowerCase()
    .replace(/[.,;:!?¡¿…"'()*_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// "Sim": só palavras de concordância, sem número (com número é correção: "sim, mas era 50").
const SIM_FORTE = new Set([
  'sim', 's', 'ss', 'isso', 'pode', 'pode sim', 'ok', 'okay', 'okk', 'oks', 'certo', 'correto', 'confirmo', 'confirma',
  'confirmar', 'confirmado', 'manda', 'beleza', 'blz', 'yes', 'exato', 'positivo', 'uhum', 'aham', 'claro',
  'perfeito', 'show', 'fechado', 'isso mesmo', 'ta bom', 'tudo certo', '👍', '✅', '👌',
])
const SIM_JUNTO = new Set([
  ...SIM_FORTE, 'mesmo', 'ai', 'ta', 'esta', 'bom', 'tudo', 'lancar', 'lanca', 'apagar', 'apaga', 'marcar', 'marca',
  'corrigir', 'corrige', 'ver', 'por', 'favor', 'pfv', 'pf', 'obrigado', 'obrigada', 'joca', 'e', 'pode', 'sim',
])
// "Não": começa com uma palavra de recusa e não traz número ("não, era 50" é correção).
const NAO_INICIO = new Set(['nao', 'n', 'nn', 'cancela', 'cancelar', 'cancelado', 'errado', 'esquece', 'deixa',
  'negativo', 'nem', 'nada', '❌', '👎', '🚫'])
const temNumero = (n) => /\d/.test(n)
export function ehSim(t) {
  const n = normalizar(t)
  if (!n || temNumero(n)) return false
  if (SIM_FORTE.has(n)) return true
  const palavras = n.split(' ')
  return palavras.every((p) => SIM_JUNTO.has(p)) && palavras.some((p) => SIM_FORTE.has(p))
}
export function ehNao(t) {
  const n = normalizar(t)
  if (!n || temNumero(n)) return false
  return NAO_INICIO.has(n.split(' ')[0])
}

// Mensagens simples que nem precisam da IA (mais rápido e de graça).
const SAUDACOES = new Set(['oi', 'ola', 'oie', 'oii', 'opa', 'eai', 'e ai', 'bom dia', 'boa tarde', 'boa noite', 'hello', 'oi joca', 'ola joca', 'oi tudo bem', 'tudo bem', 'salve'])
const OBRIGADO = new Set(['obrigado', 'obrigada', 'obg', 'brigado', 'brigada', 'valeu', 'vlw', 'muito obrigado', 'muito obrigada', 'obrigado joca', 'obrigada joca', 'valeu joca', 'tmj', '🙏', '❤', '💙'])
const AJUDA = new Set(['ajuda', 'help', 'menu', 'como funciona', 'o que voce faz', 'o que vc faz', 'comandos', 'como usar'])
export function respostaRapida(texto) {
  const n = normalizar(texto)
  if (String(texto || '').trim() === '?') return 'ajuda'
  if (!n) return null
  if (SAUDACOES.has(n)) return 'saudacao'
  if (OBRIGADO.has(n)) return 'agradecimento'
  if (AJUDA.has(n)) return 'ajuda'
  return null
}

// ---------------------------------------------------------------- IA
export const ACOES = ['lancar', 'lancar_varios', 'pagar_fatura', 'pagar_conta', 'apagar_ultimo', 'corrigir_ultimo', 'saudacao', 'agradecimento',
  'ajuda', 'pergunta', 'investimento', 'outro']

// Instruções do Joca para a IA (Claude Haiku). A regra de NÃO recomendar investimento fica
// escrita aqui (decisão do Raul, 20/11/2026: só educação financeira).
export function instrucoesIA({ hoje, semana, categorias }) {
  return [
    'Você é o Joca, o assistente do HopeFin (app de finanças da família) no WhatsApp.',
    'Leia a mensagem da pessoa e responda APENAS com um objeto JSON válido, sem nenhum texto fora do JSON.',
    '',
    'Regras do Joca (valem sempre):',
    '- Você só ajuda a organizar o dinheiro da família: lançar gastos e entradas, marcar fatura de cartão e contas do mês como pagas e corrigir o último lançamento.',
    '- Educação financeira pode: organizar gastos, reserva de emergência, sair das dívidas, usar bem o cartão.',
    '- NUNCA recomende investimento específico (ação, fundo, título, criptomoeda, previdência, corretora ou banco pra investir). Isso é consultoria de investimentos e só um profissional registrado na CVM pode fazer.',
    '- Nunca invente valores, datas ou cartões que a pessoa não disse.',
    '',
    'Escolha a "acao":',
    '- "lancar": a pessoa conta UM gasto ou UM dinheiro que entrou. Ex.: "mercado 120", "uber 23,50 ontem", "tênis 300 em 3x no Nubank", "recebi 2000 de salário".',
    '- "lancar_varios": a mensagem conta DOIS OU MAIS lançamentos diferentes, cada um com o seu valor. Ex.: "mercado 300, farmácia 80 no dinheiro e uber 25", "gastei 50 de pão e 120 de gasolina". Cuidado: "3x de 100" ou "parcelado em 3" é UMA compra parcelada ("lancar" com parcelas), não vários. Se não der pra saber se são várias compras ou uma parcelada, use "lancar_varios" com confianca baixa.',
    '- "pagar_fatura": diz que PAGOU a fatura de um cartão. Ex.: "paguei a fatura do Nubank", "fatura do Itaú paga". Isso NÃO é um gasto novo.',
    '- "pagar_conta": diz que PAGOU uma conta da lista "contas" (conta fixa, parcela de carnê/empréstimo/financiamento ou assinatura fora do cartão). Ex.: "paguei a parcela da usina solar", "paguei a luz, deu 180", "aluguel pago", "paguei o terreno". Isso NÃO é um gasto novo: a conta já está no app e só falta marcar. Se a coisa paga NÃO bate com nenhuma conta da lista: COM valor é "lancar" (gasto novo, ex.: "paguei 89,90 de internet no boleto" sem Internet na lista); SEM valor e parecendo conta do mês (luz, água, parcela, prestação, financiamento) é "pagar_conta" com conta null (o Joca mostra a lista). Fatura de cartão é sempre "pagar_fatura".',
    '- "apagar_ultimo": pede pra apagar ou desfazer o último lançamento. Ex.: "apaga o último", "lancei errado, apaga".',
    '- "corrigir_ultimo": corrige o VALOR do último lançamento. Ex.: "o valor era 50", "na verdade foi 45,90".',
    '- "saudacao": oi, bom dia, tudo bem.',
    '- "agradecimento": obrigado, valeu.',
    '- "ajuda": pergunta o que o Joca faz ou como usar.',
    '- "pergunta": pergunta sobre o próprio dinheiro (quanto gastou, quanto falta pagar, quanto sobra) ou sobre organizar as finanças. Pergunta NÃO é lançamento: "quanto gastei de uber?" não lança nada.',
    '- "investimento": pede dica ou recomendação de onde investir.',
    '- "outro": nada disso.',
    '',
    'Campos (null quando não se aplica):',
    '- acao: uma das opções acima',
    '- tipo: "gasto" ou "entrada" (só em "lancar")',
    '- valor: número em reais com ponto decimal, sem símbolo. Em "lancar": o valor total. Em "corrigir_ultimo": o valor certo. Em "pagar_fatura" e "pagar_conta": o valor que a pessoa disse que pagou, ou null.',
    '- descricao: texto curto e natural (só em "lancar")',
    `- categoria: UMA destas (ou "outros"): ${(categorias || []).join(', ') || 'outros'}`,
    '- conta: SÓ em "pagar_conta": o nome EXATO de uma conta da lista "contas" (compare sem ligar pra maiúscula, acento, erro de digitação ou palavras a mais: "parcela da usina" bate com "Parcela usina solar"; "luz" bate com "Luz"). Se bater com mais de uma ou com nenhuma, null. Nunca invente.',
    '- cartao_id: id de um cartão da lista (em "lancar", se foi no cartão; em "pagar_fatura", o cartão da fatura), ou null',
    '  Se a pessoa disser que foi no cartão/crédito mas NÃO disser qual: se a lista tiver um cartão só, é ele; se tiver mais de um, cartao_id null e confiança abaixo de 0.6 (o Joca pergunta). Nunca chute o cartão.',
    '  Compare o nome do cartão sem ligar pra maiúscula, acento ou erro de digitação ("NO INTER", "itau", "nubak" batem com Inter, Itaú, Nubank).',
    `- data: "YYYY-MM-DD". Hoje é ${hoje} (${semana}, America/Sao_Paulo). Entenda "ontem", "sexta", "dia 3". (só em "lancar")`,
    ...ultimosDias(hoje),
    '- parcelas: inteiro >= 1 (1 = à vista) (só em "lancar")',
    '- forma: só em gasto SEM cartão: "dinheiro" quando a pessoa disser dinheiro ou espécie; "pix" em todo o resto (Pix, débito, transferência, boleto ou quando não disser). Com cartão ou em entrada: null.',
    '- pessoa: SÓ em gasto que é de OUTRA pessoa, que vai te devolver o dinheiro. Ex.: "mercado 120 da Jack", "foi da Jack", "uber 30 pra minha mãe, ela me paga", "comprei pro Raifran". Escreva só o nome como a pessoa falou ("minha mãe" vira "Mãe"). Se o nome bater com um da lista "pessoas" (mesmo sem acento ou com maiúscula diferente), use o nome EXATO da lista. NÃO use pra quem está na lista "membros" (são da própria família no app) nem quando o gasto é da própria pessoa ou da casa. Em entrada: null. Na dúvida: null.',
    '- confianca: de 0 a 1, o quanto você tem certeza da ação e dos campos principais (valor e tipo). Se faltar o valor ou a frase for ambígua, use confiança baixa (abaixo de 0.6).',
    '  Use 0.9 ou mais quando a frase diz claramente O QUE foi e QUANTO, mesmo com gíria de dinheiro ("15 conto", "50 pila", "2k", "3 mil" = reais).',
    '  Use abaixo de 0.6 quando: tiver dois valores possíveis ("50 ou 60"); não der pra saber o que foi (só um número, só o nome de um cartão como "nubank 200", ou só o nome de uma pessoa como "Jack 50"); ou for transferência/Pix pra alguém da lista "membros" (o dinheiro fica na família, talvez nem seja gasto).',
    '- consulta: SÓ em "pergunta" sobre os NÚMEROS da família; nos outros casos (e em pergunta de orientação, tipo "como faço uma reserva?"), null. Objeto com:',
    '  tipo: "gasto" (quanto gastou — com uma categoria, com algo específico ou no total), "falta_pagar" (o que ainda falta pagar no mês), "fatura" (quanto está a fatura de UM cartão), "sobra" (quanto sobra / quanto pode gastar no mês), "entradas" (quanto entrou ou vai entrar).',
    '  categoria: UMA das categorias da lista quando a pessoa fala de uma categoria ("mercado", "saúde", "lazer", "comida"/"comer fora" = alimentacao), senão null.',
    '  termo: quando a pessoa fala de algo específico que não é categoria da lista (loja, app, produto: "uber", "ifood", "netflix", "gasolina", "farmácia"), a palavra curta como aparece no nome do lançamento; senão null. Use categoria OU termo, não os dois.',
    '  cartao_id: id do cartão da lista quando pergunta da fatura ("quanto está a fatura do nubank", "quanto falta pagar do itaú" = tipo "fatura"); senão null. Nunca chute o cartão.',
    `  mes: "YYYY-MM" do mês perguntado ("esse mês" ou sem dizer = ${String(hoje || '').slice(0, 7)}; "mês passado", "outubro"...). Mês sem ano = o mais recente que já começou.`,
    '  Você NUNCA escreve número nenhum na resposta: o Joca calcula com os dados do app.',
    '  Por enquanto o Joca só responde o MÊS inteiro e a família toda. Pergunta de um dia ou semana ("hoje", "essa semana"), de uma pessoa ("quanto a Larissa gastou", "quanto a Jack me deve") ou de várias coisas juntas: consulta null.',
    '- itens: SÓ em "lancar_varios": lista com um objeto por lançamento, cada um com tipo, valor, descricao, categoria, cartao_id, data, parcelas, forma e pessoa (mesmas regras acima). Nos outros casos, null.',
    '',
    'Se vier "pendente" (um lançamento que o Joca perguntou "tá certo?" e ainda NÃO foi salvo) e a mensagem corrigir algo dele (valor, cartão, data, categoria, parcelas, descrição ou de quem é), use acao "lancar" e devolva o lançamento COMPLETO já corrigido.',
  ].join('\n')
}

// Os 7 dias antes de hoje com o dia da semana (bateria 26/11/2026: "pizza 80 sexta" numa quinta
// virava a sexta que VEM). Dia da semana sozinho = o que já passou.
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
export function ultimosDias(hoje) {
  const t = Date.parse(`${hoje}T12:00:00Z`)
  if (!Number.isFinite(t)) return []
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(t - (i + 1) * 864e5)
    return `${DIAS_SEMANA[d.getUTCDay()]} = ${d.toISOString().slice(0, 10)}${i === 0 ? ' (ontem)' : ''}`
  })
  return [
    `  Dias que já passaram: ${dias.join(', ')}.`,
    '  Dia da semana sozinho ("sexta", "no sábado") é o que JÁ PASSOU (dessa lista). Data no futuro só se a pessoa disser ("sexta que vem", "dia 30 vou pagar").',
  ]
}

// O lançamento que espera o "sim", do jeito que vai pra IA como "pendente".
export function pendenteParaIA(d) {
  if (!d) return undefined
  return { tipo: d.tipo, valor: d.valor, descricao: d.descricao, categoria: d.categoria, cartao_id: d.cartao_id, data: d.data, parcelas: d.parcelas, forma: d.forma, pessoa: d.pessoa || null }
}

// Pix ou dinheiro (gasto sem cartão). A IA diz; a frase também vale ("50 em dinheiro" sem a IA
// marcar). Débito, transferência e boleto ficam como Pix, igual ao app (que só tem Pix e Dinheiro).
export function formaDoGasto(formaIA, texto) {
  if (normalizar(formaIA) === 'dinheiro') return 'dinheiro'
  return /\b(dinheiro|especie|em maos|cash)\b/.test(normalizar(texto)) ? 'dinheiro' : 'pix'
}

// Tira o JSON da resposta da IA (às vezes vem embrulhado em ```json).
export function extrairJson(txt) {
  const limpo = String(txt || '').replace(/```json/gi, '').replace(/```/g, '').trim()
  const ini = limpo.indexOf('{'); const fim = limpo.lastIndexOf('}')
  if (ini < 0 || fim < 0) throw new Error('sem JSON')
  return JSON.parse(limpo.slice(ini, fim + 1))
}

// Saneia a resposta da IA: nunca confiar cegamente (cartão só da lista, categoria só das do grupo,
// valor positivo e com teto, data no formato certo).
// Pessoa do "foi de outra pessoa" (26/11/2026): nome curto; se bater com uma pessoa já cadastrada
// (sem acento/maiúscula), usa o nome do cadastro; se for alguém da família no app (membro), ignora.
export function pessoaDoGasto(nomeIA, { pessoas = [], membros = [] } = {}) {
  const n = maiuscula(String(nomeIA || '').replace(/\s+/g, ' ').trim().slice(0, 60))
  if (!n) return { pessoa: null, pessoa_nova: false }
  const chave = normalizar(n)
  if ((membros || []).some((m) => normalizar(m) === chave || normalizar(primeiroNome(m)) === chave)) return { pessoa: null, pessoa_nova: false }
  const existe = (pessoas || []).find((p) => normalizar(p) === chave)
  return existe ? { pessoa: String(existe).trim(), pessoa_nova: false } : { pessoa: n, pessoa_nova: true }
}

// O nome de conta que a IA mandou → o nome da lista "contas" (sem ligar pra acento/maiúscula). Fora da lista: null.
export function contaDaLista(nomeIA, nomes) {
  const n = normalizar(nomeIA)
  if (!n) return null
  return (nomes || []).find((x) => normalizar(x) === n) || null
}

export function limparIA(dados, { texto, hoje, categorias, cartoes, pessoas = [], membros = [], contas = [] }) {
  const d = dados || {}
  const listaCartoes = cartoes || []
  const cartao = listaCartoes.find((c) => c.id === d.cartao_id) || null
  const valor = Number(d.valor)
  const acao = ACOES.includes(d.acao) ? d.acao : (d.tipo === 'gasto' || d.tipo === 'entrada' ? 'lancar' : 'outro')
  const conf = Number(d.confianca)
  const parcelas = Number(d.parcelas)
  const tipo = d.tipo === 'entrada' ? 'entrada' : 'gasto'
  const quem = tipo === 'gasto' ? pessoaDoGasto(d.pessoa, { pessoas, membros }) : { pessoa: null, pessoa_nova: false }
  return {
    acao,
    tipo,
    forma: tipo === 'gasto' && !cartao ? formaDoGasto(d.forma, texto) : null,
    valor: Number.isFinite(valor) && valor > 0 && valor <= 10_000_000 ? Math.round(valor * 100) / 100 : null,
    descricao: maiuscula(String(d.descricao || texto || '').slice(0, 120)) || 'Lançamento',
    categoria: (categorias || []).includes(d.categoria) ? d.categoria : 'outros',
    cartao_id: cartao ? cartao.id : null,
    cartao_nome: cartao ? String(cartao.nome || '').trim() || null : null,
    data: /^\d{4}-\d{2}-\d{2}$/.test(String(d.data || '')) ? d.data : hoje,
    parcelas: Number.isInteger(parcelas) && parcelas > 1 && parcelas <= 72 ? parcelas : 1,
    confianca: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.5,
    pessoa: quem.pessoa,
    pessoa_nova: quem.pessoa_nova,
    conta: acao === 'pagar_conta' ? contaDaLista(d.conta, contas) : null,
    consulta: acao === 'pergunta' ? limparConsulta(d.consulta, { hoje, categorias, cartoes: listaCartoes }) : null,
    // Vários lançamentos numa mensagem (21/11/2026): cada item passa pela MESMA limpeza.
    itens: acao === 'lancar_varios'
      ? (Array.isArray(d.itens) ? d.itens : []).slice(0, 20)
        .map((i) => limparIA({ ...i, acao: 'lancar' }, { texto: [i?.descricao, i?.forma].filter(Boolean).join(' '), hoje, categorias, cartoes: listaCartoes, pessoas, membros }))
        .filter((i) => i.valor)
        .map(({ itens: _i, acao: _a, ...resto }) => resto)
      : null,
  }
}

// Pergunta sobre os números (A8.23 parte 2, 26/11/2026): a IA só diz O QUE a pessoa quer saber;
// o número vem do motor do app (consulta.js). Aqui: tipo conhecido, categoria só das do grupo,
// cartão só da lista, mês válido (até 2 anos pra trás, nunca depois do mês que vem).
export const TIPOS_CONSULTA = ['gasto', 'falta_pagar', 'fatura', 'sobra', 'entradas']
export function limparConsulta(c, { hoje, categorias = [], cartoes = [] } = {}) {
  if (!c || typeof c !== 'object' || !TIPOS_CONSULTA.includes(c.tipo)) return null
  const atual = String(hoje || '').slice(0, 7)
  const [ah, mh] = atual.split('-').map(Number)
  const m = String(c.mes || '').match(/^(\d{4})-(\d{2})$/)
  const dist = m ? (ah - Number(m[1])) * 12 + (mh - Number(m[2])) : null // meses pra trás
  const mes = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && dist >= -1 && dist <= 24 ? c.mes : atual
  const cartao = (cartoes || []).find((x) => x.id === c.cartao_id) || null
  const categoria = (categorias || []).includes(c.categoria) ? c.categoria : null
  const termo = categoria ? null : (String(c.termo || '').replace(/\s+/g, ' ').trim().slice(0, 40) || null)
  // "quanto falta pagar do Nubank" = a fatura daquele cartão
  const tipo = c.tipo === 'falta_pagar' && cartao ? 'fatura' : c.tipo
  return {
    tipo, mes,
    categoria: tipo === 'gasto' ? categoria : null,
    termo: tipo === 'gasto' ? termo : null,
    cartao_id: tipo === 'fatura' && cartao ? cartao.id : null,
  }
}

// Precisa do "tá certo?" antes de salvar?
// Pessoa que ainda não está no cadastro também pergunta (evita "Jack" e "Jak" virarem 2 pessoas).
export const emDuvida = (d) => !(Number(d?.confianca) >= LIMIAR_CONFIANCA) || !!d?.pessoa_nova

// O que vai pro banco no lançamento (wa_salvar_lancamento) — sem os campos só de tela.
export function paraSalvar(d) {
  return {
    tipo: d.tipo, valor: d.valor, descricao: d.descricao, categoria: d.categoria,
    cartao_id: d.cartao_id, data: d.data, parcelas: d.parcelas,
    tipo_pagamento: d.tipo !== 'entrada' && !d.cartao_id ? (d.forma === 'dinheiro' ? 'dinheiro' : 'pix') : null,
    pessoa_nome: d.tipo !== 'entrada' && d.pessoa ? d.pessoa : null,
  }
}

// Do jeito que o banco salva (wa_salvar_lancamento): parcelado só no cartão (sem cartão vira um
// gasto só, com o valor todo) e a parcela = total ÷ parcelas, arredondada no centavo.
export function comoVaiSalvar(d) {
  const parcelado = d.tipo !== 'entrada' && !!d.cartao_id && d.parcelas > 1
  return parcelado
    ? { ...d, valor_parcela: Math.round((d.valor / d.parcelas) * 100) / 100 }
    : { ...d, parcelas: 1, valor_parcela: undefined }
}

// Mensagem de lançamento salvo (gasto ou entrada), com o valor da parcela quando parcelado.
export function msgLancado(nome, d, hoje) {
  const dd = comoVaiSalvar(d)
  return d.tipo === 'entrada' ? TEXTOS.entradaLancada(dd, hoje) : TEXTOS.gastoLancado(nome, dd, hoje)
}

// Custo da transcrição (OpenAI Whisper): US$ 0,006 por minuto, cobrado por segundo.
export const custoAudioUsd = (segundos) => Math.max(0, Number(segundos) || 0) / 60 * 0.006

// ---------------------------------------------------------------- foto e PDF (21/11/2026)
// Comprovante (Pix, transferência, boleto pago), nota fiscal ou cupom: a IA lê a imagem/PDF e o
// Joca SEMPRE pergunta "tá certo?" antes de lançar (leitura de foto erra mais que texto).
// Limites: tamanho do arquivo e fotos por pessoa por dia (além do limite de lançamentos do mês e do
// teto diário de IA que já valem pra tudo no WhatsApp).
export const MIDIA_MAX_BYTES = { imagem: 5_000_000, pdf: 3_000_000 }
export const FOTOS_POR_DIA = 15
export const MIDIA_TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

// Instrução a mais pra IA quando a mensagem é uma foto/PDF.
export function instrucoesMidia() {
  return [
    '',
    'ATENÇÃO: a mensagem é uma FOTO ou PDF (pode vir com uma legenda em "texto").',
    'Se for comprovante de pagamento (Pix, transferência, boleto pago, cartão), nota fiscal ou cupom fiscal:',
    '- use acao "lancar" com UM lançamento: o VALOR TOTAL pago (nunca some nem liste os itens do cupom), a data da compra/pagamento, descricao = nome da loja ou de quem recebeu (curto), categoria pelo tipo de loja.',
    '- Pix ou transferência que a PESSOA RECEBEU (ela é quem recebe) = tipo "entrada". Se ela pagou = "gasto".',
    '- forma: "cartao" se o comprovante for de cartão; "dinheiro" se disser dinheiro; senão "pix". cartao_id só se o nome do cartão bater com um da lista.',
    '- Se a legenda disser algo (ex.: "foi no Nubank", "dividido em 3x"), ela vale mais que a foto.',
    '- Se a foto estiver ilegível ou faltar o valor total, use confianca baixa e valor null.',
    'Se NÃO for comprovante, nota ou cupom (foto de pessoa, paisagem, print de conversa etc.), use acao "outro".',
  ].join('\n')
}

export const TEXTOS_MIDIA = {
  grande: 'Esse arquivo é grande demais pra eu ler 😅 Manda uma foto do comprovante (ou um PDF menor) ou me escreve o valor, tipo *mercado 120*.',
  tipo: 'Esse tipo de arquivo eu não consigo ler 😅 Manda uma *foto* ou *PDF* do comprovante, nota ou cupom — ou me escreve o valor, tipo *mercado 120*.',
  naoE: 'Não achei um comprovante, nota ou cupom nessa imagem 🤔 Se for um gasto, me manda a foto do comprovante ou escreve o valor, tipo *farmácia 48,90*.',
  semValor: 'Não consegui ler o valor total nesse comprovante 😕 Me escreve o valor, tipo *mercado 120*, que eu lanço.',
  falhou: 'Não consegui ler esse arquivo agora 😕 Tenta mandar de novo ou me escreve o valor, tipo *mercado 120*.',
  limiteDia: `Hoje você já mandou ${FOTOS_POR_DIA} fotos de comprovante 📸 Amanhã libera de novo. Até lá, me escreve o valor que eu lanço, tipo *mercado 120*.`,
  pergunta: (d, hoje) => [
    'Li o comprovante 🧾',
    '',
    resumoLancamento(comoVaiSalvar(d), hoje),
    '',
    'Tá certo? Responde *sim* que eu lanço.',
    'Se algo estiver errado, me diz o certo (ex.: *era 85,90* ou *foi no Nubank*).',
  ].join('\n'),
}

// ---------------------------------------------------------------- vários lançamentos (21/11/2026)
// Uma mensagem com vários gastos ("mercado 300, farmácia 80 e uber 25"): o Joca SEMPRE lista e
// pergunta "tá certo?" antes de salvar. Até VARIOS_MAX por mensagem; acima disso, o app.
// Correção sem IA: "tira o 2" e "o 3 é 70".
export const VARIOS_MAX = 5
export const LINK_LANCAR_VARIOS = 'app.hopefin.com.br/lancar-varios'

// Uma linha por lançamento: "1. 💸 *R$ 300,00* · Mercado · Pix"
export function linhaItem(d, n, hoje) {
  const entrada = d.tipo === 'entrada'
  const partes = [`${n}. ${entrada ? '💰' : '💸'} *${brl(d.valor)}* · ${d.descricao}`]
  if (!entrada) partes.push(d.cartao_nome ? `${d.cartao_nome}${d.parcelas > 1 ? ` ${d.parcelas}x` : ''}` : rotuloForma(d.forma))
  if (d.data && d.data !== hoje) partes.push(`📅 ${ddmm(d.data)}`)
  if (!entrada && d.pessoa) partes.push(`👤 ${d.pessoa}`)
  return partes.join(' · ')
}
export const listaItens = (itens, hoje) => itens.map((d, i) => linhaItem(d, i + 1, hoje)).join('\n')

export const TEXTOS_VARIOS = {
  pergunta: (itens, hoje, arrumei = false) => [
    arrumei ? `Arrumei 👇 Agora são *${itens.length}*:` : `Entendi *${itens.length} lançamentos* 👇`,
    '',
    listaItens(itens, hoje),
    '',
    'Tá certo? Responde *sim* que eu lanço tudo.',
    `Pra mudar: *tira o 1* ou *o ${itens.length} é 70*.`,
  ].join('\n'),
  lancados: (nome, itens, hoje) => [
    `${comNome('Prontinho', nome)} Lancei ${itens.length === 1 ? 'o lançamento' : `os ${itens.length}`} 👇`,
    '',
    listaItens(itens, hoje),
  ].join('\n'),
  parcial: (salvos, total, motivo) => [
    `Lancei *${salvos} de ${total}* 😕`,
    motivo === 'limite' ? 'Os outros não couberam no seu limite de lançamentos por WhatsApp deste mês — lança pelo app, que lá segue tudo normal.'
      : motivo === 'assinatura' ? 'Sua assinatura ficou inativa no meio do caminho — reative no app pra lançar o resto.'
      : 'Os outros deram erro aqui — confere em Gastos no app e lança o que faltou.',
  ].join('\n'),
  muitos: (n) => `Vi *${n} lançamentos* nessa mensagem 😅 Por aqui eu lanço até ${VARIOS_MAX} de cada vez. Manda em partes ou usa o *Lançar vários* do app: ${LINK_LANCAR_VARIOS}`,
  numeroInvalido: (n, total) => `Não achei o item ${n} 🤔 A lista vai de 1 a ${total}. Ex.: *tira o 2* ou *o 3 é 70*.`,
  esvaziou: 'Tirei todos, então não lancei nada 👍 Se quiser, me manda de novo.',
}

// Valor em reais escrito pela pessoa: "70", "70,50", "1.200,50", "1200.5".
export function lerValor(txt) {
  let t = String(txt || '').replace(/r\$\s*/i, '').trim()
  if (/,/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  const v = Number(t)
  return Number.isFinite(v) && v > 0 && v <= 10_000_000 ? Math.round(v * 100) / 100 : null
}

// "tira o 2" / "o 3 é 70" em cima da lista que espera o "sim". Devolve { itens } (lista nova),
// { erro: 'numero', n } (não existe esse item) ou null (não é uma edição da lista).
export function editarLista(texto, itens) {
  const t = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const lista = Array.isArray(itens) ? itens : []
  const tirar = t.match(/^(?:tira|tirar|tire|remove|remover|apaga|apagar|exclui|excluir|sem)\s+(?:o\s+|a\s+)?(?:item\s+|numero\s+)?(\d{1,2})\s*$/)
  if (tirar) {
    const n = Number(tirar[1])
    if (n < 1 || n > lista.length) return { erro: 'numero', n }
    return { itens: lista.filter((_, i) => i !== n - 1) }
  }
  const valor = t.match(/^(?:o\s+|a\s+)?(?:item\s+|numero\s+)?(\d{1,2})\s*(?:e|era|eh|=|:|vale|foi|fica|custou)\s+(?:r\$\s*)?(\d[\d.]*(?:,\d{1,2})?)\s*$/)
  if (valor) {
    const n = Number(valor[1])
    const v = lerValor(valor[2])
    if (n < 1 || n > lista.length) return { erro: 'numero', n }
    if (!v) return null
    return { itens: lista.map((it, i) => (i === n - 1 ? { ...it, valor: v } : it)) }
  }
  return null
}
