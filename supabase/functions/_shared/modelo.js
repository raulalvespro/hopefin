// modelo.js — monta o conteúdo de um e-mail a partir do texto salvo no Painel (email_modelos, 0090).
// Sem rede e sem banco (testes em tests/email-modelo.test.js). Quem chama junta com layoutEmail().
//
// Formato do texto (corpo): linha em branco = novo parágrafo; **assim** = negrito; {variavel} = trecho
// que se preenche sozinho. TUDO que a pessoa escreveu é escapado antes de virar HTML; só os valores de
// variáveis marcadas como { html } (montadas pelo nosso código, ex.: lista de contas) entram sem escapar.
// Variável desconhecida ou vazia some. Parágrafos que ficam vazios (ex.: {oferta} fora da oferta) somem.

export const APP = 'https://app.hopefin.com.br'

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || ''

// Variáveis que todo e-mail tem: {nome} e {ola} ("Oi, Ana!" ou "Oi!").
export function varsBase(nome) {
  const p = primeiroNome(nome)
  return { nome: p, ola: p ? `Oi, ${p}!` : 'Oi!' }
}

const VAR = /\{([a-z_]+)\}/g

function valorTexto(v) {
  if (v == null) return ''
  if (typeof v === 'object') return String(v.texto ?? '')
  return String(v)
}
function valorHtml(v) {
  if (v == null) return ''
  if (typeof v === 'object') return v.html != null ? String(v.html) : esc(v.texto ?? '')
  return esc(String(v))
}

// Assunto, título e preheader: texto puro (sem HTML), com as variáveis em versão texto.
export function preencherTexto(tpl, vars = {}) {
  return String(tpl ?? '').replace(VAR, (_, k) => valorTexto(vars[k])).replace(/\s{2,}/g, ' ').trim()
}

// Corpo: texto do Painel → HTML seguro.
export function corpoParaHtml(tpl, vars = {}) {
  const paragrafos = String(tpl ?? '').replace(/\r\n/g, '\n').split(/\n\s*\n/)
  const html = paragrafos.map((p) => {
    let h = esc(p.trim())
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    h = h.replace(/\n/g, '<br>')
    h = h.replace(VAR, (_, k) => valorHtml(vars[k]))
    return h.trim()
  }).filter((p) => p && p.replace(/<br>/g, '').trim())
  return html.join('<br><br>')
}

// Link do botão: tela do app ('/planos') ou endereço https completo. Qualquer outra coisa = sem botão.
export function linkBotao(link) {
  const l = String(link || '').trim()
  if (!l) return null
  if (/^https:\/\/[^\s"<>]+$/.test(l)) return l
  if (/^\/[A-Za-z0-9/?=&_.-]*$/.test(l)) return APP + (l === '/' ? '' : l)
  return null
}

// Junta tudo: { assunto, titulo, preheader, corpoHtml, cta }.
export function montarConteudo(modelo, vars = {}) {
  const assunto = preencherTexto(modelo.assunto, vars)
  const titulo = preencherTexto(modelo.titulo, vars) || assunto
  const preheader = preencherTexto(modelo.preheader, vars) || assunto
  const corpoHtml = corpoParaHtml(modelo.corpo, vars)
  const url = linkBotao(modelo.botao_link)
  const texto = String(modelo.botao_texto || '').trim()
  const cta = texto && url ? { texto, url } : undefined
  return { assunto, titulo, preheader, corpoHtml, cta }
}

// Remarketing e automações criadas no Painel saem pelo remetente de campanha, com "não quero receber".
export const ehCampanha = (m) => !!m && (m.categoria === 'remarketing' || m.categoria === 'personalizado')

// Valores de exemplo para a prévia e o "Enviar teste pra mim" no Painel.
export function varsExemplo(chave, { nome = 'Ana Souza', oferta = null } = {}) {
  const linha = (a, b) => `<tr><td style="padding:7px 0;border-bottom:1px solid #eef1f5;font-size:15px;color:#0f172a;">${a}</td>` +
    `<td style="padding:7px 0;border-bottom:1px solid #eef1f5;font-size:15px;color:#0f172a;text-align:right;">${b}</td></tr>`
  const tabela = (l) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${l}</table>`
  return {
    ...varsBase(nome),
    oferta: oferta ? { html: oferta, texto: '' } : '',
    fim: '25/11', dias_restantes: '3 dias',
    quem: 'Carlos', grupo: 'Família Souza',
    qtd_contas: '2 contas', total: 'R$ 389,90',
    lista_contas: { html: tabela(linha('Conta de luz <span style="color:#64748b;font-size:13px;"> · vence amanhã</span>', 'R$ 189,90') +
      linha('Internet <span style="color:#64748b;font-size:13px;"> · vence 28/11</span>', 'R$ 200,00')) },
    mes: 'outubro', saldo: 'R$ 1.250,00', sobra: 'R$ 830,00',
    numeros: { html: `Fechou <strong>outubro</strong>! Aqui entram os números do mês da família (entrou, pago, saldo e sobra), faturas e categorias.<br><br>` +
      tabela(linha('Entrou na conta', 'R$ 8.400,00') + linha('Pago no mês', 'R$ 7.150,00') + linha('<strong>Saldo do mês</strong>', '<strong>R$ 1.250,00</strong>')) },
    data_renovacao: '29/11/2026', valor: 'R$ 178,80', forma: 'em 12x',
    situacao: { html: 'Você continua usando o HopeFin normalmente até <strong>15/12/2026</strong> (período que já está pago).' },
    codigo: '#A1B2C3', assunto_chamado: { html: ' — “Não consigo lançar pelo áudio”' },
    resposta: { html: '<div style="border-left:3px solid #10b981;padding-left:14px;margin:4px 0;">Oi! Já corrigimos. Pode tentar de novo?</div>' },
    _chave: chave,
  }
}
