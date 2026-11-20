import { useEffect, useRef } from 'react'
import { aoMudarDados } from '../lib/cacheLeitura'

// A tela se atualiza sozinha, sem "Carregando", quando a leitura feita por trás trouxe dado
// novo (outro celular, WhatsApp). Ver lib/cacheLeitura.js.
// Uso: useAtualizarSozinho(perfil?.grupo_id ? carregar : null) — carregar({ silencioso: true }).
export function useAtualizarSozinho(recarregar) {
  const ref = useRef(recarregar)
  ref.current = recarregar
  useEffect(() => aoMudarDados(() => {
    try { ref.current?.({ silencioso: true }) } catch (e) { console.error('[atualizar sozinho]', e) }
  }), [])
}
