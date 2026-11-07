// resumo-mensal — e-mail com o resumo do mês (prompt 7, etapa 4). Chamado pelo
// cron mensal (hopefin-resumo-mensal, dia 1). Exige x-cron-secret == CRON_SECRET
// (deploy --no-verify-jwt).
//
// Sem 'comp' no corpo, usa o MÊS ANTERIOR (fuso America/Sao_Paulo). Por grupo
// com atividade no mês (RPC resumo_mensal): entradas, gastos, saldo e top 3
// categorias. 1 e-mail por grupo por mês (email_log, tipo='resumo_mensal',
// ref=comp). Reutiliza _shared/email.ts (layout no design da marca).
//
// Corpo opcional (JSON): { comp?: 'YYYY-MM', so_grupo?: uuid }  // teste/reprocesso
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

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
function mesAnterior(): string {
  const [y, m] = dataBRT(new Date()).split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const nomeMes = (comp: string) => MESES[Number(comp.split('-')[1]) - 1] || comp

const CAT: Record<string, string> = {
  mercado: 'Mercado', alimentacao: 'Alimentação', transporte: 'Transporte', lazer: 'Lazer',
  saude: 'Saúde', moradia: 'Moradia', educacao: 'Educação', contas: 'Contas',
  vestuario: 'Vestuário', assinaturas: 'Assinaturas', pet: 'Pet', filhos: 'Filhos', outros: 'Outros',
}
const labelCat = (s: string) => CAT[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Outros')

const COR = { ink: '#0f172a', sub: '#64748b', borda: '#eef1f5', verde: '#047857', vermelho: '#b91c1c' }

type Grupo = {
  grupo_id: string; titular_id: string; email: string; nome: string | null
  total_entradas: number; total_gastos: number; saldo: number; qtd_gastos: number
  top_categorias: { nome: string; total: number }[]
}

function corpoResumo(g: Grupo, mes: string): string {
  const saldoPos = Number(g.saldo) >= 0
  const linha = (rotulo: string, valor: string, cor: string, forte = false) =>
    `<tr><td style="padding:7px 0;border-bottom:1px solid ${COR.borda};font-size:15px;color:${COR.ink};${forte ? 'font-weight:700;' : ''}">${rotulo}</td>` +
    `<td style="padding:7px 0;border-bottom:1px solid ${COR.borda};font-size:15px;color:${cor};text-align:right;font-weight:700;white-space:nowrap;">${valor}</td></tr>`

  const cats = (g.top_categorias || []).map((c) =>
    `<tr><td style="padding:5px 0;font-size:14px;color:${COR.ink};">${esc(labelCat(c.nome))}</td>` +
    `<td style="padding:5px 0;font-size:14px;color:${COR.sub};text-align:right;white-space:nowrap;">${brl(c.total)}</td></tr>`
  ).join('')

  return `Fechou <strong>${mes}</strong>! Aqui está o resumo das finanças da sua família:<br><br>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${linha('Entradas', brl(g.total_entradas), COR.verde)}
      ${linha('Gastos', brl(g.total_gastos), COR.vermelho)}
      ${linha(saldoPos ? 'Sobrou' : 'Faltou', brl(Math.abs(Number(g.saldo))), saldoPos ? COR.verde : COR.vermelho, true)}
    </table>` +
    (cats ? `<br><div style="font-size:14px;color:${COR.sub};margin-bottom:4px;">Onde você mais gastou:</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${cats}</table>` : '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ erro: 'não autorizado' }, 401)
  }

  const body = await req.json().catch(() => ({}))
  const comp = /^\d{4}-\d{2}$/.test(body?.comp || '') ? body.comp : mesAnterior()
  const soGrupo = typeof body?.so_grupo === 'string' ? body.so_grupo : null
  const mes = nomeMes(comp)

  const { data: grupos, error } = await admin.rpc('resumo_mensal', { p_comp: comp })
  if (error) return json({ erro: error.message }, 500)

  const lista = ((grupos || []) as Grupo[]).filter((g) => !soGrupo || g.grupo_id === soGrupo)
  const out = { comp, verificados: lista.length, enviados: 0, pulados: 0, erros: 0, detalhes: [] as unknown[] }

  for (const g of lista) {
    if (!g.email) { out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: 'sem e-mail' }); continue }
    const assunto = `Seu resumo de ${mes} chegou`
    const ins = await admin.from('email_log')
      .insert({ grupo_id: g.grupo_id, titular_id: g.titular_id, tipo: 'resumo_mensal', ref: comp, destino: g.email, assunto, status: 'enviando' })
      .select('id').maybeSingle()
    if (ins.error) {
      if ((ins.error as { code?: string }).code === '23505') { out.pulados++; continue }
      out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: ins.error.message }); continue
    }

    const ola = g.nome ? `Oi, ${esc(String(g.nome).split(' ')[0])}! ` : 'Oi! '
    const saldoPos = Number(g.saldo) >= 0
    const html = layoutEmail({
      titulo: assunto,
      corpoHtml: ola + corpoResumo(g, mes),
      preheader: `${saldoPos ? 'Sobrou' : 'Faltou'} ${brl(Math.abs(Number(g.saldo)))} em ${mes}`,
      cta: { texto: 'Ver o mês no HopeFin', url: 'https://app.hopefin.com.br/fechamento' },
    })
    const env = await enviarEmail({ para: g.email, assunto, html })
    if (env.ok) {
      await admin.from('email_log').update({ status: 'enviado', resend_id: env.id }).eq('id', ins.data!.id)
      out.enviados++; out.detalhes.push({ grupo: g.grupo_id, para: g.email, id: env.id })
    } else {
      await admin.from('email_log').delete().eq('id', ins.data!.id)
      out.erros++; out.detalhes.push({ grupo: g.grupo_id, erro: env.erro })
    }
  }

  return json(out)
})
