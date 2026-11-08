// Chave liga/desliga do mascote (Joca) e das figurinhas — vem do painel /admin (admin_config via RPC config_mascote).
// Lida uma vez por sessão e compartilhada; se a leitura falhar, o padrão é LIGADO.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

let estado = { mascote: true, figurinhas: true }
let carregada = null
const ouvintes = new Set()

function publicar(novo) {
  estado = { ...estado, ...novo }
  ouvintes.forEach(fn => fn(estado))
}

export function carregarConfigMascote(forcar = false) {
  if (!carregada || forcar) {
    carregada = Promise.resolve(supabase.rpc('config_mascote'))
      .then(({ data }) => { if (data) publicar(data) })
      .catch(() => {})
  }
  return carregada
}

export function atualizarConfigMascote(novo) { publicar(novo) }

export function useMascote() {
  const [v, setV] = useState(estado)
  useEffect(() => {
    ouvintes.add(setV)
    carregarConfigMascote().then(() => setV(estado))
    return () => { ouvintes.delete(setV) }
  }, [])
  return v
}
