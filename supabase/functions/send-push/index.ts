// send-push — envia Web Push (VAPID) para os dispositivos inscritos.
//
// Ações (JSON no corpo):
//   { acao: "teste" }   -> requer JWT de usuário; manda um push de teste pros
//                          dispositivos do próprio usuário.
//   { acao: "digest" }  -> requer header x-cron-secret == CRON_SECRET; monta o
//                          resumo de contas a pagar por grupo e manda para os
//                          dispositivos de cada grupo.
//   { acao: "digest", previa: true, so_grupo?, hoje? } -> NÃO envia nada: devolve o
//                          texto que iria (completo só p/ so_grupo; sem so_grupo,
//                          contagens). `hoje` (AAAA-MM-DD) simula outro dia.
//
// Desde a Onda 1 (A2.10, 18/11/2026) a lista do digest vem do MOTOR ÚNICO
// (_shared/motor.js → contasAVencer): vencidas no mês + hoje + amanhã, ainda não
// pagas — com as FATURAS dos cartões, que a antiga RPC push_pendencias (migração
// 0015) não tinha. Mesma lista de "contas a vencer" do Início.
//
// Segredos (supabase secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (opcional), CRON_SECRET. SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY são injetados pelo runtime.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { contasAVencer, hojeBRT, addDias, compDe } from '../_shared/motor.js'
import { carregarDadosMotor } from '../_shared/motor-dados.js'

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

type Item = { tipo: string; nome: string; valor: number; venc: string }

const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Grupos com aparelho inscrito que não desligaram "Contas vencidas e a vencer".
async function gruposDoDigest(): Promise<string[]> {
  const [subs, prefs, grupos] = await Promise.all([
    admin.from('push_subscriptions').select('grupo_id').not('grupo_id', 'is', null),
    admin.from('preferencias_notificacao').select('grupo_id, alertar_vencimentos'),
    admin.from('grupos').select('id'),
  ])
  if (subs.error) throw new Error(subs.error.message)
  if (prefs.error) throw new Error(prefs.error.message)
  if (grupos.error) throw new Error(grupos.error.message)
  const existe = new Set((grupos.data || []).map((g: { id: string }) => g.id))
  const desligado = new Set((prefs.data || []).filter((p) => p.alertar_vencimentos === false).map((p) => p.grupo_id))
  return [...new Set((subs.data || []).map((s: { grupo_id: string }) => s.grupo_id))]
    .filter((g) => existe.has(g) && !desligado.has(g))
}

// Título e texto do push: vencidas no mês + hoje + amanhã, não pagas (motor único).
async function digestDoGrupo(grupoId: string, hoje: string) {
  const amanha = addDias(hoje, 1)
  const dados = await carregarDadosMotor(admin, grupoId, { compIni: compDe(hoje), compFim: compDe(amanha) })
  const itens = contasAVencer(dados, `${compDe(hoje)}-01`, amanha, { hoje }) as Item[]
  if (!itens.length) return null
  const n = itens.length
  const total = Math.round(itens.reduce((s, i) => s + Number(i.valor), 0) * 100) / 100
  if (total <= 0) return null
  const atrasadas = itens.filter((i) => i.venc < hoje).length
  const faturas = itens.filter((i) => i.tipo === 'fatura')
  const incluindo = faturas.length === 1
    ? `, incluindo a fatura ${faturas[0].nome.replace(/^Fatura /, 'do ')}`
    : faturas.length > 1 ? `, incluindo ${faturas.length} faturas de cartão` : ''
  const corpo = (n === 1 ? 'Você tem 1 conta a pagar' : `Você tem ${n} contas a pagar`) +
    ` (${brl(total)})${incluindo}` +
    (atrasadas > 0 ? ` · ${atrasadas} em atraso` : '') + '. Toque para ver.'
  return { titulo: 'HopeFin · contas a pagar', corpo, qtd: n, faturas: faturas.length, atrasadas }
}

async function rodarDigest(previa = false, soGrupo: string | null = null, hojeSimulado: string | null = null) {
  let gids: string[]
  try { gids = (await gruposDoDigest()).filter((g) => !soGrupo || g === soGrupo) } catch (e) {
    return { error: (e as Error).message }
  }
  // Data simulada só vale na prévia (conferir o texto de outro dia sem enviar nada).
  const hoje = previa && hojeSimulado && /^\d{4}-\d{2}-\d{2}$/.test(hojeSimulado) ? hojeSimulado : hojeBRT()
  let enviados = 0
  const grupos: { grupo_id: string; titulo: string; corpo: string }[] = []
  const detalhes: unknown[] = []
  for (const gid of gids) {
    try {
      const d = await digestDoGrupo(gid, hoje)
      if (d) grupos.push({ grupo_id: gid, titulo: d.titulo, corpo: d.corpo })
      if (d && previa) detalhes.push(soGrupo ? { grupo: gid, ...d } : { grupo: gid, qtd: d.qtd, faturas: d.faturas })
    } catch (e) {
      console.error('digest: motor falhou', gid, (e as Error).message)
      detalhes.push({ grupo: gid, erro: (e as Error).message })
    }
  }
  if (previa) return { previa: true, hoje, verificados: gids.length, com_aviso: grupos.length, detalhes }

  for (const g of grupos) {
    // Só quem está no grupo AGORA recebe. A inscrição guarda o grupo da época em
    // que foi feita — sem esse filtro, quem saiu do grupo continuava recebendo.
    const { data: membros } = await admin.from('usuarios').select('id').eq('grupo_id', g.grupo_id)
    const ids = (membros || []).map((m: { id: string }) => m.id)
    if (!ids.length) continue
    // Faxina: inscrições deste grupo de quem não é mais membro.
    await admin.from('push_subscriptions').delete()
      .eq('grupo_id', g.grupo_id).not('usuario_id', 'in', `(${ids.join(',')})`)
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('grupo_id', g.grupo_id)
      .in('usuario_id', ids)
    if (!subs?.length) continue
    const r = await enviar(subs, {
      title: g.titulo || 'HopeFin',
      body: g.corpo || '',
      url: '/contas-do-mes',
      tag: 'digest-vencimentos',
    })
    enviados += r.enviados
  }
  return { grupos: grupos.length, enviados, erros: detalhes.length }
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
    return json(await rodarDigest(body.previa === true, typeof body.so_grupo === 'string' ? body.so_grupo : null,
      typeof body.hoje === 'string' ? body.hoje : null))
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
