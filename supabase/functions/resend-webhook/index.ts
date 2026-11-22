// resend-webhook — o Resend avisa o que aconteceu com cada e-mail (22/11/2026, E-mails automáticos).
// Eventos usados: email.delivered, email.opened, email.clicked, email.bounced, email.complained.
// Marca em email_log (pelo resend_id) quando foi entregue, aberto e clicado. "Marcou como spam" =
// a pessoa sai na hora das novidades/remarketing (usuarios.recebe_comunicados = false).
//
// Segurança: o Resend assina cada aviso (padrão Svix). Conferimos a assinatura com o segredo
// RESEND_WEBHOOK_SECRET (começa com "whsec_", vem do painel do Resend → Webhooks) e recusamos
// aviso com mais de 5 minutos. Deploy com --no-verify-jwt (quem chama é o Resend, sem login).
import { createClient } from 'npm:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const SEGREDO = Deno.env.get('RESEND_WEBHOOK_SECRET') || ''
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function bytesParaBase64(b: Uint8Array): string {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s)
}
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

async function assinaturaValida(id: string, ts: string, corpo: string, cabecalho: string): Promise<boolean> {
  if (!SEGREDO || !id || !ts || !cabecalho) return false
  const agora = Math.floor(Date.now() / 1000)
  if (!/^\d+$/.test(ts) || Math.abs(agora - Number(ts)) > 300) return false
  const chave = await crypto.subtle.importKey('raw', base64ParaBytes(SEGREDO.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`${id}.${ts}.${corpo}`)))
  const esperada = bytesParaBase64(sig)
  return cabecalho.split(' ').some((parte) => {
    const [versao, valor] = parte.split(',')
    return versao === 'v1' && !!valor && iguais(valor, esperada)
  })
}

const CAMPO: Record<string, string> = {
  'email.delivered': 'entregue_em',
  'email.opened': 'aberto_em',
  'email.clicked': 'clicado_em',
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  const corpo = await req.text()
  const ok = await assinaturaValida(req.headers.get('svix-id') || '', req.headers.get('svix-timestamp') || '', corpo, req.headers.get('svix-signature') || '')
  if (!ok) return json({ erro: 'assinatura inválida' }, 401)

  let ev: { type?: string; created_at?: string; data?: { email_id?: string } }
  try { ev = JSON.parse(corpo) } catch { return json({ erro: 'json inválido' }, 400) }
  const tipo = String(ev?.type || '')
  const resendId = String(ev?.data?.email_id || '')
  if (!resendId) return json({ ok: true, ignorado: 'sem email_id' })
  const quando = ev?.created_at && !isNaN(Date.parse(ev.created_at)) ? new Date(ev.created_at).toISOString() : new Date().toISOString()

  const { data: linha } = await admin.from('email_log')
    .select('id, titular_id, entregue_em, aberto_em, clicado_em').eq('resend_id', resendId).maybeSingle()
  if (!linha) return json({ ok: true, ignorado: 'e-mail não registrado' }) // ex.: comunicado, alerta interno

  const campo = CAMPO[tipo]
  if (campo) {
    const mudar: Record<string, string> = {}
    // Só a primeira vez conta. Clique também conta como aberto (alguns e-mails bloqueiam a imagem de abertura).
    if (!(linha as Record<string, unknown>)[campo]) mudar[campo] = quando
    if (campo === 'clicado_em' && !linha.aberto_em) mudar.aberto_em = quando
    if ((campo === 'aberto_em' || campo === 'clicado_em') && !linha.entregue_em) mudar.entregue_em = quando
    if (Object.keys(mudar).length) await admin.from('email_log').update(mudar).eq('id', linha.id)
    return json({ ok: true })
  }

  if (tipo === 'email.bounced' || tipo === 'email.complained') {
    const problema = tipo === 'email.bounced' ? 'devolvido' : 'spam'
    await admin.from('email_log').update({ problema, problema_em: quando }).eq('id', linha.id)
    if (problema === 'spam' && linha.titular_id) {
      await admin.from('usuarios').update({ recebe_comunicados: false }).eq('id', linha.titular_id)
      await admin.from('remarketing_pessoas').update({ status: 'saiu', status_em: new Date().toISOString() })
        .eq('usuario_id', linha.titular_id).in('status', ['ativo', 'pausado'])
    }
    return json({ ok: true })
  }

  return json({ ok: true, ignorado: tipo })
})
