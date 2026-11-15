import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { estadoAssinatura } from '../lib/assinatura'

// Lê a assinatura do grupo logado (uma por grupo, filtrada pela RLS) e deriva o
// estado humano + aviso via estadoAssinatura() (fonte única em lib/assinatura.js),
// que espelha grupo_pode_lancar() do banco. A trava real é no banco (RLS de INSERT).
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

  const est = estadoAssinatura(assinatura)

  return {
    assinatura, loading, recarregar,
    // compat com quem já usa:
    status: est.status, podeLancar: est.podeLancar, vencida: est.vencida,
    emTrial: est.emTrial, diasRestantes: est.diasRestantes,
    cancelaNoFim: est.cancelaNoFim, acessoAte: est.acessoAte,
    // estado rico do plano:
    estado: est.estado, emCortesia: est.emCortesia, ciclo: est.ciclo,
    renovaEm: est.renovaEm, terminaEm: est.terminaEm,
    diasRenova: est.diasRenova, diasTermina: est.diasTermina,
    precoCentavos: est.precoCentavos, aviso: est.aviso,
  }
}
