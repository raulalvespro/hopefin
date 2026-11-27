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
let pediuClique = false // a Cloudflare mostrou o quadrinho "Confirme que é humano" e ninguém marcou ainda
// 27/11: a verificação deu erro ("Falha na verificação" no quadrinho). Antes o login esperava 15 s + 20 s por um passe
// que não vinha e o botão ficava em "Entrando…". Agora responde na hora e a tela pede pra recarregar.
let falhou = false
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
  pediuClique = false
  falhou = false
  const fila = esperando; esperando = []
  fila.forEach((r) => r(t))
}

// O passe atual (espera até `ms` se ainda estiver sendo gerado). Sem Turnstile ligado: undefined.
// 27/11: 8 s era pouco em celular/rede lenta — o login saía sem passe e a tela dizia "senha errada".
export async function pegarToken(ms = 15000) {
  if (!turnstileLigado) return undefined
  if (token) return token
  if (falhou || pediuClique) return undefined // não vem passe sozinho: a tela tem que avisar já
  return new Promise((resolve) => {
    esperando.push(resolve)
    setTimeout(() => resolve(token || undefined), ms)
  })
}

// O Supabase recusou por falta/erro do passe (não é senha errada).
export function ehErroCaptcha(error) {
  if (!error) return false
  return error.code === 'captcha_failed' || /captcha/i.test(String(error.message || ''))
}

// A verificação da Cloudflare deu erro neste navegador (não é falta de marcar o quadrinho).
export function ehCaptchaFalhou(error) {
  return /verificacao_falhou/.test(String(error?.message || ''))
}

// Chama o Supabase com o passe; se ele recusar SÓ pelo passe, pede um novo e tenta mais uma vez.
// `chamar(opcoes)` recebe { captchaToken } (ou {}) e devolve { data, error } do supabase-js.
export async function comCaptcha(chamar) {
  // Sem passe e a Cloudflare parou pra pedir o quadrinho (ou deu erro): nem manda (o Supabase recusaria e seriam
  // ~35 s de "Entrando…" pra nada). Vale também quando o quadrinho aparece DEPOIS do clique, enquanto espera o passe.
  const semPasse = () => {
    if (!turnstileLigado || token) return null
    if (falhou) return { data: null, error: { code: 'captcha_failed', message: 'captcha: verificacao_falhou' } }
    if (pediuClique) return { data: null, error: { code: 'captcha_failed', message: 'captcha: marque o quadrinho' } }
    return null
  }
  const antes = semPasse()
  if (antes) return antes
  const opcoes = await opcoesCaptcha()
  const depois = !opcoes.captchaToken && semPasse()
  if (depois) return depois
  let r = await chamar(opcoes)
  renovarToken()
  if (turnstileLigado && ehErroCaptcha(r?.error)) {
    const t = await pegarToken(20000)
    if (t) { r = await chamar({ captchaToken: t }); renovarToken() }
  }
  return r
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
        'before-interactive-callback': () => {
          pediuClique = true
          const fila = esperando; esperando = []
          fila.forEach((r) => r(undefined)) // quem esperava o passe fica sabendo já que precisa do clique
        },
        'after-interactive-callback': () => { pediuClique = false },
        'expired-callback': () => { token = null },
        'timeout-callback': () => { token = null; try { window.turnstile.reset(widgetId) } catch { /* saiu */ } },
        'error-callback': () => {
          token = null; falhou = true
          const fila = esperando; esperando = []
          fila.forEach((r) => r(undefined)) // quem esperava o passe recebe "sem passe" agora, não daqui a 15 s
          return false // deixa a Cloudflare tentar de novo sozinha (se der certo, receber() limpa o "falhou")
        },
      })
    }).catch(() => { /* sem internet pra Cloudflare: o Supabase avisa no envio */ })
    return () => {
      vivo = false
      try { if (window.turnstile && widgetId != null) window.turnstile.remove(widgetId) } catch { /* já saiu */ }
      widgetId = null; token = null; pediuClique = false; falhou = false
    }
  }, [])
  if (!turnstileLigado) return null
  // Fica DENTRO do formulário, logo acima do botão: se a Cloudflare pedir o quadrinho, a pessoa vê.
  return createElement('div', { ref, className: 'hf-turnstile', style: { display: 'flex', justifyContent: 'center', width: '100%' } })
}
