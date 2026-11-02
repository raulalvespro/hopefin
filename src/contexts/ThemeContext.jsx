import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const ThemeContext = createContext(null)
const KEY = 'hopefin_tema'          // 'auto' | 'light' | 'dark'
const META_CLARO = '#10b981'
const META_ESCURO = '#0b1120'

function lerTema() {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch { /* ignore */ }
  return 'auto'
}

function sistemaEscuro() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function ThemeProvider({ children }) {
  const [tema, setTemaState] = useState(lerTema)

  const aplicar = useCallback((t) => {
    const root = document.documentElement
    if (t === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', t)
    const escuro = t === 'dark' || (t === 'auto' && sistemaEscuro())
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', escuro ? META_ESCURO : META_CLARO)
  }, [])

  useEffect(() => { aplicar(tema) }, [tema, aplicar])

  // No modo automático, acompanha a mudança de tema do sistema (para a cor da barra)
  useEffect(() => {
    if (tema !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => aplicar('auto')
    mq.addEventListener?.('change', handler)
    return () => mq.removeEventListener?.('change', handler)
  }, [tema, aplicar])

  const setTema = useCallback((t) => {
    setTemaState(t)
    try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
  }, [])

  return (
    <ThemeContext.Provider value={{ tema, setTema }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTema = () => useContext(ThemeContext)
