// automacoes-email — o "motor" das automações de e-mail criadas no Painel e do remarketing
// (D11, 22/11/2026). Chamada pelo cron diário (hopefin-automacoes-email, 10:30 BRT).
// NÃO é chamada por usuário: exige header x-cron-secret == CRON_SECRET (deploy --no-verify-jwt).
//
// O que faz, nesta ordem:
//   1) remarketing_atualizar(): põe nas sequências quem terminou o teste sem assinar / cancelou, e tira
//      quem assinou (status 'assinou') ou pediu pra não receber ('saiu').
//   2) Automações criadas no Painel (categoria 'personalizado'): "X dias depois de criar a conta",
//      "X dias depois do teste acabar", "X dias depois de cancelar", "X dias sem entrar".
//   3) Remarketing — só nas sequências LIGADAS no Painel (nascem desligadas): para cada pessoa ativa,
//      no máximo 1 e-mail a cada `intervalo_dias` (7); o de data marcada (oferta até 31/12) passa na frente.
// Tudo sai pelo remetente de campanha (email_config: "Lari, do HopeFin <novidades@...>") e com o link
// "não quero receber". 1 envio por pessoa e etapa (email_log único por grupo, tipo, ref).
//
// Corpo opcional (JSON): { simular?: true, so_usuario?: uuid }
//   simular → não envia nem grava e-mail: devolve quem receberia o quê hoje (o passo 1 roda igual).
// Segredos: CRON_SECRET, RESEND_API_KEY; SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { enviarEmail } from '../_shared/email.ts'
import { montarModelo, remetenteCampanha, type Modelo } from '../_shared/modelos.ts'
import { varsBase } from '../_shared/modelo.js'
import { oferta as textoOferta } from '../fim-de-trial/regua.js'
import { proximaEtapa, dataFixaValeHoje } from './regras.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))
const dataBRT = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

type Pessoa = { usuario_id: string; grupo_id: string; nome: string | null; email: string | null }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ erro: 'não autorizado' }, 401)
  const body = await req.json().catch(() => ({}))
  const simular = body?.simular === true
  const soUsuario = typeof body?.so_usuario === 'string' ? body.so_usuario : null
  const hoje = dataBRT(new Date())

  const out = { hoje, simular, atualizar: null as unknown, enviados: 0, pulados: 0, erros: 0, detalhes: [] as unknown[] }

  // 1) Sequências em dia.
  const { data: atual, error: errAt } = await admin.rpc('remarketing_atualizar')
  out.atualizar = errAt ? { erro: errAt.message } : atual

  const { data: todos, error: errMod } = await admin.from('email_modelos').select('*').in('categoria', ['personalizado', 'remarketing'])
  if (errMod) return json({ erro: errMod.message }, 500)
  const modelos = (todos || []) as Modelo[]
  const { data: precos } = await admin.rpc('planos_publicos')
  const of = textoOferta(precos)
  const remetente = await remetenteCampanha(admin)

  async function enviarUm(m: Modelo, p: Pessoa, ref: string) {
    if (!p.email) { out.pulados++; return }
    if (simular) { out.detalhes.push({ simulado: true, modelo: m.chave, para: p.email, usuario: p.usuario_id }); return }
    const montado = await montarModelo(m, { ...varsBase(p.nome), oferta: of ? { html: of, texto: '' } : '' }, { usuarioId: p.usuario_id })
    const ins = await admin.from('email_log')
      .insert({ grupo_id: p.grupo_id, titular_id: p.usuario_id, tipo: m.chave, ref, destino: p.email, assunto: montado.assunto, status: 'enviando' })
      .select('id').maybeSingle()
    if (ins.error) {
      if ((ins.error as { code?: string }).code === '23505') { out.pulados++; return }
      out.erros++; out.detalhes.push({ modelo: m.chave, erro: ins.error.message }); return
    }
    const env = await enviarEmail({ para: p.email, assunto: montado.assunto, html: montado.html, de: remetente.de, responderPara: remetente.responderPara, etiqueta: m.chave })
    if (env.ok) {
      await admin.from('email_log').update({ status: 'enviado', resend_id: env.id }).eq('id', ins.data!.id)
      out.enviados++; out.detalhes.push({ modelo: m.chave, para: p.email, id: env.id })
    } else {
      await admin.from('email_log').delete().eq('id', ins.data!.id) // tenta de novo amanhã
      out.erros++; out.detalhes.push({ modelo: m.chave, erro: env.erro })
    }
    await pausa(550) // limite de envio do Resend
  }

  // 2) Automações criadas no Painel.
  for (const m of modelos.filter((x) => x.categoria === 'personalizado' && x.ligado && x.gatilho && !x.sequencia && x.assunto && x.corpo)) {
    const { data: cands, error } = await admin.rpc('automacao_candidatos', { p_gatilho: m.gatilho, p_dias: m.dias ?? 0 })
    if (error) { out.erros++; out.detalhes.push({ modelo: m.chave, erro: error.message }); continue }
    for (const c of (cands || []) as (Pessoa & { ref: string })[]) {
      if (soUsuario && c.usuario_id !== soUsuario) continue
      await enviarUm(m, c, c.ref)
    }
  }

  // 3) Remarketing (só sequências ligadas).
  const { data: seqs } = await admin.from('email_sequencias').select('chave, ligada, intervalo_dias')
  const ligadas = (seqs || []).filter((q) => q.ligada)
  if (ligadas.length) {
    let qp = admin.from('remarketing_pessoas').select('usuario_id, grupo_id, sequencia, entrou_em')
      .eq('status', 'ativo').in('sequencia', ligadas.map((q) => q.chave))
    if (soUsuario) qp = qp.eq('usuario_id', soUsuario)
    const { data: pessoas, error: errP } = await qp
    if (errP) return json({ ...out, erro: errP.message }, 500)
    const ids = (pessoas || []).map((p) => p.usuario_id)
    const rmk = modelos.filter((m) => m.categoria === 'remarketing')
    const { data: us } = ids.length ? await admin.from('usuarios').select('id, nome, email, recebe_comunicados').in('id', ids) : { data: [] }
    const { data: logs } = ids.length
      ? await admin.from('email_log').select('titular_id, tipo, criado_em').in('titular_id', ids).in('tipo', rmk.map((m) => m.chave)).in('status', ['enviado', 'enviando'])
      : { data: [] }
    const porUsuario = new Map((us || []).map((u) => [u.id, u]))
    const datasFixas = rmk.filter((m) => dataFixaValeHoje(m, hoje, precos) && m.assunto && m.corpo)

    for (const p of pessoas || []) {
      const u = porUsuario.get(p.usuario_id)
      if (!u?.email || !u.recebe_comunicados) { out.pulados++; continue }
      const meus = (logs || []).filter((l) => l.titular_id === p.usuario_id)
      const enviadas = new Set(meus.map((l) => l.tipo))
      const ultimo = meus.reduce((mx: string | null, l) => { const d = dataBRT(new Date(l.criado_em)); return !mx || d > mx ? d : mx }, null)
      const pessoa: Pessoa = { usuario_id: p.usuario_id, grupo_id: p.grupo_id, nome: u.nome, email: u.email }

      const fixa = datasFixas.find((m) => !enviadas.has(m.chave))
      if (fixa && ultimo !== hoje) { await enviarUm(fixa, pessoa, p.usuario_id); continue }

      const seq = ligadas.find((q) => q.chave === p.sequencia)
      const etapa = proximaEtapa({
        etapas: rmk.filter((m) => m.sequencia === p.sequencia && m.assunto && m.corpo),
        entrouEm: p.entrou_em, hoje, enviadas, ultimoEnvio: ultimo, intervalo: seq?.intervalo_dias ?? 7,
      })
      if (etapa) await enviarUm(etapa as Modelo, pessoa, p.usuario_id)
    }
  }

  return json(out)
})
