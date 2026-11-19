// A5.2 (19/11/2026): microfone — avisos em vez de silêncio e dica do iPhone.
import { describe, it, expect } from 'vitest'
import { motivoErroVoz, ehIosInstalado, ondeLiberarMic } from '../src/hooks/useVoz.js'
import { copy } from '../src/copy/pt-BR.js'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const janela = (standalone) => ({ matchMedia: (q) => ({ matches: standalone && q.includes('standalone') }) })

describe('erro do microfone vira aviso', () => {
  it('cada erro do navegador tem um motivo com texto', () => {
    expect(motivoErroVoz('not-allowed')).toBe('bloqueado')
    expect(motivoErroVoz('service-not-allowed')).toBe('bloqueado')
    expect(motivoErroVoz('no-speech')).toBe('semFala')
    expect(motivoErroVoz('audio-capture')).toBe('semMicrofone')
    expect(motivoErroVoz('network')).toBe('semInternet')
    expect(motivoErroVoz('language-not-supported')).toBe('falhou')
    for (const m of ['bloqueado', 'semFala', 'semMicrofone', 'semInternet', 'falhou']) {
      expect(copy.voz.erroMic[m]).toBeTruthy()
    }
  })
  it('parar ou fechar (aborted) não mostra aviso', () => {
    expect(motivoErroVoz('aborted')).toBe(null)
  })
})

describe('onde a pessoa está (pra explicar como liberar)', () => {
  it('iPhone com o app instalado', () => {
    expect(ehIosInstalado({ userAgent: IPHONE, standalone: true }, janela(false))).toBe(true)
    expect(ehIosInstalado({ userAgent: IPHONE }, janela(true))).toBe(true)
    expect(ondeLiberarMic({ userAgent: IPHONE, standalone: true }, janela(true))).toBe('iosApp')
  })
  it('iPhone no Safari (sem instalar)', () => {
    expect(ehIosInstalado({ userAgent: IPHONE, standalone: false }, janela(false))).toBe(false)
    expect(ondeLiberarMic({ userAgent: IPHONE, standalone: false }, janela(false))).toBe('iosSafari')
  })
  it('iPad que se apresenta como Mac', () => {
    const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }
    expect(ondeLiberarMic(ipad, janela(false))).toBe('iosSafari')
    expect(ondeLiberarMic({ ...ipad, standalone: true }, janela(true))).toBe('iosApp')
  })
  it('Android instalado ou computador não é iPhone', () => {
    expect(ehIosInstalado({ userAgent: ANDROID }, janela(true))).toBe(false)
    expect(ondeLiberarMic({ userAgent: ANDROID }, janela(true))).toBe('outro')
    expect(ondeLiberarMic({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 0 }, janela(false))).toBe('outro')
  })
  it('sem navegador (servidor) não quebra', () => {
    expect(ehIosInstalado(null, null)).toBe(false)
  })
})
