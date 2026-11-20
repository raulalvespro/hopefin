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
const comNome = (prefixo, nome) => (primeiroNome(nome) ? `${prefixo}, ${primeiroNome(nome)}!` : `${prefixo}!`)
const maiuscula = (s) => { const t = String(s || '').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t }

// "R$ 100,00 · Janta · 🏷️ Alimentação · 💳 Itaú azul · 3x de R$ 33,33 · 📅 18/11"
// Data só quando não é hoje; parcelas só quando é parcelado; cartão só quando tem.
export function resumoLancamento(d, hoje) {
  const partes = [`${brl(d.valor)} · ${d.descricao}`]
  if (d.tipo !== 'entrada') {
    if (d.categoria) partes.push(`🏷️ ${rotuloCategoria(d.categoria)}`)
    if (d.cartao_nome) partes.push(`💳 ${d.cartao_nome}`)
    if (d.parcelas > 1) partes.push(`${d.parcelas}x de ${brl(d.valor_parcela ?? d.valor / d.parcelas)}`)
  }
  if (d.data && d.data !== hoje) partes.push(`📅 ${ddmm(d.data)}`)
  return partes.join(' · ')
}

// O último lançamento como o banco devolve (wa_ultimo_lancamento) -> mesmo resumo.
export function resumoUltimo(u, hoje) {
  return resumoLancamento({
    tipo: u.tipo === 'entrada' ? 'entrada' : 'gasto', valor: Number(u.valor), descricao: u.descricao,
    categoria: u.categoria, cartao_nome: u.cartao_nome, parcelas: Number(u.num_parcelas) || 1,
    valor_parcela: u.valor_parcela != null ? Number(u.valor_parcela) : undefined, data: u.data,
  }, hoje)
}

// ---------------------------------------------------------------- textos
export const TEXTOS = {
  // (aprovado) gasto lançado
  gastoLancado: (nome, d, hoje) => `${comNome('Prontinho', nome)} Lancei aqui 👇\n${resumoLancamento(d, hoje)}`,
  // (aprovado) entrada lançada
  entradaLancada: (d, hoje) => `Oba, entrou dinheiro! 💰\n${resumoLancamento(d, hoje)}\nJá está nas suas entradas.`,
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
    '✏️ *Errou?* "o valor era 50" ou "apaga o último"',
    '',
    'Eu entendo sozinho o valor, a data ("ontem", "sexta", "dia 3"), a categoria, o cartão e as parcelas. Manda um lançamento de cada vez. 💙',
  ].join('\n'),

  // --- novos (esperam o ok do Raul) ---
  taCerto: (d, hoje) => [
    'Deixa eu conferir antes de lançar 🤔',
    `${d.tipo === 'entrada' ? '💰 Entrada de' : '💸 Gasto de'} ${resumoLancamento(comoVaiSalvar(d), hoje)}`,
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
    '✏️ arrumo o último: *o valor era 50* ou *apaga o último*',
    'Manda um de cada vez 😉',
  ].join('\n'),
  pergunta: 'Ainda não respondo perguntas por aqui, mas tá chegando 🚧 Por enquanto, o Início do app mostra quanto entrou, quanto saiu e o que falta pagar no mês.',
  investimento: 'Dica de investimento eu não dou 🙏 Isso é com um assessor de investimentos registrado na CVM. O que eu faço é te ajudar a organizar as contas da família pra sobrar mais todo mês 💙',

  // fatura ("paguei a fatura do X")
  faturaPergunta: ({ cartao, fatura, valorDito, temParcelas }) => {
    const verbo = fatura.status === 'atrasada' ? 'venceu' : 'vence'
    const linhas = [`Achei a fatura do ${cartao} que ${verbo} ${ddmm(fatura.vencimento)}: ${brl(fatura.total)} 💳`]
    if (valorDito && Math.abs(Number(valorDito) - Number(fatura.total)) >= 0.01) {
      linhas.push(`(Você falou ${brl(valorDito)}. Se tiver compra faltando ou sobrando nela, ajusta no app em Cartões.)`)
    }
    linhas.push(`Marco como paga?${temParcelas ? ' As parcelas dela entram como pagas também.' : ''}`)
    linhas.push('Responde *sim* pra confirmar.')
    return linhas.join('\n')
  },
  faturaPaga: (nome, { cartao, vencimento, total, parcelas }, hoje) =>
    `${comNome('Prontinho', nome)} Fatura do ${cartao} (${venceOuVenceu(vencimento, hoje)} ${ddmm(vencimento)}) marcada como paga ✅\n${brl(total)}${parcelas ? ` · ${parcelas} ${parcelas === 1 ? 'parcela entrou' : 'parcelas entraram'} como paga${parcelas === 1 ? '' : 's'}` : ''}`,
  faturaJaPaga: (cartao, vencimento, hoje) => `A fatura do ${cartao} que ${venceOuVenceu(vencimento, hoje)} ${ddmm(vencimento)} já está paga 👍`,
  faturaNada: (cartao, aberta) => `Não tem fatura do ${cartao} pra pagar agora 👍 A aberta fecha ${ddmm(aberta.fechamento)} e vence ${ddmm(aberta.vencimento)}.`,
  faturaMudou: (cartao, total) => `O valor da fatura do ${cartao} mudou desde a pergunta: agora está em ${brl(total)}. Marco como paga? Responde *sim*.`,
  faturaQualCartao: (nomes) => (nomes.length
    ? `De qual cartão? Me manda assim: *paguei a fatura do ${nomes[0]}*.\nSeus cartões: ${nomes.join(', ')}.`
    : 'Você ainda não tem cartão cadastrado no app. Cadastra em Cartões › Novo e me chama de novo 😉'),

  // último lançamento ("apaga o último", "o valor era 50")
  apagarPergunta: (u, hoje) => `Apago este lançamento? 🗑️\n${resumoUltimo(u, hoje)}\nResponde *sim* pra apagar.`,
  apagado: (u) => `Apaguei ✅ ${brl(u.valor)} · ${u.descricao}. Se precisar, é só me mandar de novo.`,
  corrigirPergunta: (u, novo) => `Corrijo o último lançamento? ✏️\n${u.descricao}: de ${brl(u.valor)} pra ${brl(novo)}\nResponde *sim* pra confirmar.`,
  corrigido: (r, hoje) => `Arrumei ✅ Agora ficou assim 👇\n${resumoUltimo({ ...r, valor: r.valor, valor_parcela: r.valor_parcela }, hoje)} (antes ${brl(r.valor_antes)})`,
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
export const ACOES = ['lancar', 'pagar_fatura', 'apagar_ultimo', 'corrigir_ultimo', 'saudacao', 'agradecimento',
  'ajuda', 'pergunta', 'investimento', 'outro']

// Instruções do Joca para a IA (Claude Haiku). A regra de NÃO recomendar investimento fica
// escrita aqui (decisão do Raul, 20/11/2026: só educação financeira).
export function instrucoesIA({ hoje, semana, categorias }) {
  return [
    'Você é o Joca, o assistente do HopeFin (app de finanças da família) no WhatsApp.',
    'Leia a mensagem da pessoa e responda APENAS com um objeto JSON válido, sem nenhum texto fora do JSON.',
    '',
    'Regras do Joca (valem sempre):',
    '- Você só ajuda a organizar o dinheiro da família: lançar gastos e entradas, marcar fatura de cartão como paga e corrigir o último lançamento.',
    '- Educação financeira pode: organizar gastos, reserva de emergência, sair das dívidas, usar bem o cartão.',
    '- NUNCA recomende investimento específico (ação, fundo, título, criptomoeda, previdência, corretora ou banco pra investir). Isso é consultoria de investimentos e só um profissional registrado na CVM pode fazer.',
    '- Nunca invente valores, datas ou cartões que a pessoa não disse.',
    '',
    'Escolha a "acao":',
    '- "lancar": a pessoa conta um gasto ou um dinheiro que entrou. Ex.: "mercado 120", "uber 23,50 ontem", "tênis 300 em 3x no Nubank", "recebi 2000 de salário".',
    '- "pagar_fatura": diz que PAGOU a fatura de um cartão. Ex.: "paguei a fatura do Nubank", "fatura do Itaú paga". Isso NÃO é um gasto novo.',
    '- "apagar_ultimo": pede pra apagar ou desfazer o último lançamento. Ex.: "apaga o último", "lancei errado, apaga".',
    '- "corrigir_ultimo": corrige o VALOR do último lançamento. Ex.: "o valor era 50", "na verdade foi 45,90".',
    '- "saudacao": oi, bom dia, tudo bem.',
    '- "agradecimento": obrigado, valeu.',
    '- "ajuda": pergunta o que o Joca faz ou como usar.',
    '- "pergunta": pergunta sobre o próprio dinheiro (quanto gastou, quanto falta pagar) ou sobre organizar as finanças.',
    '- "investimento": pede dica ou recomendação de onde investir.',
    '- "outro": nada disso.',
    '',
    'Campos (null quando não se aplica):',
    '- acao: uma das opções acima',
    '- tipo: "gasto" ou "entrada" (só em "lancar")',
    '- valor: número em reais com ponto decimal, sem símbolo. Em "lancar": o valor total. Em "corrigir_ultimo": o valor certo. Em "pagar_fatura": o valor que a pessoa disse que pagou, ou null.',
    '- descricao: texto curto e natural (só em "lancar")',
    `- categoria: UMA destas (ou "outros"): ${(categorias || []).join(', ') || 'outros'}`,
    '- cartao_id: id de um cartão da lista (em "lancar", se foi no cartão; em "pagar_fatura", o cartão da fatura), ou null',
    `- data: "YYYY-MM-DD". Hoje é ${hoje} (${semana}, America/Sao_Paulo). Entenda "ontem", "sexta", "dia 3". (só em "lancar")`,
    '- parcelas: inteiro >= 1 (1 = à vista) (só em "lancar")',
    '- confianca: de 0 a 1, o quanto você tem certeza da ação e dos campos principais (valor e tipo). Se faltar o valor ou a frase for ambígua, use confiança baixa (abaixo de 0.6).',
    '',
    'Se vier "pendente" (um lançamento que o Joca perguntou "tá certo?" e ainda NÃO foi salvo) e a mensagem corrigir algo dele (valor, cartão, data, categoria, parcelas ou descrição), use acao "lancar" e devolva o lançamento COMPLETO já corrigido.',
  ].join('\n')
}

// O lançamento que espera o "sim", do jeito que vai pra IA como "pendente".
export function pendenteParaIA(d) {
  if (!d) return undefined
  return { tipo: d.tipo, valor: d.valor, descricao: d.descricao, categoria: d.categoria, cartao_id: d.cartao_id, data: d.data, parcelas: d.parcelas }
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
export function limparIA(dados, { texto, hoje, categorias, cartoes }) {
  const d = dados || {}
  const listaCartoes = cartoes || []
  const cartao = listaCartoes.find((c) => c.id === d.cartao_id) || null
  const valor = Number(d.valor)
  const acao = ACOES.includes(d.acao) ? d.acao : (d.tipo === 'gasto' || d.tipo === 'entrada' ? 'lancar' : 'outro')
  const conf = Number(d.confianca)
  const parcelas = Number(d.parcelas)
  return {
    acao,
    tipo: d.tipo === 'entrada' ? 'entrada' : 'gasto',
    valor: Number.isFinite(valor) && valor > 0 && valor <= 10_000_000 ? Math.round(valor * 100) / 100 : null,
    descricao: maiuscula(String(d.descricao || texto || '').slice(0, 120)) || 'Lançamento',
    categoria: (categorias || []).includes(d.categoria) ? d.categoria : 'outros',
    cartao_id: cartao ? cartao.id : null,
    cartao_nome: cartao ? String(cartao.nome || '').trim() || null : null,
    data: /^\d{4}-\d{2}-\d{2}$/.test(String(d.data || '')) ? d.data : hoje,
    parcelas: Number.isInteger(parcelas) && parcelas > 1 && parcelas <= 72 ? parcelas : 1,
    confianca: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.5,
  }
}

// Precisa do "tá certo?" antes de salvar?
export const emDuvida = (d) => !(Number(d?.confianca) >= LIMIAR_CONFIANCA)

// O que vai pro banco no lançamento (wa_salvar_lancamento) — sem os campos só de tela.
export function paraSalvar(d) {
  return {
    tipo: d.tipo, valor: d.valor, descricao: d.descricao, categoria: d.categoria,
    cartao_id: d.cartao_id, data: d.data, parcelas: d.parcelas,
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
