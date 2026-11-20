// push.ts — Web Push (VAPID) pros aparelhos de quem está no grupo AGORA.
// Mesma regra do digest do send-push: a inscrição guarda o grupo da época; só recebe quem
// ainda é membro. Inscrição morta (404/410) é apagada. Usado pelo resumo-mensal (A8.14).
import webpush from 'npm:web-push@3.6.7'

let configurado = false
function configurar(): boolean {
  if (configurado) return true
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) return false
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:raullerickson@gmail.com', pub, priv)
  configurado = true
  return true
}

type Sub = { endpoint: string; p256dh: string; auth: string }

// deno-lint-ignore no-explicit-any
export async function aparelhosDoGrupo(admin: any, grupoId: string): Promise<Sub[]> {
  const { data: membros } = await admin.from('usuarios').select('id').eq('grupo_id', grupoId)
  const ids = (membros || []).map((m: { id: string }) => m.id)
  if (!ids.length) return []
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth')
    .eq('grupo_id', grupoId).in('usuario_id', ids)
  return (subs || []) as Sub[]
}

// Só os aparelhos de UMA pessoa (teste do dono antes de liberar algo pra todo mundo).
// deno-lint-ignore no-explicit-any
export async function aparelhosDoUsuario(admin: any, usuarioId: string): Promise<Sub[]> {
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('usuario_id', usuarioId)
  return (subs || []) as Sub[]
}

// deno-lint-ignore no-explicit-any
export async function pushParaGrupo(admin: any, grupoId: string, payload: Record<string, unknown>, soUsuario: string | null = null) {
  if (!configurar()) return { enviados: 0, removidos: 0, erro: 'VAPID ausente' }
  const subs = soUsuario ? await aparelhosDoUsuario(admin, soUsuario) : await aparelhosDoGrupo(admin, grupoId)
  const msg = JSON.stringify(payload)
  let enviados = 0
  let removidos = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, msg)
      enviados++
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode
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
