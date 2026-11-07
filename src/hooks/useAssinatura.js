import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Lê a assinatura do grupo logado (uma por grupo, filtrada pela RLS).
// Espelha a função grupo_pode_lancar() do banco:
//   - sem linha (grupo legado) -> pode lançar
//   - active -> pode lançar
//   - trial válido (não vencido) -> pode lançar
//   - resto (past_due / canceled / expired / trial vencido) -> bloqueado
// A trava real é no banco (RLS restritiva de INSERT); aqui é só para a UX.
export function useAssinatura() {
  const [assinatura, setAssinatura] = useState(null)
  const [loading, setLoading] = useState(true)

  const recarregar = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .maybeSingle()
    if (error) console.error('[useAssinatura] erro ao carregar:', error.message)
    setAssinatura(data ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { recarregar() }, [recarregar])

  const status = assinatura?.status ?? null
  const fimTrial = assinatura?.trial_ends_at ? new Date(assinatura.trial_ends_at) : null
  const trialValido = status === 'trial' && (!fimTrial || fimTrial > new Date())

  // Dias inteiros restantes de trial (0 quando já venceu ou não há trial).
  const diasRestantes = fimTrial
    ? Math.max(0, Math.ceil((fimTrial - new Date()) / 86400000))
    : null

  // Cancelada pelo usuário: o acesso vai até o fim do período já pago (espelha o banco).
  const cancelaNoFim = !!assinatura?.cancel_at_period_end && status === 'active'
  const fimPeriodo = assinatura?.current_period_end ? new Date(assinatura.current_period_end) : null
  const ativaPaga = status === 'active' && (!cancelaNoFim || !fimPeriodo || fimPeriodo > new Date())

  const podeLancar = !assinatura
    ? true
    : ativaPaga || trialValido

  const vencida = !!assinatura && !podeLancar

  return {
    assinatura, status, loading, recarregar,
    podeLancar, vencida, emTrial: trialValido, diasRestantes,
    cancelaNoFim, acessoAte: cancelaNoFim ? fimPeriodo : null,
  }
}
