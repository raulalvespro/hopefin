import { supabase } from './supabase'

// Chave pública VAPID (applicationServerKey). É PÚBLICA por natureza — pode
// ficar no bundle. A privada correspondente é segredo da Edge Function send-push.
// Gerada por scripts/gen-vapid.mjs.
export const VAPID_PUBLIC_KEY =
  'BH6vYeix64hiSMD8Y0ksBUyvA7DR24aCoQQg8qcxaJPoli87X6O7NwSNn75Xb4QnNUENIZbc3EVflFlXGKIKtMk'

export function pushSuportado() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// { suportado, permissao: 'default'|'granted'|'denied'|'unsupported', inscrito }
export async function statusPush() {
  if (!pushSuportado()) return { suportado: false, permissao: 'unsupported', inscrito: false }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return { suportado: true, permissao: Notification.permission, inscrito: !!sub }
  } catch {
    return { suportado: true, permissao: Notification.permission, inscrito: false }
  }
}

export async function ativarPush(usuarioId, grupoId) {
  if (!pushSuportado()) throw new Error('Este navegador não suporta notificações push.')
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') {
    throw new Error(
      permissao === 'denied'
        ? 'Permissão bloqueada. Libere as notificações nas configurações do navegador/site.'
        : 'Permissão não concedida.'
    )
  }
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      usuario_id: usuarioId,
      grupo_id: grupoId,
      endpoint: sub.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw error
  return true
}

export async function desativarPush() {
  if (!pushSuportado()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  try { await sub.unsubscribe() } catch { /* ignora */ }
}

// Dispara um push de teste para os dispositivos do próprio usuário.
export async function enviarPushTeste() {
  const { data, error } = await supabase.functions.invoke('send-push', {
    body: { acao: 'teste' },
  })
  if (error) throw error
  return data
}
