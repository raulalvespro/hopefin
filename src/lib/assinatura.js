import { fmt, fmtData } from './format'

// Fonte única do estado da assinatura do grupo, para o app todo (hook useAssinatura,
// banner do topo, central de alertas e a tela "Meu plano"). Função pura: recebe a
// linha de subscriptions e o "agora", devolve o estado humano + o aviso a mostrar.
//
// Espelha grupo_pode_lancar() do banco:
//   - sem linha (grupo legado) -> pode lançar
//   - cortesia (is_cortesia)   -> pode lançar (sem cobrança, indeterminado)
//   - active (não cancelada/no prazo) -> pode lançar
//   - trial válido (não vencido) -> pode lançar
//   - resto (past_due / expired / canceled / trial vencido) -> bloqueado
// A trava real é no banco (RLS restritiva de INSERT); aqui é só UX.

const AVISO_DIAS = 7   // janela do heads-up de renovação (ativa) e de fim (cancelada)
const TRIAL_DIAS = 5   // janela do aviso de fim de trial (mantém o comportamento atual)

const diasAte = (d, now) => (d ? Math.max(0, Math.ceil((d - now) / 86400000)) : null)
const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`

export function estadoAssinatura(a, now = new Date()) {
  if (!a) {
    return {
      estado: 'sem_assinatura', emCortesia: false, status: null, ciclo: null,
      podeLancar: true, vencida: false, emTrial: false,
      diasRestantes: null, cancelaNoFim: false, acessoAte: null,
      renovaEm: null, terminaEm: null, diasRenova: null, diasTermina: null,
      precoCentavos: null, aviso: null,
    }
  }

  const emCortesia = !!a.is_cortesia
  const status = a.status ?? null
  const ciclo = a.ciclo ?? null
  const fimTrial = a.trial_ends_at ? new Date(a.trial_ends_at) : null
  const fimPeriodo = a.current_period_end ? new Date(a.current_period_end) : null
  const cancelaNoFim = !!a.cancel_at_period_end && status === 'active'
  const trialValido = status === 'trial' && (!fimTrial || fimTrial > now)
  const ativaPaga = status === 'active' && (!cancelaNoFim || !fimPeriodo || fimPeriodo > now)

  // Estado "humano" (cortesia tem prioridade, como no banco). Cancelada só enquanto o período pago
  // não acabou; depois disso já está travada (até a rotina diária marcar como encerrada no banco) —
  // antes o banner dizia "Seu acesso termina hoje" com os lançamentos já bloqueados (A6.3).
  let estado
  if (emCortesia) estado = 'cortesia'
  else if (cancelaNoFim && ativaPaga) estado = 'cancelada'
  else if (ativaPaga) estado = 'ativa'
  else if (status === 'past_due') estado = 'pendente'
  else if (trialValido) estado = 'trial'
  else estado = 'encerrada' // trial vencido / expired / canceled

  const podeLancar = emCortesia || ativaPaga || trialValido
  const vencida = !podeLancar

  const renovaEm = estado === 'ativa' ? fimPeriodo : null
  const terminaEm = estado === 'cancelada' ? fimPeriodo : estado === 'trial' ? fimTrial : null
  const diasRestantes = diasAte(fimTrial, now) // compat (trial)
  const diasRenova = diasAte(renovaEm, now)
  const diasTermina = diasAte(terminaEm, now)
  const precoCentavos = a.preco_centavos ?? null
  const precoTxt = precoCentavos ? fmt(precoCentavos / 100) : null

  // Aviso a mostrar no banner/central (null = nada). severidade: 'vencido' | 'vence' | 'info'.
  let aviso = null
  if (estado === 'encerrada') {
    const foiTrial = status === 'trial' || status === 'expired'
    aviso = {
      chave: 'assin-encerrada', severidade: 'vencido',
      titulo: foiTrial ? 'Seu teste grátis acabou' : 'Assinatura vencida',
      texto: 'Você ainda vê e exporta tudo, mas novos lançamentos estão bloqueados. Toque para assinar.',
    }
  } else if (estado === 'pendente') {
    aviso = {
      chave: 'assin-pendente', severidade: 'vencido',
      titulo: 'Pagamento pendente',
      texto: 'Regularize para manter os lançamentos liberados. Toque para resolver.',
    }
  } else if (estado === 'trial' && diasRestantes != null && diasRestantes <= TRIAL_DIAS) {
    aviso = {
      chave: `assin-trial-${diasRestantes}`, severidade: 'vence',
      titulo: diasRestantes === 0 ? 'Seu teste grátis termina hoje' : `Seu teste grátis termina em ${plural(diasRestantes, 'dia')}`,
      texto: 'Garanta o preço de lançamento antes de acabar.',
    }
  } else if (estado === 'cancelada' && diasTermina != null && diasTermina <= AVISO_DIAS) {
    aviso = {
      chave: `assin-cancelada-${diasTermina}`, severidade: 'vence',
      titulo: diasTermina === 0 ? 'Seu acesso termina hoje' : `Seu acesso termina em ${plural(diasTermina, 'dia')}`,
      texto: terminaEm ? `A partir de ${fmtData(terminaEm)} os novos lançamentos ficam bloqueados. Toque para reativar.` : 'Toque para reativar antes de acabar.',
    }
  } else if (estado === 'ativa' && diasRenova != null && diasRenova <= AVISO_DIAS) {
    const quando = diasRenova === 0 ? 'hoje' : diasRenova === 1 ? 'amanhã' : `em ${plural(diasRenova, 'dia')}`
    aviso = {
      chave: `assin-renova-${diasRenova}`, severidade: 'info',
      titulo: `Sua assinatura renova ${quando}`,
      texto: precoTxt
        ? `Vai renovar por ${precoTxt}${ciclo === 'anual' ? ' (anual)' : ' (mensal)'}. Deixe seu pagamento em dia.`
        : 'Deixe seu pagamento em dia para não perder o acesso.',
    }
  }

  return {
    estado, emCortesia, status, ciclo,
    podeLancar, vencida, emTrial: trialValido, diasRestantes,
    cancelaNoFim, acessoAte: cancelaNoFim ? fimPeriodo : null,
    renovaEm, terminaEm, diasRenova, diasTermina,
    precoCentavos, aviso,
  }
}
