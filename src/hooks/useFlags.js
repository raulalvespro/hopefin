import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Flags de funcionalidade do app do usuário. O /admin (Área de desenvolvimento)
// define a audiência de cada uma (só eu / todos); aqui o app só pergunta "o que
// EU posso ver". Retorna null enquanto carrega e um objeto { chave: true } depois.
// Enquanto null, as telas devem esconder o que é opcional (sem flash).
// SÓ no computador (npm run dev), pra testar uma funcionalidade nova com a conta de teste:
// localStorage 'hf_flags_teste' = 'busca_filtros,outra'. No app publicado isto nem existe
// (import.meta.env.DEV é falso e o código some no build).
function flagsDeTeste() {
  if (!import.meta.env.DEV) return {}
  try {
    return Object.fromEntries((localStorage.getItem('hf_flags_teste') || '').split(',').map((s) => s.trim()).filter(Boolean).map((k) => [k, true]))
  } catch { return {} }
}

export function useFlags() {
  const [flags, setFlags] = useState(null)
  useEffect(() => {
    let vivo = true
    supabase.rpc('minhas_flags')
      .then(({ data }) => { if (vivo) setFlags({ ...(data || {}), ...flagsDeTeste() }) })
      .catch(() => { if (vivo) setFlags(flagsDeTeste()) })
    return () => { vivo = false }
  }, [])
  return flags
}
