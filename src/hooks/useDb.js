import { useCallback } from 'react'
import { useToast } from '../contexts/ToastContext'

/**
 * Executa uma operação do Supabase tratando o erro com um toast.
 * Uso:
 *   const run = useDb()
 *   const { data, error } = await run(supabase.from('x').insert(...), { ok: 'Salvo' })
 *   if (error) return   // mantém o modal aberto, não limpa o form
 *
 * Nunca lança: sempre retorna { data, error }.
 */
export function useDb() {
  const { toast } = useToast()
  return useCallback(async (operacao, { ok, erro = 'Não foi possível concluir' } = {}) => {
    try {
      const res = await operacao
      if (res?.error) {
        console.error('[HopeFin]', erro, res.error)
        toast(`${erro}. Tente de novo.`, 'erro')
        return res
      }
      if (ok) toast(ok, 'ok')
      return res
    } catch (e) {
      console.error('[HopeFin]', erro, e)
      toast(`${erro}. Verifique sua conexão.`, 'erro')
      return { data: null, error: e }
    }
  }, [toast])
}
