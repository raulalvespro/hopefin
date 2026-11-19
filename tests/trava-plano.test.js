// A6.3 (19/11/2026): a trava do plano no app (estadoAssinatura → banner, voz, "Meu plano") tem
// que dar a MESMA resposta que o banco (grupo_pode_lancar / pode_lancar_grupo). As 12 situações
// abaixo são as mesmas de scripts/teste-trava-plano.sql, que o `npm run smoke` roda no banco.
import { describe, it, expect } from 'vitest'
import { estadoAssinatura } from '../src/lib/assinatura.js'

const AGORA = new Date('2026-11-19T12:00:00Z')
const em = (ms) => (ms == null ? null : new Date(AGORA.getTime() + ms).toISOString())
const H = 3600e3, D = 24 * H

// [nome, linha da assinatura (null = grupo antigo sem linha), pode lançar?]
const CASOS = [
  ['sem assinatura (grupo antigo)', null, true],
  ['cortesia (mesmo com status expirado)', { status: 'expired', is_cortesia: true }, true],
  ['ativa', { status: 'active', current_period_end: em(-3 * D) }, true],
  ['ativa, cancela no fim, no prazo', { status: 'active', cancel_at_period_end: true, current_period_end: em(5 * D) }, true],
  ['ativa, cancela no fim, já passou', { status: 'active', cancel_at_period_end: true, current_period_end: em(-H) }, false],
  ['ativa, cancela sem data de fim', { status: 'active', cancel_at_period_end: true, current_period_end: null }, true],
  ['teste grátis no prazo', { status: 'trial', trial_ends_at: em(2 * D) }, true],
  ['teste grátis vencido', { status: 'trial', trial_ends_at: em(-60e3) }, false],
  ['teste grátis sem data de fim', { status: 'trial', trial_ends_at: null }, true],
  ['pagamento pendente', { status: 'past_due', current_period_end: em(10 * D) }, false],
  ['cancelada', { status: 'canceled' }, false],
  ['expirada', { status: 'expired', trial_ends_at: em(-10 * D) }, false],
]

describe('trava do plano: app igual ao banco', () => {
  for (const [nome, linha, pode] of CASOS) {
    it(`${nome} → ${pode ? 'lança' : 'só lê'}`, () => {
      const base = linha && { is_cortesia: false, cancel_at_period_end: false, trial_ends_at: null, current_period_end: null, ...linha }
      const est = estadoAssinatura(base, AGORA)
      expect(est.podeLancar).toBe(pode)
      expect(est.vencida).toBe(!pode)
      // travado sempre explica o porquê no banner (e o "Meu plano" leva pra assinar)
      if (!pode) expect(est.aviso?.severidade).toBe('vencido')
    })
  }
})
