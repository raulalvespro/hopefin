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

// Última resposta, pra tela já abrir com as chaves certas (sem o botão "aparecer depois").
// Some ao sair da conta. A cada tela nova pergunta de novo por trás (pega mudança do /admin).
let ultimasFlags = null
supabase.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') ultimasFlags = null })

export function useFlags() {
  const [flags, setFlags] = useState(ultimasFlags)
  useEffect(() => {
    let vivo = true
    supabase.rpc('minhas_flags')
      .then(({ data, error }) => {
        if (error) { if (vivo) setFlags(ultimasFlags ?? flagsDeTeste()); return }
        ultimasFlags = { ...(data || {}), ...flagsDeTeste() }
        if (vivo) setFlags(ultimasFlags)
      })
      .catch(() => { if (vivo) setFlags(ultimasFlags ?? flagsDeTeste()) })
    return () => { vivo = false }
  }, [])
  return flags
}

// Microfone do app (A8.26, chave lancar_voz, nasce pra todos). Enquanto as chaves carregam, mostra (é o normal);
// some só quando a resposta chega sem a chave (o Raul trocou a audiência no painel).
export const vozLigada = (flags) => flags === null || !!flags?.lancar_voz
