// reembolsos — reembolsos de arrependimento que o Asaas recusou por falta de saldo (tabela reembolsos_pendentes, 0129).
//
// Dois jeitos de chamar:
//  - CRON (x-cron-secret == CRON_SECRET), de hora em hora (hopefin-reembolsos): tenta estornar cada pendente;
//    deu certo → 'feito' + e-mail pro cliente. Não deu → guarda o erro e avisa o dono a cada ~20 h
//    (assunto "ATRASADO" se o prazo prometido já passou).
//  - PAINEL (JWT de admin com o código do celular, aal2):
//      { acao: 'tentar', id }                 tenta agora
//      { acao: 'marcar_feito', id, obs? }     o dono devolveu por fora (ex.: Pix manual) → 'feito_manual' + e-mail
//
// Deploy SEM verificação de JWT no gateway (o cron não manda JWT); o JWT do painel é conferido aqui.
// Segredos: ASAAS_API_KEY, ASAAS_BASE_URL, CRON_SECRET.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { nivelDaSessao } from '../_shared/sessao.ts'
import { estornar, concluir, avisarDono } from '../_shared/reembolso.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
const ASAAS_KEY = Deno.env.get('ASAAS_API_KEY') || ''
const ASAAS_BASE = Deno.env.get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

async function asaas(path: string, init: RequestInit = {}) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    ...init, headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.errors?.[0]?.description || `Asaas HTTP ${res.status}`)
  return data
}

const HORAS_ENTRE_AVISOS = 20

// deno-lint-ignore no-explicit-any
async function tentar(r: any, por: string) {
  const agora = new Date().toISOString()
  try {
    await estornar(asaas, r)
    await admin.from('reembolsos_pendentes').update({ tentativas: (r.tentativas || 0) + 1, ultima_tentativa_em: agora, ultimo_erro: null }).eq('id', r.id)
    await concluir(admin, r, por)
    return { id: r.id, ok: true }
  } catch (e) {
    const erro = (e as Error)?.message || 'erro'
    // Já estornado (ex.: o dono fez no painel do Asaas e o aviso ainda não chegou): conta como feito.
    if (/estornad|refunded|já foi/i.test(erro)) { await concluir(admin, r, por); return { id: r.id, ok: true, jaEstava: true } }
    await admin.from('reembolsos_pendentes').update({ tentativas: (r.tentativas || 0) + 1, ultima_tentativa_em: agora, ultimo_erro: erro }).eq('id', r.id)
    return { id: r.id, ok: false, erro }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!ASAAS_KEY) return json({ erro: 'ASAAS_API_KEY não configurada' }, 500)
  const body = await req.json().catch(() => ({}))

  // ---------- CRON ----------
  if (CRON_SECRET && req.headers.get('x-cron-secret') === CRON_SECRET) {
    const { data: pend } = await admin.from('reembolsos_pendentes').select('*').eq('status', 'pendente').order('pedido_em')
    const resultados = []
    for (const r of pend || []) {
      const res = await tentar(r, 'automatico')
      resultados.push(res)
      if (res.ok) continue
      const ultimo = r.ultimo_alerta_dono_em ? new Date(r.ultimo_alerta_dono_em).getTime() : 0
      if (Date.now() - ultimo >= HORAS_ENTRE_AVISOS * 3600 * 1000) {
        const { data: atual } = await admin.from('reembolsos_pendentes').select('*').eq('id', r.id).maybeSingle()
        try { await avisarDono(admin, atual || r, new Date(r.prazo_em) < new Date() ? 'vencido' : 'lembrete') } catch (e) { console.error('[reembolsos] aviso:', (e as Error)?.message) }
      }
    }
    return json({ ok: true, pendentes: (pend || []).length, resultados })
  }

  // ---------- PAINEL (admin + código do celular) ----------
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  if (!jwt || jwt === ANON) return json({ erro: 'não autorizado' }, 401)
  const { data: u } = await admin.auth.getUser(jwt)
  if (!u?.user) return json({ erro: 'não autorizado' }, 401)
  const { data: me } = await admin.from('usuarios').select('is_admin').eq('id', u.user.id).maybeSingle()
  if (!me?.is_admin) return json({ erro: 'não autorizado' }, 403)
  if (nivelDaSessao(jwt) !== 'aal2') return json({ erro: 'confirme o código do celular no painel' }, 403)

  const id = typeof body?.id === 'string' ? body.id : ''
  const { data: r } = await admin.from('reembolsos_pendentes').select('*').eq('id', id).maybeSingle()
  if (!r) return json({ erro: 'reembolso não encontrado' }, 404)
  if (r.status !== 'pendente') return json({ erro: 'esse reembolso já foi resolvido' }, 400)

  if (body?.acao === 'tentar') {
    const res = await tentar(r, 'painel')
    await admin.from('admin_log').insert({ admin_id: u.user.id, acao: 'reembolso_tentar', grupo_id: r.grupo_id, detalhe: res }).then(() => {}, () => {})
    return json(res)
  }
  if (body?.acao === 'marcar_feito') {
    const obs = String(body?.obs || '').slice(0, 300)
    await admin.from('reembolsos_pendentes').update({ ultimo_erro: obs ? `feito por fora: ${obs}` : r.ultimo_erro }).eq('id', r.id)
    await concluir(admin, r, 'manual', 'feito_manual')
    await admin.from('admin_log').insert({ admin_id: u.user.id, acao: 'reembolso_marcar_feito', grupo_id: r.grupo_id, motivo: obs || null, detalhe: { id: r.id } }).then(() => {}, () => {})
    return json({ ok: true })
  }
  return json({ erro: 'ação desconhecida' }, 400)
})
