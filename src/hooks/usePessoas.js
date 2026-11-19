// Pessoas do grupo ("quem vai me pagar"), da mais usada pra menos usada (A3.3, 19/11/2026).
// Uso = compras dela no último ano + parcelados + valores a receber. Empate: ordem alfabética.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function ordenarPorUso(pessoas, usos) {
  const conta = {}
  for (const id of usos || []) if (id) conta[id] = (conta[id] || 0) + 1
  return [...(pessoas || [])].sort((a, b) => (conta[b.id] || 0) - (conta[a.id] || 0) || a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function usePessoas(grupoId) {
  const [pessoas, setPessoas] = useState([])

  const recarregar = useCallback(async () => {
    if (!grupoId) return
    const umAnoAtras = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)
    const [{ data: ps }, { data: g }, { data: pc }, { data: ar }] = await Promise.all([
      supabase.from('pessoas').select('id, nome').eq('grupo_id', grupoId),
      supabase.from('gastos').select('pessoa_id').eq('grupo_id', grupoId).not('pessoa_id', 'is', null).gte('data', umAnoAtras),
      supabase.from('parcelamentos').select('pessoa_id').eq('grupo_id', grupoId).not('pessoa_id', 'is', null),
      supabase.from('a_receber').select('pessoa_id').eq('grupo_id', grupoId).gte('data', umAnoAtras),
    ])
    setPessoas(ordenarPorUso(ps, [...(g || []), ...(pc || []), ...(ar || [])].map((r) => r.pessoa_id)))
  }, [grupoId])

  useEffect(() => { recarregar() }, [recarregar])

  // Acha (sem diferenciar maiúscula) ou cadastra a pessoa e devolve o id (null se não deu).
  const garantirPessoa = useCallback(async (nome) => {
    const n = String(nome || '').trim().slice(0, 60)
    if (!n || !grupoId) return null
    const existe = pessoas.find((p) => p.nome.toLowerCase() === n.toLowerCase())
    if (existe) return existe.id
    const { data, error } = await supabase.from('pessoas').insert({ grupo_id: grupoId, nome: n }).select('id').single()
    if (error || !data?.id) return null
    await recarregar()
    return data.id
  }, [grupoId, pessoas, recarregar])

  return { pessoas, recarregar, garantirPessoa }
}
