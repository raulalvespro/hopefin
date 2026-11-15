import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Flags de funcionalidade do app do usuário. O /admin (Área de desenvolvimento)
// define a audiência de cada uma (só eu / todos); aqui o app só pergunta "o que
// EU posso ver". Retorna null enquanto carrega e um objeto { chave: true } depois.
// Enquanto null, as telas devem esconder o que é opcional (sem flash).
export function useFlags() {
  const [flags, setFlags] = useState(null)
  useEffect(() => {
    let vivo = true
    supabase.rpc('minhas_flags')
      .then(({ data }) => { if (vivo) setFlags(data || {}) })
      .catch(() => { if (vivo) setFlags({}) })
    return () => { vivo = false }
  }, [])
  return flags
}
