import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Cupom de desconto guardado no grupo (0084): { codigo, desconto_pct } ou null.
// Usado no Meu plano e no checkout pra mostrar o preço que vai ser cobrado.
export function useMeuDesconto() {
  const [desconto, setDesconto] = useState(null)
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('meu_desconto')
    if (error) { console.error('[desconto] meu_desconto:', error.message); return }
    setDesconto(data && data.desconto_pct ? data : null)
  }, [])
  useEffect(() => { carregar() }, [carregar])
  return { desconto, recarregar: carregar }
}
