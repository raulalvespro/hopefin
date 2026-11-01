import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// Fallback mínimo caso o grupo ainda não tenha categorias semeadas
const FALLBACK = [
  { nome: 'mercado', emoji: '🛒', ordem: 1 },
  { nome: 'transporte', emoji: '⛽', ordem: 2 },
  { nome: 'outros', emoji: '📦', ordem: 99 },
]

/**
 * Fonte única de categorias do grupo.
 * Retorna { categorias, loading, emojiDe, recarregar }.
 */
export function useCategorias() {
  const { perfil } = useAuth()
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)

  const recarregar = useCallback(async () => {
    if (!perfil?.grupo_id) return
    const { data } = await supabase
      .from('categorias')
      .select('*')
      .eq('grupo_id', perfil.grupo_id)
      .eq('ativo', true)
      .order('ordem')
    setCategorias(data && data.length ? data : FALLBACK)
    setLoading(false)
  }, [perfil])

  useEffect(() => { recarregar() }, [recarregar])

  const emojiDe = useCallback(
    nome => categorias.find(c => c.nome === nome)?.emoji || '📦',
    [categorias]
  )

  return { categorias, loading, emojiDe, recarregar }
}
