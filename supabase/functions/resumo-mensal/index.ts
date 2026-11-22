// resumo-mensal — e-mail com o resumo do mês (prompt 7, etapa 4). Chamado pelo cron
// mensal (hopefin-resumo-mensal, dia 1) ou pelo painel do dono (/admin).
//
// Desde a Onda 1 (A1.9, 18/11/2026) os números vêm do MOTOR ÚNICO (_shared/motor.js),
// os mesmos do Início do app: saldo do mês (o que entrou − o que foi pago), sobra do
// mês (entradas − tudo que venceu), faturas que venceram no mês e "para onde foi"
// (meu gasto por categoria, sem compras de outras pessoas). Quem recebe continua vindo
// da RPC resumo_mensal (titular de grupo em teste/ativo/cortesia, com e-mail e com
// atividade no mês) — os totais antigos da RPC não são mais usados.
//
// Ações (JSON no corpo):
//   {} ou { comp?, so_grupo? }            cron: resumo do MÊS ANTERIOR (fuso de São Paulo).
//                                         Com a pausa ligada, só registra como 'retido'.
//   { acao: 'enviar_retidos', so_grupo? }  painel: envia os retidos com os números de agora.
//   { acao: 'teste', so_grupo, usuario, comp? }
//                                         dono testando antes de liberar: e-mail "[Teste]" pro
//                                         e-mail DESSA pessoa e push só pros aparelhos dela.
//                                         NÃO grava no email_log (não ocupa o envio do dia 1º).
//   { acao: 'previa', so_grupo, comp?, hoje? }
//                                         NÃO envia e NÃO grava nada: devolve assunto,
//                                         números e HTML (conferência com o conciliar.mjs).
// 1 e-mail por grupo por mês (email_log, tipo='resumo_mensal', ref=comp).
// Autorização: x-cron-secret == CRON_SECRET (deploy --no-verify-jwt) ou JWT de um admin.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { layoutEmail, enviarEmail, esc } from '../_shared/email.ts'
import { resumoMes, hojeBRT, addMeses, compDe } from '../_shared/motor.js'
import { carregarDadosMotor } from '../_shared/motor-dados.js'
import { nivelDaSessao } from '../_shared/sessao.ts'
import { pushParaGrupo, aparelhosDoGrupo } from '../_shared/push.ts'
import { lerModelo, montarModelo, type Modelo } from '../_shared/modelos.ts'
import { varsBase } from '../_shared/modelo.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cron-secret, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const diaMes = (iso: string) => { const [, m, d] = String(iso).split('-'); return `${d}/${m}` }

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const nomeMes = (comp: string) => MESES[Number(comp.split('-')[1]) - 1] || comp
const assuntoDe = (comp: string) => `Seu resumo de ${nomeMes(comp)} chegou`

const CAT: Record<string, string> = {
  mercado: 'Mercado', alimentacao: 'Alimentação', transporte: 'Transporte', lazer: 'Lazer',
  saude: 'Saúde', moradia: 'Moradia', educacao: 'Educação', contas: 'Contas',
  vestuario: 'Vestuário', assinaturas: 'Assinaturas', pet: 'Pet', filhos: 'Filhos', outros: 'Outros',
}
const labelCat = (s: string) => CAT[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Outros')

const COR = { ink: '#0f172a', sub: '#64748b', borda: '#eef1f5', verde: '#047857', vermelho: '#b91c1c', ambar: '#92400e' }

type Grupo = { grupo_id: string; titular_id: string | null; email: string | null; nome: string | null }

type Numeros = {
  comp: string; hoje: string
  entrou: number; entradasPrevistas: number; aReceber: number
  pago: number; totalSaidas: number; aPagar: number
  saldoDoMes: number; sobraDoMes: number
  faturas: { cartao: string; total: number; vencimento: string; paga: boolean }[]
  categorias: { nome: string; total: number }[]
  meuGasto: number
  viradaPendente: boolean
}

// Os números do mês pelo motor único — a mesma conta do Início do app.
async function numerosDoMes(grupoId: string, comp: string, hoje: string): Promise<Numeros> {
  const [dados, virada] = await Promise.all([
    carregarDadosMotor(admin, grupoId, { compIni: comp, compFim: addMeses(comp, 1) }),
    admin.from('viradas_mes').select('id').eq('grupo_id', grupoId).eq('competencia', comp).maybeSingle(),
  ])
  const r = resumoMes(comp, dados, { hoje })
  const porCategoria = r.meuGasto.porCategoria as Record<string, { total: number }>
  const categorias = Object.entries(porCategoria)
    .map(([nome, o]) => ({ nome, total: Number(o.total) || 0 }))
    .filter((c) => c.total > 0.004)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)
  const comecou = !dados.inicioComp || dados.inicioComp <= comp
  return {
    comp, hoje,
    entrou: r.entradasRecebidas, entradasPrevistas: r.entradasPrevistas, aReceber: r.aReceber,
    pago: r.pago, totalSaidas: r.totalSaidas, aPagar: r.aPagar,
    saldoDoMes: r.saldoDoMes, sobraDoMes: r.sobraDoMes,
    faturas: r.faturas
      .map((f: { cartaoNome: string; total: number; vencimento: string; paga: boolean }) =>
        ({ cartao: String(f.cartaoNome || '').trim(), total: f.total, vencimento: f.vencimento, paga: f.paga }))
      .sort((a: { vencimento: string; cartao: string }, b: { vencimento: string; cartao: string }) =>
        a.vencimento.localeCompare(b.vencimento) || a.cartao.localeCompare(b.cartao)),
    categorias,
    meuGasto: r.meuGasto.total,
    // Mesma regra do Início: o mês que acabou de fechar tem saldo e ninguém decidiu o que fazer com ele.
    viradaPendente: comecou && addMeses(compDe(hoje), -1) === comp && !virada.data && Math.abs(r.saldoDoMes) > 0.004,
  }
}

const tabela = (linhas: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${linhas}</table>`

const linha = (rotulo: string, valor: string, cor: string, forte = false) =>
  `<tr><td style="padding:7px 0;border-bottom:1px solid ${COR.borda};font-size:15px;color:${COR.ink};${forte ? 'font-weight:700;' : ''}">${rotulo}</td>` +
  `<td style="padding:7px 0;border-bottom:1px solid ${COR.borda};font-size:15px;color:${cor};text-align:right;font-weight:700;white-space:nowrap;">${valor}</td></tr>`

const linhaLeve = (rotulo: string, valor: string) =>
  `<tr><td style="padding:5px 0;font-size:14px;color:${COR.ink};">${rotulo}</td>` +
  `<td style="padding:5px 0;font-size:14px;color:${COR.sub};text-align:right;white-space:nowrap;">${valor}</td></tr>`

const titulo = (texto: string) => `<br><div style="font-size:14px;color:${COR.sub};margin-bottom:4px;">${texto}</div>`

function corpoResumo(n: Numeros): string {
  const mes = nomeMes(n.comp)
  const prox = nomeMes(addMeses(n.comp, 1))
  const cor = (v: number) => (v >= 0 ? COR.verde : COR.vermelho)

  let html = `Fechou <strong>${mes}</strong>! Aqui está o resumo das finanças da sua família, com os mesmos números do Início do app:<br><br>`
  html += tabela(
    linha('Entrou na conta', brl(n.entrou), COR.verde) +
    linha('Pago no mês', brl(n.pago), COR.vermelho) +
    linha('Saldo do mês', brl(n.saldoDoMes), cor(n.saldoDoMes), true) +
    linha('Sobra do mês', brl(n.sobraDoMes), cor(n.sobraDoMes), true),
  )
  html += `<div style="font-size:12px;color:${COR.sub};margin-top:6px;line-height:1.5;">` +
    `Saldo do mês = o que entrou na conta − o que foi pago no mês. ` +
    `Sobra do mês = todas as entradas do mês − tudo que venceu no mês (faturas, contas, parcelas, assinaturas e compras à vista).</div>`

  const pend: string[] = []
  if (n.aReceber > 0.004) pend.push(`${brl(n.aReceber)} a receber`)
  if (n.aPagar > 0.004) pend.push(`${brl(n.aPagar)} a pagar`)
  if (pend.length) {
    html += `<div style="font-size:13px;color:${COR.ambar};margin-top:10px;line-height:1.5;">` +
      `Ainda tem ${pend.join(' e ')} marcados em ${mes}. Se já aconteceu, marque no app — o saldo muda.</div>`
  }

  if (n.faturas.length) {
    html += titulo(`Faturas que venceram em ${mes}:`)
    html += tabela(n.faturas.map((f) =>
      linhaLeve(`${esc(f.cartao)} <span style="color:${COR.sub};font-size:13px;">· ${diaMes(f.vencimento)} · ${f.paga ? 'paga' : 'não marcada como paga'}</span>`, brl(f.total)),
    ).join(''))
  }

  if (n.categorias.length) {
    html += titulo('Para onde foi o dinheiro (sem as compras de outras pessoas):')
    html += tabela(n.categorias.map((c) => linhaLeve(esc(labelCat(c.nome)), brl(c.total))).join(''))
  }

  if (n.viradaPendente) {
    html += `<br><div style="font-size:14px;color:${COR.ink};line-height:1.5;">` +
      `No Início do app você decide o que fazer com o saldo de ${mes}: levar pra ${prox} ou guardar num cofrinho.</div>`
  }
  return html
}

// Texto do Painel (E-mails automáticos, 0090), lido uma vez por chamada. Sem ele, o texto de sempre.
let modeloCache: Promise<Modelo | null> | null = null
const modeloResumo = () => (modeloCache ??= lerModelo(admin, 'resumo_mensal'))

async function montarEmail(g: Grupo, n: Numeros) {
  const mod = await modeloResumo()
  if (mod && mod.assunto && mod.corpo) {
    try {
      const cta = n.viradaPendente ? { texto: 'Decidir no HopeFin', url: 'https://app.hopefin.com.br/' } : undefined
      return await montarModelo(mod, {
        ...varsBase(g.nome), mes: nomeMes(n.comp), saldo: brl(n.saldoDoMes), sobra: brl(n.sobraDoMes),
        numeros: { html: corpoResumo(n) },
      }, { cta })
    } catch (e) { console.error('modelo do resumo falhou', (e as Error).message) }
  }
  const assunto = assuntoDe(n.comp)
  const ola = g.nome ? `Oi, ${esc(String(g.nome).split(' ')[0])}! ` : 'Oi! '
  const html = layoutEmail({
    titulo: assunto,
    corpoHtml: ola + corpoResumo(n),
    preheader: `Saldo do mês ${brl(n.saldoDoMes)} · sobra ${brl(n.sobraDoMes)}`,
    cta: n.viradaPendente
      ? { texto: 'Decidir no HopeFin', url: 'https://app.hopefin.com.br/' }
      : { texto: 'Ver o mês no HopeFin', url: 'https://app.hopefin.com.br/fechamento' },
  })
  return { assunto, html }
}

// O dono também pode chamar pelo painel (JWT de um admin) pra enviar os retidos.
async function ehAdmin(req: Request): Promise<boolean> {
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  if (!jwt) return false
  const { data: u } = await admin.auth.getUser(jwt)
  if (!u?.user) return false
  // Envio manual pelo painel: só com o código do celular (sessão aal2) — L37, 19/11/2026.
  if (nivelDaSessao(jwt) !== 'aal2') return false
  const { data: p } = await admin.from('usuarios').select('is_admin').eq('id', u.user.id).maybeSingle()
  return !!p?.is_admin
}

// Quem recebe o resumo de `comp` (a RPC filtra plano válido, e-mail e atividade no mês).
// Push "Seu resumo de <mês> chegou" (A8.14): vai junto com o e-mail (mesma pausa do painel,
// 1 por grupo por mês porque o e-mail já é 1 por mês) pros aparelhos de quem está no grupo.
// Respeita "Resumo do mês" em Notificações (preferencias_notificacao.alertar_resumo).
const pushDoResumo = (comp: string) => ({
  title: `Seu resumo de ${nomeMes(comp)} chegou 📊`,
  body: 'Veja quanto entrou, saiu e sobrou no mês. Toque para abrir.',
  url: `/fechamento?mes=${comp}`,
  tag: `resumo-${comp}`,
})
async function querPushDoResumo(grupoId: string): Promise<boolean> {
  const { data } = await admin.from('preferencias_notificacao').select('alertar_resumo').eq('grupo_id', grupoId).maybeSingle()
  return data?.alertar_resumo !== false
}
async function avisarNoCelular(grupoId: string, comp: string): Promise<number> {
  try {
    if (!(await querPushDoResumo(grupoId))) return 0
    const r = await pushParaGrupo(admin, grupoId, pushDoResumo(comp))
    return r.enviados
  } catch (e) {
    console.error('push do resumo falhou', grupoId, (e as Error).message)
    return 0
  }
}

async function gruposDoMes(comp: string): Promise<Grupo[]> {
  const { data, error } = await admin.rpc('resumo_mensal', { p_comp: comp })
  if (error) throw new Error(error.message)
  return ((data || []) as Grupo[]).map((g) => ({ grupo_id: g.grupo_id, titular_id: g.titular_id, email: g.email, nome: g.nome }))
}

// Envia os resumos que ficaram RETIDOS (pausa ligada). Chamado pelo painel.
async function enviarRetidos(soGrupo: string | null) {
  let q = admin.from('email_log').select('id, grupo_id, ref').eq('tipo', 'resumo_mensal').eq('status', 'retido')
  if (soGrupo) q = q.eq('grupo_id', soGrupo)
  const { data: retidos, error } = await q
  if (error) return { erro: error.message }
  const hoje = hojeBRT()
  const out = { enviados: 0, push: 0, sem_atividade: 0, erros: 0, detalhes: [] as unknown[] }
  const cache: Record<string, Grupo[]> = {}
  for (const r of retidos || []) {
    const comp = r.ref as string
    cache[comp] ||= await gruposDoMes(comp)
    const g = cache[comp].find((x) => x.grupo_id === r.grupo_id)
    if (!g || !g.email) {
      await admin.from('email_log').update({ status: 'pulado', erro: g ? 'sem e-mail' : 'sem atividade no mês' }).eq('id', r.id)
      out.sem_atividade++; continue
    }
    let email: { assunto: string; html: string }
    try {
      email = await montarEmail(g, await numerosDoMes(g.grupo_id, comp, hoje))
    } catch (e) {
      await admin.from('email_log').update({ erro: `motor: ${(e as Error).message}` }).eq('id', r.id)
      out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: (e as Error).message }); continue
    }
    await admin.from('email_log').update({ status: 'enviando', destino: g.email, assunto: email.assunto }).eq('id', r.id)
    const env = await enviarEmail({ para: g.email, assunto: email.assunto, html: email.html, etiqueta: 'resumo_mensal' })
    if (env.ok) {
      await admin.from('email_log').update({ status: 'enviado', resend_id: env.id, erro: null }).eq('id', r.id)
      out.enviados++; out.detalhes.push({ grupo: g.grupo_id, comp })
      out.push += await avisarNoCelular(g.grupo_id, comp)
    } else {
      await admin.from('email_log').update({ status: 'retido', erro: String(env.erro || 'falha no envio') }).eq('id', r.id)
      out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: env.erro })
    }
  }
  return out
}

// Prévia: monta o e-mail de um grupo sem enviar e sem gravar nada.
async function previa(soGrupo: string | null, comp: string, hoje: string) {
  const lista = await gruposDoMes(comp)
  if (!soGrupo) return { comp, hoje, grupos_que_receberiam: lista.length, aviso: 'informe so_grupo para ver o e-mail' }
  const achado = lista.find((g) => g.grupo_id === soGrupo)
  const g: Grupo = achado || { grupo_id: soGrupo, titular_id: null, email: null, nome: null }
  const numeros = await numerosDoMes(soGrupo, comp, hoje)
  const { assunto, html } = await montarEmail(g, numeros)
  // O push que iria junto (não envia nada): texto, aparelhos e se a pessoa desligou.
  const push = { ...pushDoResumo(comp), aparelhos: (await aparelhosDoGrupo(admin, soGrupo)).length, ligado: await querPushDoResumo(soGrupo) }
  return { comp, hoje, recebe: !!achado?.email, destino: achado?.email || null, assunto, numeros, push, html }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  const viaCron = !!CRON_SECRET && req.headers.get('x-cron-secret') === CRON_SECRET
  const viaAdmin = !viaCron && await ehAdmin(req)
  if (!viaCron && !viaAdmin) return json({ erro: 'não autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const soGrupo = typeof body?.so_grupo === 'string' ? body.so_grupo : null

  if (body?.acao === 'enviar_retidos') return json(await enviarRetidos(soGrupo))

  const comp = /^\d{4}-\d{2}$/.test(body?.comp || '') ? body.comp : addMeses(compDe(hojeBRT()), -1)

  if (body?.acao === 'teste') {
    const usuario = typeof body?.usuario === 'string' ? body.usuario : null
    if (!soGrupo || !usuario) return json({ erro: 'informe so_grupo e usuario' }, 400)
    try {
      const { data: membro } = await admin.from('usuarios').select('id, nome').eq('id', usuario).eq('grupo_id', soGrupo).maybeSingle()
      if (!membro) return json({ erro: 'usuario não é do grupo' }, 400)
      const { data: u } = await admin.auth.admin.getUserById(usuario)
      const email = u?.user?.email
      if (!email) return json({ erro: 'usuario sem e-mail' }, 400)
      const g: Grupo = { grupo_id: soGrupo, titular_id: usuario, email, nome: membro.nome || null }
      const montado = await montarEmail(g, await numerosDoMes(soGrupo, comp, hojeBRT()))
      const env = await enviarEmail({ para: email, assunto: `[Teste] ${montado.assunto}`, html: montado.html })
      const push = await pushParaGrupo(admin, soGrupo, { ...pushDoResumo(comp), title: `[Teste] ${pushDoResumo(comp).title}` }, usuario)
      return json({ comp, email: env.ok ? 'enviado' : `falhou: ${env.erro}`, push })
    } catch (e) { return json({ erro: (e as Error).message }, 500) }
  }

  if (body?.acao === 'previa') {
    const hoje = /^\d{4}-\d{2}-\d{2}$/.test(body?.hoje || '') ? body.hoje : hojeBRT()
    try { return json(await previa(soGrupo, comp, hoje)) } catch (e) { return json({ erro: (e as Error).message }, 500) }
  }

  // Pausa (A1.9): enquanto ligada, registra o envio como RETIDO e não manda nada.
  const { data: cfg } = await admin.from('admin_config').select('resumo_mensal_pausado').eq('id', 1).maybeSingle()
  const pausado = !!cfg?.resumo_mensal_pausado
  const modDesl = await modeloResumo()
  if (modDesl && modDesl.assunto && modDesl.corpo && !modDesl.ligado) return json({ ok: true, comp, desligado: true })

  let grupos: Grupo[]
  try { grupos = await gruposDoMes(comp) } catch (e) { return json({ erro: (e as Error).message }, 500) }

  const hoje = hojeBRT()
  const lista = grupos.filter((g) => !soGrupo || g.grupo_id === soGrupo)
  const out = { comp, pausado, verificados: lista.length, enviados: 0, push: 0, retidos: 0, pulados: 0, erros: 0, detalhes: [] as unknown[] }

  for (const g of lista) {
    if (!g.email) { out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: 'sem e-mail' }); continue }
    const assunto = assuntoDe(comp)
    const ins = await admin.from('email_log')
      .insert({ grupo_id: g.grupo_id, titular_id: g.titular_id, tipo: 'resumo_mensal', ref: comp, destino: g.email, assunto, status: pausado ? 'retido' : 'enviando' })
      .select('id').maybeSingle()
    if (ins.error) {
      if ((ins.error as { code?: string }).code === '23505') { out.pulados++; continue }
      out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: ins.error.message }); continue
    }
    if (pausado) { out.retidos++; continue }

    let email: { assunto: string; html: string }
    try {
      email = await montarEmail(g, await numerosDoMes(g.grupo_id, comp, hoje))
    } catch (e) {
      await admin.from('email_log').delete().eq('id', ins.data!.id)
      out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: `motor: ${(e as Error).message}` }); continue
    }
    const env = await enviarEmail({ para: g.email, assunto: email.assunto, html: email.html, etiqueta: 'resumo_mensal' })
    if (env.ok) {
      await admin.from('email_log').update({ status: 'enviado', resend_id: env.id }).eq('id', ins.data!.id)
      out.enviados++; out.detalhes.push({ grupo: g.grupo_id, para: g.email, id: env.id })
      out.push += await avisarNoCelular(g.grupo_id, comp)
    } else {
      await admin.from('email_log').delete().eq('id', ins.data!.id)
      out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: env.erro })
    }
  }

  return json(out)
})
