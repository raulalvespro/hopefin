// lembrete-vencimento — avisa o titular das contas a vencer (prompt 7, etapa 3).
// Chamada pelo cron diário (hopefin-vencimentos). Exige x-cron-secret ==
// CRON_SECRET (deploy --no-verify-jwt).
//
// Regra: só manda quando há conta vencendo HOJE ou AMANHÃ (janela via RPC
// vencimentos_a_vencer, default 1 dia), 1 e-mail por grupo por dia (idempotência
// no email_log, tipo='vencimentos', ref = data de hoje em BRT). Reutiliza o
// módulo _shared/email.ts (layout no design da marca).
//
// Corpo opcional (JSON): { so_grupo?: uuid, dias?: int }  // teste/ajuste de janela
// Segredos: CRON_SECRET; SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY injetados.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { layoutEmail, enviarEmail, esc } from '../_shared/email.ts'

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

const dataBRT = (d: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d)
const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const diaMes = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }

type Item = { nome: string; valor: number; venc: string; tipo: string }

function corpoVencimentos(hoje: string, itens: Item[], total: number): string {
  const linhas = itens.map((i) => {
    const quando = i.venc === hoje ? 'vence hoje' : `vence ${diaMes(i.venc)}`
    return `<tr>
      <td style="padding:7px 0;border-bottom:1px solid #eef1f5;font-size:15px;color:#0f172a;">${esc(i.nome)}
        <span style="color:#64748b;font-size:13px;"> · ${quando}</span></td>
      <td style="padding:7px 0;border-bottom:1px solid #eef1f5;font-size:15px;color:#0f172a;text-align:right;white-space:nowrap;">${brl(i.valor)}</td>
    </tr>`
  }).join('')
  return `Uma lembrança rápida das contas da sua família que estão chegando:<br><br>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${linhas}
      <tr><td style="padding:10px 0 0;font-size:15px;color:#0f172a;font-weight:700;">Total</td>
        <td style="padding:10px 0 0;font-size:15px;color:#0f172a;font-weight:700;text-align:right;">${brl(total)}</td></tr>
    </table>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ erro: 'não autorizado' }, 401)
  }

  const body = await req.json().catch(() => ({}))
  const soGrupo = typeof body?.so_grupo === 'string' ? body.so_grupo : null
  const dias = Number.isInteger(body?.dias) ? body.dias : 1

  const { data: grupos, error } = await admin.rpc('vencimentos_a_vencer', { p_dias: dias })
  if (error) return json({ erro: error.message }, 500)

  const hoje = dataBRT(new Date())
  const lista = (grupos || []).filter((g: { grupo_id: string }) => !soGrupo || g.grupo_id === soGrupo)
  const out = { verificados: lista.length, enviados: 0, pulados: 0, erros: 0, detalhes: [] as unknown[] }

  for (const g of lista) {
    if (!g.email) { out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: 'sem e-mail' }); continue }
    const tipo = 'vencimentos'
    const ins = await admin.from('email_log')
      .insert({ grupo_id: g.grupo_id, titular_id: g.titular_id, tipo, ref: hoje, destino: g.email,
        assunto: g.qtd === 1 ? 'Você tem 1 conta a vencer' : `Você tem ${g.qtd} contas a vencer`, status: 'enviando' })
      .select('id').maybeSingle()
    if (ins.error) {
      if ((ins.error as { code?: string }).code === '23505') { out.pulados++; continue }
      out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: ins.error.message }); continue
    }

    const assunto = g.qtd === 1 ? 'Você tem 1 conta a vencer' : `Você tem ${g.qtd} contas a vencer`
    const ola = g.nome ? `Oi, ${esc(String(g.nome).split(' ')[0])}! ` : 'Oi! '
    const html = layoutEmail({
      titulo: assunto,
      corpoHtml: ola + corpoVencimentos(hoje, g.itens as Item[], Number(g.total)),
      preheader: `${g.qtd === 1 ? 'Uma conta' : g.qtd + ' contas'} a vencer · total ${brl(Number(g.total))}`,
      cta: { texto: 'Ver no HopeFin', url: 'https://app.hopefin.com.br/contas-do-mes' },
    })
    const env = await enviarEmail({ para: g.email, assunto, html })
    if (env.ok) {
      await admin.from('email_log').update({ status: 'enviado', resend_id: env.id }).eq('id', ins.data!.id)
      out.enviados++; out.detalhes.push({ grupo: g.grupo_id, para: g.email, qtd: g.qtd, id: env.id })
    } else {
      await admin.from('email_log').delete().eq('id', ins.data!.id)
      out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: env.erro })
    }
  }

  return json(out)
})
