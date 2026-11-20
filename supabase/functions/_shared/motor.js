// motor.js — MOTOR ÚNICO de cálculo do HopeFin (Onda 1, 16/11/2026).
//
// Fonte única das contas de dinheiro do app (Início, Contas do mês, Cartões,
// Orçamento, Fechamento, Projeção, Alertas, Gastos) e dos e-mails/avisos (Edge
// Functions). JavaScript puro, sem dependências: roda no navegador (Vite) e no Deno.
//
// REGRAS (combinadas com o Raul em 16/11/2026 — ver aba "🛠️ Ajustes do app"):
//  • Caixa pelo VENCIMENTO: compra no cartão conta no mês em que a fatura VENCE.
//  • Em qual fatura a compra cai: data da compra × fechamento do cartão. Compra feita
//    NO dia do fechamento vai pra PRÓXIMA fatura (padrão dos bancos; o cartão pode
//    dizer 'atual'). "Mover de fatura" (gasto.fatura_ajuste) soma ±N faturas.
//  • Parcela: cai na fatura do mês do vencimento dela (data_vencimento).
//  • Parcelado NOVO no cartão (A2.5, 18/11/2026): a 1ª parcela cai na mesma fatura em que
//    a compra à vista cairia (data da compra × fechamento, ± ajuste); o 1º vencimento
//    guardado é o dia em que essa fatura vence. As seguintes vêm uma por fatura.
//  • Mover parcela de fatura leva junto as SEGUINTES da mesma compra; fatura já paga não
//    perde nem ganha parcela (A2.9, 18/11/2026).
//  • Assinatura: cobra todo mês no dia_cobranca (sem dia = dia 1), só a partir de
//    cobrada_desde; no cartão entra na fatura daquela cobrança.
//  • Compra de outra pessoa: no DINHEIRO sai normal (fatura/pix) e o reembolso entra
//    como entrada; no MEU GASTO (categorias, orçamento) não entra. Enquanto a pessoa
//    não paga, o reembolso fica PREVISTO (a receber) no mês em que o dinheiro sai —
//    mês da fatura, da parcela ou da compra (A1.14, 18/11/2026).
//  • Saldo do mês  = o que entrou na conta − o que foi pago no mês.
//  • Sobra do mês  = entradas do mês − tudo que vence no mês − à vista do mês
//    (− aportes em cofrinho + saques). É o "Quanto posso gastar".
//
// Datas: sempre strings 'YYYY-MM-DD' (sem fuso). Competência = 'YYYY-MM'.

const pad = (n) => String(n).padStart(2, '0')
const num = (v) => Number(v) || 0
const soma = (lista) => Math.round(lista.reduce((s, x) => s + num(x.valor), 0) * 100) / 100
export const arred = (v) => Math.round(num(v) * 100) / 100

// ---------------------------------------------------------------- datas
export const compDe = (iso) => String(iso || '').slice(0, 7)
export const diaDe = (iso) => Number(String(iso || '').slice(8, 10)) || 1

export function addMeses(comp, n) {
  const [y, m] = comp.split('-').map(Number)
  const t = y * 12 + (m - 1) + (Number(n) || 0)
  return `${Math.floor(t / 12)}-${pad(((t % 12) + 12) % 12 + 1)}`
}

export function diasNoMes(comp) {
  const [y, m] = comp.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

// Dia `dia` do mês `comp`, ajustado ao fim do mês (31 em fevereiro vira 28/29).
export function dataNoMes(comp, dia) {
  return `${comp}-${pad(Math.min(Math.max(1, Number(dia) || 1), diasNoMes(comp)))}`
}

// "Hoje" no fuso de São Paulo (vale no navegador e no servidor, que roda em UTC).
export function hojeBRT(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora)
}

export function compsEntre(ini, fim) {
  const out = []
  for (let c = ini; c <= fim; c = addMeses(c, 1)) out.push(c)
  return out
}

// ---------------------------------------------------------------- cartão
const diaF = (c) => Number(c?.dia_fechamento) || 1
const diaV = (c) => Number(c?.dia_vencimento) || 10
// Vencimento no dia <= fechamento => a fatura vence no mês SEGUINTE ao fechamento.
const atrasoVenc = (c) => (diaV(c) <= diaF(c) ? 1 : 0)
const regraAtual = (c) => c?.compra_no_fechamento === 'atual'

export const fechamentoNoMes = (cartao, comp) => dataNoMes(comp, diaF(cartao))
export const vencimentoDaComp = (cartao, comp) => dataNoMes(comp, diaV(cartao))
export const fechamentoDaComp = (cartao, comp) => fechamentoNoMes(cartao, addMeses(comp, -atrasoVenc(cartao)))

// Competência (mês do VENCIMENTO) da fatura em que uma compra feita em `iso` cai.
export function compDaCompra(cartao, iso, ajuste = 0) {
  const compMes = compDe(iso)
  const fech = fechamentoNoMes(cartao, compMes)
  const vaiProxima = regraAtual(cartao) ? iso > fech : iso >= fech
  const compFech = vaiProxima ? addMeses(compMes, 1) : compMes
  return addMeses(addMeses(compFech, atrasoVenc(cartao)), Number(ajuste) || 0)
}

// Uma data de compra que cai na fatura `comp`: a véspera do fechamento dela (vale nas
// duas regras do dia do fechamento). Usada no valor inicial do cartão novo (A2.7).
export const dataDeCompraNaFatura = (cartao, comp) => addDias(fechamentoDaComp(cartao, comp), -1)

// Parcelado no cartão (A2.5): 1º vencimento = dia em que vence a fatura da compra.
// O WhatsApp faz a mesma conta em SQL: public.vencimento_fatura_por_dias (migração 0063).
// Mudou a regra aqui (compDaCompra / vencimentoDaComp)? Mude lá também.
export const primeiroVencimentoParcelado = (cartao, dataCompra, ajuste = 0) =>
  vencimentoDaComp(cartao, compDaCompra(cartao, dataCompra, ajuste))

// ---------------------------------------------------------------- assinatura
// Assinatura que ainda conta em algum mês (A8.3, 19/11/2026): a ativa e a CANCELADA com data
// ("cancelei o serviço": as cobranças até cancelada_em continuam nas faturas/meses delas).
// Inativa SEM data = removida de tudo ("lancei errado", ou removida antes de 19/11/2026).
export const assinaturaConta = (a) => a?.ativo !== false || !!a?.cancelada_em

// Data da cobrança da assinatura no mês `comp`, ou null se ainda não valia (antes de
// cobrada_desde) ou já não valia (depois de cancelada_em).
export function cobrancaNoMes(assinatura, comp) {
  const data = dataNoMes(comp, Number(assinatura?.dia_cobranca) || 1)
  const desde = assinatura?.cobrada_desde || (assinatura?.criado_em ? `${compDe(assinatura.criado_em)}-01` : null)
  if (desde && data < desde) return null
  if (assinatura?.cancelada_em && data > assinatura.cancelada_em) return null
  return data
}

// Cobranças de uma assinatura de cartão que caem na fatura `comp`.
export function cobrancasNaFatura(assinatura, cartao, comp) {
  const out = []
  for (let k = -2; k <= 0; k++) {
    const d = cobrancaNoMes(assinatura, addMeses(comp, k))
    if (d && compDaCompra(cartao, d, 0) === comp) out.push(d)
  }
  return out
}

// ---------------------------------------------------------------- pagamentos
export function estaPaga(contasPagas, tipo, referenciaId, comp) {
  return (contasPagas || []).some((r) => r.tipo === tipo && r.referencia_id === referenciaId && r.competencia === comp && r.pago)
}

// ---------------------------------------------------------------- mover parcela (A2.9)
// Plano pra mover uma parcela de cartão ±N faturas: ela e as SEGUINTES da mesma compra
// (número maior) andam juntas, pra não juntar duas parcelas na mesma fatura. Parcela numa
// fatura já paga não sai dela e nenhuma entra numa fatura já paga ("paga" = fatura marcada
// como paga em contas_pagas — é o que vale pra parcela de cartão).
// `parcelas`: as da compra ({ id, numero, data_vencimento }). `diaBase`: dia do mês da 1ª
// parcela, pra não "encolher" o dia a cada mudança (31 → 28 → 28...).
// Devolve { ok, motivo, mudancas: [{ id, numero, de, para }], ficaram }.
export function planoMoverParcelas({ cartao, parcelas, parcelaId, delta, contasPagas, diaBase }) {
  const passo = Number(delta) || 0
  const alvo = (parcelas || []).find((p) => p.id === parcelaId)
  const vazio = (motivo) => ({ ok: false, motivo, mudancas: [], ficaram: 0 })
  if (!alvo || !passo) return vazio('nada')
  const paga = (iso) => estaPaga(contasPagas, 'fatura', cartao?.id, compDe(iso))
  const destino = (iso) => dataNoMes(addMeses(compDe(iso), passo), Number(diaBase) || diaDe(iso))
  if (paga(alvo.data_vencimento)) return vazio('fatura_paga')
  if (paga(destino(alvo.data_vencimento))) return vazio('destino_pago')
  const mudancas = []
  let ficaram = 0
  const seguintes = parcelas.filter((p) => Number(p.numero) >= Number(alvo.numero)).sort((a, b) => a.numero - b.numero)
  for (const p of seguintes) {
    const para = destino(p.data_vencimento)
    if (paga(p.data_vencimento) || paga(para)) { ficaram++; continue }
    if (para !== p.data_vencimento) mudancas.push({ id: p.id, numero: Number(p.numero), de: p.data_vencimento, para })
  }
  return { ok: true, motivo: null, mudancas, ficaram }
}

// ---------------------------------------------------------------- fatura
// Itens e total da fatura de `cartao` que vence na competência `comp`.
// status: 'paga' | 'aberta' (ainda recebe compras) | 'fechada' (no prazo) | 'atrasada'
export function faturaDoCartao(cartao, comp, dados, hoje = hojeBRT()) {
  const itens = []
  for (const g of dados.gastos || []) {
    if (g.cartao_id !== cartao.id) continue
    if (compDaCompra(cartao, g.data, g.fatura_ajuste) !== comp) continue
    itens.push({
      tipo: 'gasto', id: g.id, descricao: g.descricao, valor: num(g.valor), data: g.data,
      categoria: g.categoria, pessoaId: g.pessoa_id || null, pessoaNome: g.pessoa_nome || null,
      ajuste: Number(g.fatura_ajuste) || 0,
    })
  }
  for (const p of dados.parcelas || []) {
    if (p.cartao_id !== cartao.id || compDe(p.data_vencimento) !== comp) continue
    itens.push({
      tipo: 'parcela', id: p.id, descricao: p.descricao, valor: num(p.valor), data: p.data_vencimento,
      categoria: p.categoria, pessoaId: p.pessoa_id || null, pessoaNome: p.pessoa_nome || null,
      numero: p.numero, total: p.num_parcelas, paga: !!p.paga, parcelamentoId: p.parcelamento_id,
    })
  }
  for (const a of dados.assinaturas || []) {
    if (!assinaturaConta(a) || a.cartao_id !== cartao.id) continue
    for (const d of cobrancasNaFatura(a, cartao, comp)) {
      itens.push({ tipo: 'assinatura', id: a.id, descricao: a.nome, valor: num(a.valor), data: d, categoria: a.categoria || 'assinaturas' })
    }
  }
  itens.sort((x, y) => String(y.data).localeCompare(String(x.data)))
  const fechamento = fechamentoDaComp(cartao, comp)
  const vencimento = vencimentoDaComp(cartao, comp)
  const paga = estaPaga(dados.contasPagas, 'fatura', cartao.id, comp)
  const aindaAberta = regraAtual(cartao) ? hoje <= fechamento : hoje < fechamento
  const status = paga ? 'paga' : aindaAberta ? 'aberta' : hoje <= vencimento ? 'fechada' : 'atrasada'
  return {
    cartaoId: cartao.id, cartaoNome: cartao.nome, comp, fechamento, vencimento, paga, status, itens,
    total: soma(itens), totalTerceiros: soma(itens.filter((i) => i.pessoaId)),
  }
}

// Faturas "de agora" de um cartão: a que está a pagar (fechada e não paga — a mais
// antiga desde que o grupo começou a usar o app), a aberta e a próxima.
export function faturasDoCartaoAgora(cartao, dados, hoje = hojeBRT()) {
  const compAberta = compDaCompra(cartao, hoje, 0)
  const inicio = dados.inicioComp || addMeses(compAberta, -3)
  let aPagar = null
  for (let k = 3; k >= 1; k--) {
    const c = addMeses(compAberta, -k)
    if (c < inicio) continue
    const f = faturaDoCartao(cartao, c, dados, hoje)
    if (!f.paga && f.total > 0.004) { aPagar = f; break }
  }
  return {
    aPagar,
    aberta: faturaDoCartao(cartao, compAberta, dados, hoje),
    proxima: faturaDoCartao(cartao, addMeses(compAberta, 1), dados, hoje),
  }
}

// Quanto do limite está comprometido: tudo que ainda não foi pago (fatura a pagar,
// aberta e futuras — inclusive parcelas que ainda vão cair), sem contar cobranças de
// assinatura que ainda não aconteceram.
export function limiteComprometido(cartao, dados, hoje = hojeBRT()) {
  const { aPagar } = faturasDoCartaoAgora(cartao, dados, hoje)
  const compAberta = compDaCompra(cartao, hoje, 0)
  const ini = aPagar ? aPagar.comp : compAberta
  let ultimo = compAberta
  for (const p of dados.parcelas || []) if (p.cartao_id === cartao.id && compDe(p.data_vencimento) > ultimo) ultimo = compDe(p.data_vencimento)
  for (const g of dados.gastos || []) {
    if (g.cartao_id !== cartao.id) continue
    const c = compDaCompra(cartao, g.data, g.fatura_ajuste)
    if (c > ultimo) ultimo = c
  }
  let total = 0
  for (const c of compsEntre(ini, ultimo)) {
    const f = faturaDoCartao(cartao, c, dados, hoje)
    if (f.paga) continue
    total += soma(f.itens.filter((i) => i.tipo !== 'assinatura' || i.data <= hoje))
  }
  return arred(total)
}

// ---------------------------------------------------------------- orçamento
// 'auto' => o jeito que a categoria foi paga nos últimos 60 dias (maior parte no cartão?).
export function pagoComResolvido(orcamento, gastos, hoje = hojeBRT()) {
  if (orcamento.pago_com === 'cartao' || orcamento.pago_com === 'avista') return orcamento.pago_com
  const desde = addDias(hoje, -60)
  let cartao = 0, avista = 0
  for (const g of gastos || []) {
    if (g.categoria !== orcamento.categoria || g.pessoa_id || g.data < desde || g.data > hoje) continue
    if (g.cartao_id) cartao += num(g.valor); else avista += num(g.valor)
  }
  return cartao > avista ? 'cartao' : 'avista'
}

export function addDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

// ---------------------------------------------------------------- resumo do mês
// O coração do Início. `dados` = saída de carregarDadosMotor (motor-dados.js).
export function resumoMes(comp, dados, opcoes = {}) {
  const hoje = opcoes.hoje || hojeBRT()
  const ehAtual = compDe(hoje) === comp
  const cp = dados.contasPagas || []

  // ENTRADAS com data no mês (recorrentes já vêm lançadas, pendentes até receber)
  // + REEMBOLSOS PREVISTOS: o que outras pessoas vão te devolver pelo que saiu neste mês
  //   (uma linha por pessoa, a receber; some quando você marca "Receber de Fulano").
  const entradas = [
    ...(dados.entradas || []).filter((e) => compDe(e.data) === comp)
      .map((e) => ({ tipo: 'entrada', id: e.id, descricao: e.descricao, valor: num(e.valor), data: e.data, recebida: !!e.recebido, origem: e.origem || 'manual' })),
    ...reembolsosPrevistos(comp, dados).map((p) => ({
      tipo: 'entrada', id: `previsto:${p.pessoaId || p.pessoaNome}`,
      descricao: p.total < 0 ? `Pago por conta · ${p.pessoaNome}` : `A receber de ${p.pessoaNome}`,
      valor: p.total, data: p.data, recebida: false, origem: 'reembolso_previsto',
      pessoaId: p.pessoaId, pessoaNome: p.pessoaNome, qtd: p.itens.length, itens: p.itens,
    })),
  ]

  // FATURAS que vencem no mês
  const faturas = (dados.cartoes || [])
    .map((c) => faturaDoCartao(c, comp, dados, hoje))
    .filter((f) => f.total > 0.004)
    .map((f) => ({ ...f, tipo: 'fatura', id: f.cartaoId, descricao: `Fatura ${f.cartaoNome}`, valor: f.total, data: f.vencimento }))

  // CONTAS FIXAS (valor real lançado no mês, senão o previsto)
  const fixas = (dados.fixas || [])
    .filter((f) => f.ativo !== false && (!f.criado_em || compDe(f.criado_em) <= comp))
    .map((f) => {
      const l = (dados.fixasLanc || []).find((x) => x.conta_fixa_id === f.id && x.competencia === comp)
      return {
        tipo: 'fixa', id: f.id, descricao: f.nome, categoria: f.categoria,
        valor: l?.valor_real != null ? num(l.valor_real) : num(f.valor), paga: !!l?.pago,
        data: f.dia_vencimento ? dataNoMes(comp, f.dia_vencimento) : null, previsto: num(f.valor), temReal: l?.valor_real != null,
      }
    })

  // PARCELAS sem cartão (carnê, boleto, empréstimo) que vencem no mês
  const parcelasAvulsas = (dados.parcelas || [])
    .filter((p) => !p.cartao_id && compDe(p.data_vencimento) === comp)
    .map((p) => ({ tipo: 'parcela', id: p.id, descricao: p.descricao, valor: num(p.valor), data: p.data_vencimento, paga: !!p.paga, categoria: p.categoria, pessoaId: p.pessoa_id || null, numero: p.numero, total: p.num_parcelas }))

  // ASSINATURAS sem cartão (cobradas no mês)
  const assinaturasAvulsas = []
  for (const a of dados.assinaturas || []) {
    if (!assinaturaConta(a) || a.cartao_id) continue
    const d = cobrancaNoMes(a, comp)
    if (!d) continue
    assinaturasAvulsas.push({ tipo: 'assinatura', id: a.id, descricao: a.nome, valor: num(a.valor), data: d, categoria: a.categoria || 'assinaturas', paga: estaPaga(cp, 'assinatura', a.id, comp) })
  }

  // À VISTA (pix, dinheiro, débito — e os antigos "cartão sem cartão") com data no mês
  const aVista = (dados.gastos || [])
    .filter((g) => !g.cartao_id && compDe(g.data) === comp)
    .map((g) => ({ tipo: 'avista', id: g.id, descricao: g.descricao, valor: num(g.valor), data: g.data, paga: g.data <= hoje, categoria: g.categoria, pessoaId: g.pessoa_id || null, semCartao: g.tipo_pagamento === 'cartao' }))

  // COFRINHOS: aporte (+) é dinheiro que sai da conta; saque (−) volta
  const cofrinhos = (dados.transferencias || []).filter((t) => compDe(t.data) === comp)
    .map((t) => ({ tipo: 'cofrinho', id: t.id, descricao: t.descricao || 'Cofrinho', valor: num(t.valor), data: t.data, paga: t.data <= hoje }))

  const saidas = [...faturas.map((f) => ({ ...f, paga: f.paga })), ...fixas, ...parcelasAvulsas, ...assinaturasAvulsas, ...aVista, ...cofrinhos]

  const entradasPrevistas = soma(entradas)
  const entradasRecebidas = soma(entradas.filter((e) => e.recebida))
  const totalSaidas = soma(saidas)
  const pago = soma(saidas.filter((s) => s.paga))
  const saldoDoMes = arred(entradasRecebidas - pago)
  const sobraDoMes = arred(entradasPrevistas - totalSaidas)
  const diasRestantes = ehAtual ? Math.max(1, diasNoMes(comp) - diaDe(hoje) + 1) : diasNoMes(comp)

  // MEU GASTO (consumo do mês, sem compras de outras pessoas) — categorias e orçamento
  const meuGasto = meuGastoDoMes(comp, dados)

  // Orçamento: "separando o orçamento" considera só o que é pago à vista; o do cartão
  // vira a fatura do mês seguinte (descontar agora tiraria o mesmo dinheiro 2x).
  const orcamento = (dados.orcamentos || []).map((o) => {
    const realizado = meuGasto.porCategoria[o.categoria]?.total || 0
    const pagoCom = pagoComResolvido(o, dados.gastos, hoje)
    return { categoria: o.categoria, teto: num(o.valor), realizado, falta: arred(Math.max(0, num(o.valor) - realizado)), pagoCom, pagoComEscolhido: o.pago_com || 'auto' }
  })
  const reservaAvista = arred(orcamento.filter((o) => o.pagoCom === 'avista').reduce((s, o) => s + o.falta, 0))
  const reservaCartao = arred(orcamento.filter((o) => o.pagoCom === 'cartao').reduce((s, o) => s + o.falta, 0))

  // Fatura do mês que vem (já lançada até agora)
  const proxComp = addMeses(comp, 1)
  const faturaMesQueVem = arred((dados.cartoes || []).reduce((s, c) => s + faturaDoCartao(c, proxComp, dados, hoje).total, 0))

  return {
    comp, hoje, ehAtual,
    entradas, faturas, fixas, parcelasAvulsas, assinaturasAvulsas, aVista, cofrinhos,
    entradasPrevistas, entradasRecebidas, aReceber: arred(entradasPrevistas - entradasRecebidas),
    totalSaidas, pago, aPagar: arred(totalSaidas - pago),
    saldoDoMes, sobraDoMes,
    quantoPossoGastar: sobraDoMes,
    diasRestantes, porDia: arred(Math.max(0, sobraDoMes) / diasRestantes),
    reservaAvista, livreSeparandoOrcamento: arred(sobraDoMes - reservaAvista),
    faturaMesQueVem, faturaMesQueVemEstimada: arred(faturaMesQueVem + reservaCartao),
    orcamento, meuGasto,
    terceirosNoMes: arred(
      faturas.reduce((s, f) => s + f.totalTerceiros, 0) +
      soma(aVista.filter((x) => x.pessoaId)) + soma(parcelasAvulsas.filter((x) => x.pessoaId))),
    reembolsosRecebidos: soma(entradas.filter((e) => e.origem === 'reembolso' && e.recebida)),
    semCartao: aVista.filter((x) => x.semCartao),
  }
}

// Contas que ficaram SEM PAGAR num mês (A8.13): faturas, contas fixas, parcelas sem cartão e
// assinaturas sem cartão ainda não marcadas como pagas. Base do "Em atraso" (Contas do mês) e da
// virada ("levar o saldo já descontando o que ficou sem pagar"). O dinheiro dessas contas ainda está
// no saldo do mês (saldoDoMes = recebido − pago); quem paga depois marca no mês de origem.
export function pendentesDoMes(comp, dados, opcoes = {}) {
  const r = resumoMes(comp, dados, opcoes)
  const item = (x, tipo) => ({ tipo, comp, id: x.id, descricao: x.descricao, valor: arred(x.valor), data: x.data || null })
  return [
    ...r.faturas.filter((f) => !f.paga).map((f) => ({ ...item(f, 'fatura'), cartaoNome: f.cartaoNome, itens: f.itens })),
    ...r.fixas.filter((f) => !f.paga && f.valor > 0.004).map((f) => ({ ...item(f, 'fixa'), previsto: f.previsto, temReal: f.temReal })),
    ...r.parcelasAvulsas.filter((p) => !p.paga && p.valor > 0.004).map((p) => ({ ...item(p, 'parcela'), numero: p.numero, total: p.total })),
    ...r.assinaturasAvulsas.filter((a) => !a.paga && a.valor > 0.004).map((a) => item(a, 'assinatura')),
  ].sort((a, b) => String(a.data || '9').localeCompare(String(b.data || '9')))
}

// Partes de outras pessoas (A8.6): "a receber" ligado a uma compra (gasto_id), a uma parcela
// de um parcelado (parcelamento_id + parcela_num) ou a uma conta fixa num mês (conta_fixa_id).
// Saem do SEU gasto; a fatura/o pagamento continuam com o total. "Pago por conta" (negativo)
// não entra aqui. `dados.partes` (motor-dados) traz as ligadas de uma janela maior; sem ela,
// usa dados.aReceber.
export function partesDeOutros(dados) {
  const gasto = new Map(), parcela = new Map(), fixa = new Map(), assinatura = new Map()
  const somar = (m, k, v) => m.set(k, arred((m.get(k) || 0) + v))
  for (const m of dados.partes || dados.aReceber || []) {
    const v = num(m.valor)
    if (!(v > 0)) continue
    if (m.gasto_id) somar(gasto, m.gasto_id, v)
    else if (m.parcelamento_id && m.parcela_num) somar(parcela, `${m.parcelamento_id}|${m.parcela_num}`, v)
    else if (m.conta_fixa_id) somar(fixa, `${m.conta_fixa_id}|${compDe(m.data)}`, v)
    // assinatura dividida: a parte de cada mês fica no mês em que o dinheiro sai (fatura)
    else if (m.assinatura_id) somar(assinatura, `${m.assinatura_id}|${compDe(m.data)}`, v)
  }
  return { gasto, parcela, fixa, assinatura }
}

// Consumo do mês por categoria (data da compra / da parcela / da cobrança), sem o
// que é de outra pessoa. Base das categorias, do orçamento e do "para onde foi".
// Conta dividida (A8.6): só a SUA parte entra.
export function meuGastoDoMes(comp, dados) {
  const porCategoria = {}
  const itens = []
  const partes = partesDeOutros(dados)
  const minhaParte = (valor, parte) => arred(Math.max(0, num(valor) - (parte || 0)))
  const add = (cat, item) => {
    if (!(item.valor > 0.004)) return
    const c = cat || 'outros'
    porCategoria[c] ||= { total: 0, itens: [] }
    porCategoria[c].total = arred(porCategoria[c].total + num(item.valor))
    porCategoria[c].itens.push(item)
    itens.push({ ...item, categoria: c })
  }
  for (const g of dados.gastos || []) {
    if (g.pessoa_id || compDe(g.data) !== comp) continue
    add(g.categoria, { tipo: 'gasto', id: g.id, descricao: g.descricao, valor: minhaParte(g.valor, partes.gasto.get(g.id)), data: g.data, cartaoId: g.cartao_id || null })
  }
  for (const p of dados.parcelas || []) {
    if (p.pessoa_id || compDe(p.data_vencimento) !== comp) continue
    add(p.categoria, { tipo: 'parcela', id: p.id, descricao: p.descricao, valor: minhaParte(p.valor, partes.parcela.get(`${p.parcelamento_id}|${p.numero}`)), data: p.data_vencimento, numero: p.numero, total: p.num_parcelas, cartaoId: p.cartao_id || null })
  }
  for (const f of dados.fixas || []) {
    if (f.ativo === false || (f.criado_em && compDe(f.criado_em) > comp)) continue
    const l = (dados.fixasLanc || []).find((x) => x.conta_fixa_id === f.id && x.competencia === comp)
    add(f.categoria, { tipo: 'fixa', id: f.id, descricao: f.nome, valor: minhaParte(l?.valor_real != null ? l.valor_real : f.valor, partes.fixa.get(`${f.id}|${comp}`)), data: f.dia_vencimento ? dataNoMes(comp, f.dia_vencimento) : null })
  }
  for (const a of dados.assinaturas || []) {
    if (!assinaturaConta(a)) continue
    const d = cobrancaNoMes(a, comp)
    if (!d) continue
    const card = a.cartao_id ? (dados.cartoes || []).find((c) => c.id === a.cartao_id) : null
    const saida = card ? vencimentoDaComp(card, compDaCompra(card, d)) : d
    add(a.categoria || 'assinaturas', { tipo: 'assinatura', id: a.id, descricao: a.nome, valor: minhaParte(a.valor, partes.assinatura.get(`${a.id}|${compDe(saida)}`)), data: d, cartaoId: a.cartao_id || null })
  }
  return { porCategoria, itens, total: soma(itens) }
}

// ---------------------------------------------------------------- outras pessoas (a receber)
// Tudo que é de outra pessoa (compra à vista ou no cartão, parcela, valor lançado à mão),
// com o MÊS EM QUE O DINHEIRO SAI da sua conta — é nesse mês que o reembolso fica previsto
// (A1.14) e é por ele que o A Receber separa os meses (A1.13):
//   compra no cartão → mês da fatura (vencimento) · parcela → mês da parcela ·
//   pix/dinheiro/débito → data da compra · lançado à mão → a data dele.
// `origem` diz de onde veio (A1.15): cartão (qual), à vista (forma), parcelado sem cartão,
// conta fixa (a receber manual ligado a uma conta fixa), todo mês ou lançado à mão.
export function itensDeTerceiros(dados) {
  const cartaoPorId = new Map((dados.cartoes || []).map((c) => [c.id, c]))
  const out = []
  for (const g of dados.gastos || []) {
    if (!g.pessoa_id) continue
    const cartao = g.cartao_id ? cartaoPorId.get(g.cartao_id) : null
    const comp = cartao ? compDaCompra(cartao, g.data, g.fatura_ajuste) : compDe(g.data)
    out.push({
      tipo: 'gasto', id: g.id, pessoaId: g.pessoa_id, pessoaNome: g.pessoa_nome || null,
      descricao: g.descricao, valor: num(g.valor), data: g.data, comp,
      dataSaida: cartao ? vencimentoDaComp(cartao, comp) : g.data,
      recebido: g.reembolso_status === 'quitado', entradaId: g.reembolso_entrada_id || null,
      origem: cartao ? { tipo: 'cartao', cartaoId: cartao.id, cartaoNome: cartao.nome } : { tipo: 'avista', forma: g.tipo_pagamento || null },
    })
  }
  for (const p of dados.parcelas || []) {
    if (!p.pessoa_id) continue
    const cartao = p.cartao_id ? cartaoPorId.get(p.cartao_id) : null
    const comp = compDe(p.data_vencimento)
    out.push({
      tipo: 'parcela', id: p.id, pessoaId: p.pessoa_id, pessoaNome: p.pessoa_nome || null,
      descricao: p.descricao, valor: num(p.valor), data: p.data_vencimento, comp,
      dataSaida: cartao ? vencimentoDaComp(cartao, comp) : p.data_vencimento,
      recebido: !!p.recebido, entradaId: p.reembolso_entrada_id || null, numero: p.numero, deTotal: p.num_parcelas,
      origem: cartao ? { tipo: 'cartao', cartaoId: cartao.id, cartaoNome: cartao.nome } : { tipo: 'parcelado' },
    })
  }
  for (const m of dados.aReceber || []) {
    out.push({
      tipo: 'manual', id: m.id, pessoaId: m.pessoa_id, pessoaNome: m.pessoa_nome || null,
      descricao: m.descricao, valor: num(m.valor), data: m.data, comp: compDe(m.data), dataSaida: m.data,
      recebido: !!m.recebido, entradaId: m.entrada_id || null, recorrente: !!m.recorrente, serieId: m.serie_id || null,
      numero: m.parcela_num || null, deTotal: m.parcela_total || null, // a receber parcelado (A8.17)
      porConta: !!m.por_conta, gastoId: m.gasto_id || null, parcelamentoId: m.parcelamento_id || null,
      origem: m.por_conta ? { tipo: 'por_conta' } // A8.4: pagou só uma parte
        : m.gasto_id || m.parcelamento_id || m.assinatura_id ? { tipo: 'dividida' } // A8.6: parte de uma conta dividida
        : m.conta_fixa_id
          ? { tipo: 'conta_fixa', contaFixaId: m.conta_fixa_id, contaFixaNome: m.conta_fixa_nome || null }
          : { tipo: m.recorrente ? 'todo_mes' : 'manual' },
    })
  }
  return out
}

// Reembolsos previstos do mês `comp` (A1.14): o que outras pessoas ainda vão te devolver
// pelo que saiu da sua conta neste mês — uma linha por pessoa (maior primeiro).
export function reembolsosPrevistos(comp, dados) {
  const porPessoa = new Map()
  for (const i of itensDeTerceiros(dados)) {
    // "Pago por conta" (negativo, A8.4) abate o que a pessoa deve no mês em que pagou
    if (i.recebido || i.comp !== comp || Math.abs(i.valor) <= 0.004) continue
    const k = i.pessoaId || i.pessoaNome || '?'
    if (!porPessoa.has(k)) porPessoa.set(k, { pessoaId: i.pessoaId, pessoaNome: i.pessoaNome || 'Alguém', itens: [], total: 0, data: i.dataSaida })
    const p = porPessoa.get(k)
    p.itens.push(i)
    p.total = arred(p.total + i.valor)
    if (i.dataSaida > p.data) p.data = i.dataSaida
  }
  return [...porPessoa.values()].filter((p) => Math.abs(p.total) > 0.004).sort((a, b) => b.total - a.total)
}

// ---------------------------------------------------------------- contas a vencer
// O que vence entre `ini` e `fim` (datas 'YYYY-MM-DD', inclusive) e ainda não foi pago:
// faturas dos cartões ativos, contas fixas, parcelas sem cartão e assinaturas sem
// cartão — a mesma lista de "contas a vencer" do Início e dos alertas do app. Base dos
// avisos de vencimento por e-mail e push (A2.10). Vale pra janela que cruza o mês
// (ex.: hoje 30/11, amanhã 01/12).
export function contasAVencer(dados, ini, fim, opcoes = {}) {
  const hoje = opcoes.hoje || hojeBRT()
  const ativo = new Set((dados.cartoes || []).filter((c) => c.ativo !== false).map((c) => c.id))
  const out = []
  for (const comp of compsEntre(compDe(ini), compDe(fim))) {
    const r = resumoMes(comp, dados, { hoje })
    for (const f of r.faturas) {
      if (!ativo.has(f.cartaoId)) continue
      out.push({ tipo: 'fatura', id: f.cartaoId, nome: `Fatura ${f.cartaoNome}`, valor: f.total, venc: f.vencimento, paga: f.paga, status: f.status })
    }
    for (const x of r.fixas) {
      if (x.data) out.push({ tipo: 'conta_fixa', id: x.id, nome: x.descricao, valor: x.valor, venc: x.data, paga: x.paga })
    }
    for (const x of r.parcelasAvulsas) {
      out.push({ tipo: 'parcela', id: x.id, nome: x.descricao || 'Parcela', valor: x.valor, venc: x.data, paga: x.paga, numero: x.numero, deTotal: x.total })
    }
    for (const x of r.assinaturasAvulsas) {
      out.push({ tipo: 'assinatura', id: x.id, nome: x.descricao, valor: x.valor, venc: x.data, paga: x.paga })
    }
  }
  return out
    .filter((i) => !i.paga && i.valor > 0.004 && i.venc >= ini && i.venc <= fim)
    .sort((a, b) => a.venc.localeCompare(b.venc) || String(a.nome).localeCompare(String(b.nome)))
}
