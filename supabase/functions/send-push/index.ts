// send-push — envia Web Push (VAPID) para os dispositivos inscritos.
//
// Ações (JSON no corpo):
//   { acao: "teste" }   -> requer JWT de usuário; manda um push de teste pros
//                          dispositivos do próprio usuário.
//   { acao: "digest" }  -> requer header x-cron-secret == CRON_SECRET; monta o
//                          resumo de vencimentos por grupo (RPC push_pendencias)
//                          e manda para os dispositivos de cada grupo.
//
// Segredos (supabase secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (opcional), CRON_SECRET. SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY são injetados pelo runtime.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:raullerickson@gmail.com'
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Sub = { endpoint: string; p256dh: string; auth: string }

async function enviar(subs: Sub[], payload: Record<string, unknown>) {
  let enviados = 0
  let removidos = 0
  const msg = JSON.stringify(payload)
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        msg,
      )
      enviados++
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode
      // 404/410 = inscrição morta -> limpa do banco
      if (code === 404 || code === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        removidos++
      } else {
        console.error('push falhou', code, (err as Error)?.message)
      }
    }
  }
  return { enviados, removidos }
}

async function rodarDigest() {
  // RPC que retorna [{ grupo_id, titulo, corpo }] para grupos com pendências.
  const { data: resumos, error } = await admin.rpc('push_pendencias')
  if (error) return { error: error.message }
  let enviados = 0
  const grupos = resumos || []
  for (const g of grupos) {
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('grupo_id', g.grupo_id)
    if (!subs?.length) continue
    const r = await enviar(subs, {
      title: g.titulo || 'HopeFin',
      body: g.corpo || '',
      url: '/contas-do-mes',
      tag: 'digest-vencimentos',
    })
    enviados += r.enviados
  }
  return { grupos: grupos.length, enviados }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405)

  const body = await req.json().catch(() => ({}))
  const acao = body.acao || 'teste'

  if (acao === 'digest') {
    if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
      return json({ error: 'não autorizado' }, 401)
    }
    return json(await rodarDigest())
  }

  if (acao === 'teste') {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: u } = await admin.auth.getUser(jwt)
    if (!u?.user) return json({ error: 'não autenticado' }, 401)
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('usuario_id', u.user.id)
    if (!subs?.length) return json({ enviados: 0, aviso: 'Nenhum dispositivo inscrito.' })
    const r = await enviar(subs, {
      title: 'HopeFin',
      body: '🎉 As notificações no celular estão funcionando!',
      url: '/notificacoes',
      tag: 'teste',
    })
    return json(r)
  }

  return json({ error: 'ação desconhecida' }, 400)
})
