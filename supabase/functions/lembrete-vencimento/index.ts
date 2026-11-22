// lembrete-vencimento — avisa o titular das contas a vencer (prompt 7, etapa 3).
// Chamada pelo cron diário (hopefin-vencimentos, 08:30 BRT). Exige x-cron-secret ==
// CRON_SECRET (deploy --no-verify-jwt).
//
// Desde a Onda 1 (A2.10, 18/11/2026) a lista de contas vem do MOTOR ÚNICO
// (_shared/motor.js → contasAVencer): faturas dos cartões (as maiores contas do mês),
// contas fixas, parcelas sem cartão e assinaturas sem cartão que vencem HOJE ou AMANHÃ
// e ainda não foram pagas — a mesma lista de "contas a vencer" do Início. Antes vinha
// da RPC vencimentos_a_vencer (migração 0024), que não tinha as faturas.
//
// Quem recebe: titular de grupo em teste/ativo/cortesia, com e-mail, que não desligou
// "Contas vencidas e a vencer" (preferencias_notificacao.alertar_vencimentos).
// 1 e-mail por grupo por dia (email_log, tipo='vencimentos', ref = hoje em BRT).
//
// Corpo opcional (JSON): { so_grupo?: uuid, dias?: int, previa?: boolean, hoje?: 'AAAA-MM-DD' }
//   previa: true → NÃO envia e NÃO grava nada; devolve o que seria enviado (com o
//   e-mail completo só para so_grupo; sem so_grupo, só as contagens). `hoje` só vale
//   na prévia (simula outro dia).
// Segredos: CRON_SECRET; SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY injetados.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { layoutEmail, enviarEmail, esc } from '../_shared/email.ts'
import { lerModelo, montarModelo, type Modelo } from '../_shared/modelos.ts'
import { varsBase } from '../_shared/modelo.js'
import { contasAVencer, hojeBRT, addDias, compDe } from '../_shared/motor.js'
import { carregarDadosMotor } from '../_shared/motor-dados.js'

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
const diaMes = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }

type Destino = { grupo_id: string; titular_id: string; email: string; nome: string | null }
type Item = { tipo: string; nome: string; valor: number; venc: string; numero?: number; deTotal?: number }

// Titulares que recebem o aviso (mesma regra da antiga RPC vencimentos_a_vencer).
async function destinatarios(): Promise<Destino[]> {
  const [subs, prefs] = await Promise.all([
    admin.from('subscriptions').select('grupo_id, titular_id, status, is_cortesia'),
    admin.from('preferencias_notificacao').select('grupo_id, alertar_vencimentos'),
  ])
  if (subs.error) throw new Error(subs.error.message)
  if (prefs.error) throw new Error(prefs.error.message)
  const desligado = new Set((prefs.data || []).filter((p) => p.alertar_vencimentos === false).map((p) => p.grupo_id))
  const ativos = (subs.data || []).filter((s) =>
    s.titular_id && (s.status === 'trial' || s.status === 'active' || s.is_cortesia) && !desligado.has(s.grupo_id))
  if (!ativos.length) return []
  const { data: us, error } = await admin.from('usuarios').select('id, email, nome').in('id', ativos.map((s) => s.titular_id))
  if (error) throw new Error(error.message)
  const porId = new Map((us || []).map((u) => [u.id, u]))
  const out: Destino[] = []
  for (const s of ativos) {
    const u = porId.get(s.titular_id)
    if (u?.email) out.push({ grupo_id: s.grupo_id, titular_id: s.titular_id, email: u.email, nome: u.nome })
  }
  return out
}

// Contas do grupo que vencem de `hoje` até `ate` e não foram pagas (motor único).
async function contasDoGrupo(grupoId: string, hoje: string, ate: string): Promise<Item[]> {
  const dados = await carregarDadosMotor(admin, grupoId, { compIni: compDe(hoje), compFim: compDe(ate) })
  return contasAVencer(dados, hoje, ate, { hoje }) as Item[]
}

function nomeItem(i: Item): string {
  if (i.tipo === 'parcela' && i.numero && i.deTotal) return `${i.nome} (${i.numero}/${i.deTotal})`
  return i.nome
}

function corpoVencimentos(hoje: string, itens: Item[], total: number): string {
  return `Uma lembrança rápida das contas da sua família que estão chegando:<br><br>${tabelaVencimentos(hoje, itens, total)}`
}

function tabelaVencimentos(hoje: string, itens: Item[], total: number): string {
  const amanha = addDias(hoje, 1)
  const linhas = itens.map((i) => {
    const quando = i.venc === hoje ? 'vence hoje' : i.venc === amanha ? 'vence amanhã' : `vence ${diaMes(i.venc)}`
    return `<tr>
      <td style="padding:7px 0;border-bottom:1px solid #eef1f5;font-size:15px;color:#0f172a;">${esc(nomeItem(i))}
        <span style="color:#64748b;font-size:13px;"> · ${quando}</span></td>
      <td style="padding:7px 0;border-bottom:1px solid #eef1f5;font-size:15px;color:#0f172a;text-align:right;white-space:nowrap;">${brl(i.valor)}</td>
    </tr>`
  }).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${linhas}
      <tr><td style="padding:10px 0 0;font-size:15px;color:#0f172a;font-weight:700;">Total</td>
        <td style="padding:10px 0 0;font-size:15px;color:#0f172a;font-weight:700;text-align:right;">${brl(total)}</td></tr>
    </table>`
}

async function montarEmail(g: Destino, hoje: string, itens: Item[], mod: Modelo | null) {
  const qtd = itens.length
  const total = Math.round(itens.reduce((s, i) => s + Number(i.valor), 0) * 100) / 100
  // Texto do Painel (E-mails automáticos, 0090); sem ele, o de sempre.
  if (mod && mod.assunto && mod.corpo) {
    try {
      const m = await montarModelo(mod, {
        ...varsBase(g.nome), qtd_contas: qtd === 1 ? '1 conta' : `${qtd} contas`, total: brl(total),
        lista_contas: { html: tabelaVencimentos(hoje, itens, total) },
      })
      return { ...m, qtd, total }
    } catch (e) { console.error('modelo de vencimentos falhou', (e as Error).message) }
  }
  const assunto = qtd === 1 ? 'Você tem 1 conta a vencer' : `Você tem ${qtd} contas a vencer`
  const ola = g.nome ? `Oi, ${esc(String(g.nome).split(' ')[0])}! ` : 'Oi! '
  const html = layoutEmail({
    titulo: assunto,
    corpoHtml: ola + corpoVencimentos(hoje, itens, total),
    preheader: `${qtd === 1 ? 'Uma conta' : qtd + ' contas'} a vencer · total ${brl(total)}`,
    cta: { texto: 'Ver no HopeFin', url: 'https://app.hopefin.com.br/contas-do-mes' },
  })
  return { assunto, html, qtd, total }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ erro: 'não autorizado' }, 401)
  }

  const body = await req.json().catch(() => ({}))
  const soGrupo = typeof body?.so_grupo === 'string' ? body.so_grupo : null
  const dias = Number.isInteger(body?.dias) && body.dias >= 0 && body.dias <= 31 ? body.dias : 1
  const previa = body?.previa === true

  // Data simulada só vale na prévia (conferir outro dia sem enviar nada).
  const hoje = previa && /^\d{4}-\d{2}-\d{2}$/.test(body?.hoje || '') ? body.hoje : hojeBRT()
  const ate = addDias(hoje, dias)

  let lista: Destino[]
  try { lista = (await destinatarios()).filter((g) => !soGrupo || g.grupo_id === soGrupo) } catch (e) {
    return json({ erro: (e as Error).message }, 500)
  }

  const mod = await lerModelo(admin, 'vencimentos')
  if (mod && mod.assunto && mod.corpo && !mod.ligado && !previa) return json({ ok: true, desligado: true })

  const out = { hoje, ate, previa, verificados: lista.length, enviados: 0, sem_contas: 0, pulados: 0, erros: 0, faturas: 0, detalhes: [] as unknown[] }

  for (const g of lista) {
    let itens: Item[]
    try { itens = await contasDoGrupo(g.grupo_id, hoje, ate) } catch (e) {
      out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: `motor: ${(e as Error).message}` }); continue
    }
    if (!itens.length) { out.sem_contas++; continue }
    const email = await montarEmail(g, hoje, itens, mod)
    out.faturas += itens.filter((i) => i.tipo === 'fatura').length

    if (previa) {
      // Detalhe (e-mail completo) só para o grupo pedido; sem so_grupo, só as contagens.
      out.detalhes.push(soGrupo
        ? { grupo: g.grupo_id, destino: g.email, assunto: email.assunto, itens, total: email.total, html: email.html }
        : { grupo: g.grupo_id, qtd: email.qtd, faturas: itens.filter((i) => i.tipo === 'fatura').length })
      continue
    }

    const ins = await admin.from('email_log')
      .insert({ grupo_id: g.grupo_id, titular_id: g.titular_id, tipo: 'vencimentos', ref: hoje, destino: g.email, assunto: email.assunto, status: 'enviando' })
      .select('id').maybeSingle()
    if (ins.error) {
      if ((ins.error as { code?: string }).code === '23505') { out.pulados++; continue }
      out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: ins.error.message }); continue
    }
    const env = await enviarEmail({ para: g.email, assunto: email.assunto, html: email.html, etiqueta: 'vencimentos' })
    if (env.ok) {
      await admin.from('email_log').update({ status: 'enviado', resend_id: env.id }).eq('id', ins.data!.id)
      out.enviados++; out.detalhes.push({ grupo: g.grupo_id, para: g.email, qtd: email.qtd, id: env.id })
    } else {
      await admin.from('email_log').delete().eq('id', ins.data!.id)
      out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: env.erro })
    }
  }

  return json(out)
})
