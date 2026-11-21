// suporte-aviso-dono — avisa o(s) dono(s) quando alguém abre um chamado no app (21/11/2026).
// Chamada pelo cron `hopefin-suporte-aviso` (a cada 5 min, só quando há chamado sem aviso — ver
// scripts/setup-cron.mjs). Exige header x-cron-secret == CRON_SECRET (deploy --no-verify-jwt).
//
// Para cada chamado (origem 'app') sem aviso_dono_em, dos últimos 2 dias:
//   1) marca aviso_dono_em ANTES de enviar (um aviso só por chamado, mesmo com 2 crons ao mesmo tempo);
//   2) e-mail pros admins com quem abriu, categoria, tela, assunto, mensagem e prazo;
//   3) notificação nos celulares dos admins (abre o painel na aba Suporte).
// Vários chamados juntos viram UM e-mail e UMA notificação.
//
// Corpo opcional (JSON):
//   { so_para: "email", id: uuid }  → teste: manda SÓ esse chamado SÓ pra esse e-mail (sem push),
//                                      com [TESTE] no assunto e SEM marcar aviso_dono_em (repetível).
// Segredos: CRON_SECRET, VAPID_*; SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { enviarEmail, layoutEmail, esc } from '../_shared/email.ts'
import { pushParaGrupo } from '../_shared/push.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
const LINK_PAINEL = 'https://admin.hopefin.com.br/?aba=suporte'

const CATEGORIA: Record<string, string> = {
  duvida: 'Dúvida', problema: 'Problema', sugestao: 'Sugestão', assinatura: 'Assinatura', outro: 'Outro',
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

type Chamado = {
  id: string; de_nome: string | null; de_email: string | null; assunto: string | null; corpo: string | null
  categoria: string | null; tela: string | null; prazo_em: string | null; recebido_em: string
}

const dataHora = (iso: string | null) => iso
  ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  : '—'

function blocoChamado(c: Chamado): string {
  const msg = esc(String(c.corpo || '').slice(0, 1500)).replace(/\n/g, '<br>')
  return `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin:14px 0;">
    <p style="margin:0 0 6px;"><strong>${esc(c.assunto || '(sem assunto)')}</strong></p>
    <p style="margin:0 0 10px;font-size:13px;color:#555;">${esc(c.de_nome || 'Sem nome')}${c.de_email ? ` · ${esc(c.de_email)}` : ''}<br>
      ${esc(CATEGORIA[c.categoria || ''] || 'Outro')}${c.tela ? ` · tela ${esc(c.tela)}` : ''} · aberto ${dataHora(c.recebido_em)} · responder até ${dataHora(c.prazo_em)}</p>
    <div style="border-left:3px solid #10b981;padding-left:12px;">${msg}</div>
  </div>`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ erro: 'não autorizado' }, 401)

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({}))
  const soPara = typeof body?.so_para === 'string' && body.so_para.includes('@') ? body.so_para.trim() : null
  const campos = 'id, de_nome, de_email, assunto, corpo, categoria, tela, prazo_em, recebido_em'

  let chamados: Chamado[] = []
  if (soPara) {
    if (typeof body?.id !== 'string') return json({ erro: 'teste precisa de id' }, 400)
    const { data } = await sb.from('suporte_emails').select(campos).eq('id', body.id).eq('origem', 'app').maybeSingle()
    if (data) chamados = [data as Chamado]
  } else {
    // Marca primeiro (update … returning): dois disparos ao mesmo tempo não avisam o mesmo chamado.
    const desde = new Date(Date.now() - 2 * 86400000).toISOString()
    const { data, error } = await sb.from('suporte_emails')
      .update({ aviso_dono_em: new Date().toISOString() })
      .is('aviso_dono_em', null).eq('origem', 'app').gte('recebido_em', desde)
      .select(campos)
    if (error) return json({ erro: error.message }, 500)
    chamados = (data || []) as Chamado[]
  }
  if (chamados.length === 0) return json({ ok: true, chamados: 0 })
  chamados.sort((a, b) => a.recebido_em.localeCompare(b.recebido_em))

  // Destinatários: os admins (e-mail + aparelhos). No teste, só o e-mail indicado.
  const { data: admins } = await sb.from('usuarios').select('id, grupo_id').eq('is_admin', true)
  const emails: string[] = []
  if (soPara) emails.push(soPara)
  else for (const a of admins || []) {
    const { data: u } = await sb.auth.admin.getUserById(a.id)
    if (u?.user?.email) emails.push(u.user.email)
  }

  const n = chamados.length
  const um = chamados[0]
  const tag = soPara ? '[TESTE] ' : ''
  const assunto = n === 1
    ? `${tag}Chamado novo no HopeFin: ${String(um.assunto || 'sem assunto').slice(0, 70)}`
    : `${tag}${n} chamados novos no HopeFin`
  const html = layoutEmail({
    titulo: n === 1 ? 'Chegou um chamado novo' : `Chegaram ${n} chamados novos`,
    corpoHtml: `${soPara ? '<p style="color:#b45309"><strong>[TESTE]</strong> Aviso de teste — nada foi marcado no banco.</p>' : ''}` +
      chamados.map(blocoChamado).join('') +
      '<p>Responda pelo painel, em <strong>Atendimento › Suporte</strong>. A resposta chega no app, no e-mail e no celular da pessoa.</p>',
    preheader: n === 1 ? `${um.de_nome || 'Alguém'} abriu um chamado: ${um.assunto || ''}` : `${n} chamados esperando resposta.`,
    cta: { texto: 'Abrir o Suporte', url: LINK_PAINEL },
  })

  const out = { ok: true, chamados: n, emails: 0, push: 0, erros: [] as string[] }
  for (const para of emails) {
    const r = await enviarEmail({ para, assunto, html })
    if (r.ok) out.emails++
    else out.erros.push(`e-mail ${para}: ${r.erro || 'erro'}`)
  }

  if (!soPara) {
    for (const a of admins || []) {
      try {
        const r = await pushParaGrupo(sb, a.grupo_id || '', {
          title: n === 1 ? 'Chamado novo 🛟' : `${n} chamados novos 🛟`,
          body: n === 1 ? `${um.de_nome || 'Alguém'}: ${String(um.assunto || '').slice(0, 90)}` : 'Toque para abrir o Suporte.',
          url: '/admin?aba=suporte',
          tag: 'chamado-novo',
        }, a.id)
        out.push += r.enviados || 0
      } catch (e) {
        out.erros.push(`push: ${(e as Error).message}`)
      }
    }
    await sb.from('admin_log').insert({ acao: 'suporte_aviso_dono', detalhe: { ids: chamados.map(c => c.id), emails: out.emails, push: out.push } })
  }
  return json(out)
})
