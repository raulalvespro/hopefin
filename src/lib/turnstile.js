// Cloudflare Turnstile — o "não sou um robô" invisível no login, cadastro, reenvio e "esqueci a senha" (L39).
//
// Como funciona: a tela mostra <Turnstile /> (fica invisível; só aparece um quadradinho se a Cloudflare
// desconfiar). Ele gera um "passe" (token) de uso único. login/cadastrar/reenviar/recuperar pegam esse passe
// com pegarToken() e mandam pro Supabase (captchaToken), que confere com a chave secreta.
//
// Ligar: VITE_TURNSTILE_SITE_KEY no .env (chave pública do widget) → publicar o app → SÓ DEPOIS ligar a
// proteção no Supabase (Auth › Attack Protection › captcha Turnstile + chave secreta). Na ordem contrária
// ninguém consegue entrar. Sem a chave no .env, nada disso aparece e o app segue como antes.
import { createElement, useEffect, useRef } from 'react'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
export const turnstileLigado = !!SITE_KEY

let token = null
let esperando = []
let widgetId = null
let carregando = null

function carregarScript() {
  if (window.turnstile) return Promise.resolve()
  if (carregando) return carregando
  carregando = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { carregando = null; reject(new Error('turnstile_nao_carregou')) }
    document.head.appendChild(s)
  })
  return carregando
}

function receber(t) {
  token = t
  const fila = esperando; esperando = []
  fila.forEach((r) => r(t))
}

// O passe atual (espera até 8 s se ainda estiver sendo gerado). Sem Turnstile ligado: undefined.
export async function pegarToken() {
  if (!turnstileLigado) return undefined
  if (token) return token
  return new Promise((resolve) => {
    esperando.push(resolve)
    setTimeout(() => resolve(token || undefined), 8000)
  })
}

// Depois de usar: o passe vale uma vez só — pede outro.
export function renovarToken() {
  if (!turnstileLigado) return
  token = null
  try { if (window.turnstile && widgetId != null) window.turnstile.reset(widgetId) } catch { /* sem widget na tela */ }
}

// Opções prontas pro Supabase: { captchaToken } quando ligado.
export async function opcoesCaptcha() {
  const t = await pegarToken()
  return t ? { captchaToken: t } : {}
}

export function Turnstile() {
  const ref = useRef(null)
  useEffect(() => {
    if (!turnstileLigado) return
    let vivo = true
    carregarScript().then(() => {
      if (!vivo || !ref.current || !window.turnstile) return
      token = null
      widgetId = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        appearance: 'interaction-only',
        language: 'pt-br',
        'refresh-expired': 'auto',
        callback: receber,
        'expired-callback': () => { token = null },
        'error-callback': () => { token = null },
      })
    }).catch(() => { /* sem internet pra Cloudflare: o Supabase avisa no envio */ })
    return () => {
      vivo = false
      try { if (window.turnstile && widgetId != null) window.turnstile.remove(widgetId) } catch { /* já saiu */ }
      widgetId = null; token = null
    }
  }, [])
  if (!turnstileLigado) return null
  return createElement('div', { ref, style: { display: 'flex', justifyContent: 'center', marginTop: 8 } })
}
