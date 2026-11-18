// Ponte do app para o motor único de cálculo (supabase/functions/_shared/motor.js).
// O app e as Edge Functions (e-mails, avisos) usam exatamente o mesmo código.
import { supabase } from './supabase'
import { carregarDadosMotor } from '@motor/motor-dados.js'

export * from '@motor/motor.js'

// Carrega os dados do grupo para as competências [compIni, compFim].
export function carregarMotor(grupoId, opcoes) {
  return carregarDadosMotor(supabase, grupoId, opcoes)
}

// Cria os lançamentos dos próximos meses das séries (entradas recorrentes e a receber
// que repetem). Idempotente; roda uma vez por sessão.
let seriesGarantidas = false
export async function garantirSeries() {
  if (seriesGarantidas) return
  seriesGarantidas = true
  const { error } = await supabase.rpc('garantir_series')
  if (error) { seriesGarantidas = false; console.error('[motor] garantir_series:', error.message) }
}

// Nome do mês por extenso a partir de 'YYYY-MM'.
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const nomeMes = (comp) => MESES[Number(String(comp).slice(5, 7)) - 1] || comp
export const nomeMesCurto = (comp) => nomeMes(comp).slice(0, 3)
