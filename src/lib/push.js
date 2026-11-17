import { supabase } from './supabase'
import { registrarDiagnostico } from './diagnostico'
import { estaInstalado, ehAndroid } from './instalacao'

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

// Espera uma promessa por no máximo `ms` (o service worker pode demorar ou nunca ficar pronto).
function comTempo(promessa, ms, erro) {
  return Promise.race([promessa, new Promise((_, rej) => setTimeout(() => rej(erro), ms))])
}

// { suportado, permissao: 'default'|'granted'|'denied'|'unsupported', inscrito }
export async function statusPush() {
  if (!pushSuportado()) return { suportado: false, permissao: 'unsupported', inscrito: false }
  try {
    const reg = await comTempo(navigator.serviceWorker.ready, 8000, new Error('sw'))
    const sub = await reg.pushManager.getSubscription()
    return { suportado: true, permissao: Notification.permission, inscrito: !!sub }
  } catch {
    return { suportado: true, permissao: Notification.permission, inscrito: false }
  }
}

// Erro com mensagem pra pessoa + código e causa técnica (vão pro diagnóstico).
function erroPush(codigo, mensagem, causa) {
  const e = new Error(mensagem)
  e.codigo = codigo
  e.causa = causa ? `${causa.name || causa.code || 'Erro'}: ${causa.message || String(causa)}` : ''
  return e
}

const MSG_SERVICO = 'O serviço de notificações deste celular não respondeu. Use o Chrome atualizado — alguns navegadores (como o Brave) e aparelhos sem os serviços do Google não recebem notificações.'
const MSG_SISTEMA = 'O Android está bloqueando as notificações do navegador. Em Configurações do Android → Apps → Chrome → Notificações, deixe permitido e tente de novo.'

async function ativarPushInterno() {
  if (!pushSuportado()) {
    throw erroPush('nao_suportado', 'Este navegador não recebe notificações. No Android, abra o HopeFin pelo Chrome; no iPhone, pelo app instalado na tela de início.')
  }
  let permissao
  try { permissao = await Notification.requestPermission() }
  catch (e) { throw erroPush('permissao_falhou', 'O navegador não deixou pedir a permissão agora. Tente de novo.', e) }
  if (permissao === 'denied') {
    throw erroPush('permissao_bloqueada', ehAndroid()
      ? 'As notificações estão bloqueadas para o HopeFin. No Chrome: toque no cadeado ao lado do endereço → Permissões → Notificações → Permitir. Se não aparecer, veja em Configurações do Android → Apps → Chrome → Notificações.'
      : 'As notificações estão bloqueadas para o HopeFin. Libere nas configurações do navegador e tente de novo.')
  }
  if (permissao !== 'granted') {
    throw erroPush('permissao_nao_concedida', 'A permissão não foi confirmada. Toque em Ativar de novo e escolha "Permitir".')
  }

  const reg = await comTempo(navigator.serviceWorker.ready, 10000,
    erroPush('sw_indisponivel', 'O app ainda está terminando de carregar. Feche, abra de novo e tente outra vez.'))
  const opcoes = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe(opcoes)
    } catch (e) {
      if (e?.name === 'InvalidStateError') {
        // Sobrou uma inscrição antiga com outra chave: limpa e tenta de novo.
        try { await (await reg.pushManager.getSubscription())?.unsubscribe() } catch { /* ignora */ }
        try { sub = await reg.pushManager.subscribe(opcoes) } catch (e2) { throw erroPush('servico_push', MSG_SERVICO, e2) }
      } else if (e?.name === 'NotAllowedError') {
        throw erroPush('bloqueado_no_sistema', MSG_SISTEMA, e)
      } else {
        throw erroPush('servico_push', MSG_SERVICO, e)
      }
    }
  }

  // Grava pelo RPC (0059): também reatribui o aparelho se ele já foi usado por outra conta.
  const j = sub.toJSON()
  const { error } = await supabase.rpc('registrar_push', {
    p_endpoint: sub.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw erroPush('salvar', 'Não foi possível salvar a inscrição agora. Tente de novo em instantes.', error)
  return true
}

// Ativa o push neste aparelho. Se falhar, registra o erro exato (sem dado financeiro)
// pra diagnosticar aparelhos que não temos em mãos, e repassa a mensagem amigável.
export async function ativarPush(usuarioId, grupoId) {
  try {
    return await ativarPushInterno()
  } catch (e) {
    const perm = typeof Notification !== 'undefined' ? Notification.permission : '-'
    registrarDiagnostico('push',
      `${e.codigo || 'inesperado'} | ${e.causa || `${e.name || 'Erro'}: ${e.message}`} | permissao=${perm} | instalado=${estaInstalado()}`,
      grupoId)
    throw e
  }
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
