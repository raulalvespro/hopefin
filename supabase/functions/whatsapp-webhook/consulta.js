// consulta.js — o Joca responde perguntas sobre o dinheiro com os NÚMEROS DO APP (A8.23 parte 2, 26/11/2026).
//
// A IA só entende a pergunta (tipo, categoria/termo, cartão e mês — ver joca.js › limparConsulta).
// O número sai SEMPRE do motor único do app (_shared/motor.js), o mesmo do Início, Categorias,
// Contas do mês e Cartões — a IA nunca escreve número nenhum. Sem rede e sem banco: o webhook
// carrega `dados` (carregarDadosMotor) e chama responderConsulta; os testes usam dados de mentira.
//
// Tipos:
//   gasto       "quanto gastei com mercado / de uber / no total" (= tela Categorias: só o que é seu)
//   falta_pagar "quanto falta pagar" (= "a pagar" do Início: o que vence no mês e não foi pago)
//   fatura      "quanto está a fatura do Nubank" (= Cartões: a fatura a pagar e a aberta)
//   sobra       "quanto sobra / quanto posso gastar" (= "Vai sobrar no fim do mês" do Início)
//   entradas    "quanto entrou / vai entrar" (= entradas do mês, com o que falta receber)
import { resumoMes, meuGastoDoMes, faturasDoCartaoAgora, compDe, addMeses, arred } from '../_shared/motor.js'
import { brl, ddmm, rotuloCategoria, normalizar, TIPOS_CONSULTA } from './joca.js'

export { TIPOS_CONSULTA }
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// "novembro" (mesmo ano) ou "novembro de 2025".
export function nomeMes(comp, hoje) {
  const [a, m] = String(comp).split('-').map(Number)
  const nome = MESES[(m || 1) - 1]
  return String(a) === String(hoje).slice(0, 4) ? nome : `${nome} de ${a}`
}
const emMes = (comp, hoje) => (comp === compDe(hoje) ? `Neste mês (${nomeMes(comp, hoje)})` : `Em ${nomeMes(comp, hoje)}`)
const venceTxt = (data, hoje) => (data && data < hoje ? `venceu ${ddmm(data)}` : data ? `vence ${ddmm(data)}` : 'sem data')
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

// Janela de meses que o webhook precisa carregar para responder (cobre a fatura "de agora").
export function janelaConsulta(c, hoje) {
  const atual = compDe(hoje)
  const mes = c?.mes || atual
  return { compIni: [mes, addMeses(atual, -4)].sort()[0], compFim: [mes, addMeses(atual, 2)].sort()[1] }
}

// ---------------------------------------------------------------- cálculo (números do app)
export function calcularConsulta(c, dados, hoje) {
  const mes = c.mes || compDe(hoje)
  if (c.tipo === 'gasto') {
    const meu = meuGastoDoMes(mes, dados)
    const termo = normalizar(c.termo || '')
    const itens = meu.itens.filter((i) => (!c.categoria || i.categoria === c.categoria) && (!termo || normalizar(i.descricao).includes(termo)))
    const total = arred(itens.reduce((s, i) => s + Number(i.valor || 0), 0))
    const porCategoria = Object.entries(meu.porCategoria).map(([cat, v]) => ({ categoria: cat, total: v.total })).sort((a, b) => b.total - a.total)
    return { tipo: 'gasto', mes, total, qtd: itens.length, maiores: [...itens].sort((a, b) => b.valor - a.valor).slice(0, 3), porCategoria, categoria: c.categoria || null, termo: c.termo || null }
  }
  if (c.tipo === 'fatura') {
    const cartao = (dados.cartoes || []).find((x) => x.id === c.cartao_id)
    if (!cartao) return { tipo: 'fatura', semCartao: true, cartoes: (dados.cartoes || []).filter((x) => x.ativo !== false).map((x) => String(x.nome || '').trim()) }
    const { aPagar, aberta } = faturasDoCartaoAgora(cartao, dados, hoje)
    const resumo = (f) => f && { total: f.total, fechamento: f.fechamento, vencimento: f.vencimento, status: f.status, paga: f.paga }
    return { tipo: 'fatura', cartao: String(cartao.nome || '').trim(), aPagar: resumo(aPagar), aberta: resumo(aberta) }
  }
  const r = resumoMes(mes, dados, { hoje })
  if (c.tipo === 'falta_pagar') {
    const abertos = [
      ...r.faturas.filter((x) => !x.paga).map((x) => ({ descricao: x.descricao, valor: x.valor, data: x.vencimento })),
      ...[...r.fixas, ...r.parcelasAvulsas, ...r.assinaturasAvulsas, ...r.aVista, ...r.cofrinhos]
        .filter((x) => !x.paga && Number(x.valor) > 0.004).map((x) => ({ descricao: x.descricao, valor: Number(x.valor), data: x.data })),
    ].sort((a, b) => String(a.data || '9').localeCompare(String(b.data || '9')))
    return { tipo: 'falta_pagar', mes, total: r.aPagar, itens: abertos }
  }
  if (c.tipo === 'sobra') {
    return { tipo: 'sobra', mes, sobra: r.sobraDoMes, entra: r.entradasPrevistas, sai: r.totalSaidas, porDia: r.porDia, dias: r.diasRestantes, ehAtual: r.ehAtual }
  }
  return { tipo: 'entradas', mes, previsto: r.entradasPrevistas, recebido: r.entradasRecebidas, falta: r.aReceber, qtd: r.entradas.length }
}

// ---------------------------------------------------------------- texto
const RODAPE = '_Os números são os mesmos do app._'
export function textoConsulta(x, hoje) {
  if (x.tipo === 'gasto') {
    const sobre = x.termo ? `com "${x.termo}"` : x.categoria ? `com ${rotuloCategoria(x.categoria)}` : null
    if (!x.qtd) return `${emMes(x.mes, hoje)} não achei nenhum gasto ${sobre || ''} 🤔`.replace(/\s+🤔/, ' 🤔') + (x.termo ? '\nEu procuro pelo nome do lançamento — se lançou com outro nome, me pergunta por ele ou pela categoria.' : '')
    const linhas = sobre
      ? [`📊 ${emMes(x.mes, hoje)} você gastou *${brl(x.total)}* ${sobre} (${plural(x.qtd, 'lançamento', 'lançamentos')}).`]
      : [`📊 ${emMes(x.mes, hoje)} seus gastos somam *${brl(x.total)}*.`, '', 'Onde mais foi:', ...x.porCategoria.slice(0, 3).map((p) => `• ${rotuloCategoria(p.categoria)} · ${brl(p.total)}`)]
    if (sobre && x.qtd > 1) linhas.push('', 'Os maiores:', ...x.maiores.map((i) => `• ${i.descricao} · ${brl(i.valor)}${i.data ? ` · ${ddmm(i.data)}` : ''}`))
    linhas.push('', 'Só o que é seu (o que é de outras pessoas fica no A receber).', RODAPE)
    return linhas.join('\n')
  }
  if (x.tipo === 'fatura') {
    if (x.semCartao) return x.cartoes.length
      ? `De qual cartão? Me pergunta assim: *quanto está a fatura do ${x.cartoes[0]}?*\nSeus cartões: ${x.cartoes.join(', ')}.`
      : 'Você ainda não tem cartão cadastrado no app 😉'
    const linhas = [`💳 *${x.cartao}*`]
    if (x.aPagar) linhas.push('', `A pagar: *${brl(x.aPagar.total)}* · ${venceTxt(x.aPagar.vencimento, hoje)}${x.aPagar.status === 'atrasada' ? ' ⚠️' : ''}`)
    else linhas.push('', 'Nenhuma fatura fechada esperando pagamento ✅')
    if (x.aberta) linhas.push(`Aberta (fecha ${ddmm(x.aberta.fechamento)}, vence ${ddmm(x.aberta.vencimento)}): *${brl(x.aberta.total)}* até agora`)
    linhas.push('', RODAPE)
    return linhas.join('\n')
  }
  if (x.tipo === 'falta_pagar') {
    if (!(x.total > 0.004)) return `${emMes(x.mes, hoje)} está tudo pago ✅ Não falta nenhuma conta.`
    const mostra = x.itens.slice(0, 6)
    const linhas = [`🧾 ${emMes(x.mes, hoje)} ainda falta pagar *${brl(x.total)}*:`, '', ...mostra.map((i) => `• ${i.descricao} · ${brl(i.valor)} · ${venceTxt(i.data, hoje)}`)]
    if (x.itens.length > mostra.length) linhas.push(`• e mais ${plural(x.itens.length - mostra.length, 'conta', 'contas')} — veja em Contas do mês`)
    linhas.push('', RODAPE)
    return linhas.join('\n')
  }
  if (x.tipo === 'sobra') {
    const passado = x.mes < compDe(hoje)
    const linhas = x.sobra >= 0
      ? [passado ? `💙 Em ${nomeMes(x.mes, hoje)} sobrou *${brl(x.sobra)}*.` : `💙 Pelas contas de ${nomeMes(x.mes, hoje)}, vai sobrar *${brl(x.sobra)}* no fim do mês.`]
      : [`😬 As contas de ${nomeMes(x.mes, hoje)} ${passado ? 'passaram' : 'passam'} do que entra: ${passado ? 'faltaram' : 'faltam'} *${brl(-x.sobra)}*.`]
    linhas.push('', `💰 Entra: ${brl(x.entra)}`, `💸 Sai: ${brl(x.sai)}`)
    if (x.ehAtual && x.sobra > 0) linhas.push('', `Dá cerca de ${brl(x.porDia)} por dia nos próximos ${plural(x.dias, 'dia', 'dias')}.`)
    linhas.push('', RODAPE)
    return linhas.join('\n')
  }
  const linhas = [`💰 ${emMes(x.mes, hoje)} entrou *${brl(x.recebido)}*.`]
  if (x.falta > 0.004) linhas.push(`Ainda falta entrar ${brl(x.falta)} (no total, ${brl(x.previsto)} previstos).`)
  linhas.push('', RODAPE)
  return linhas.join('\n')
}

export const responderConsulta = (c, dados, hoje) => textoConsulta(calcularConsulta(c, dados, hoje), hoje)
