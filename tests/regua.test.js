// Régua de fim de teste (A6.2): dias, quem recebe e textos (com os preços do banco).
import { describe, it, expect } from 'vitest'
import { tipoDoDia, recebe, conteudoRegua, conteudoAntigo0d, oferta, reais, ddmmSP } from '../supabase/functions/fim-de-trial/regua.js'

const PRECOS = {
  mensal_centavos: 2490, anual_pix_centavos: 19990, anual_cartao_centavos: 23880, anual_cartao_parcela_centavos: 1990,
  lanc_anual_pix_centavos: 14990, lanc_anual_cartao_centavos: 17880, lanc_anual_cartao_parcela_centavos: 1490,
  lancamento_ate: '2027-01-01T02:59:59+00:00', lancamento_ativo: true, trial_dias: 7,
}

describe('dias da régua', () => {
  it('régua de hoje (no ar): 2 dias antes e no último dia', () => {
    expect([3, 2, 1, 0, -1].map((d) => tipoDoDia(d, false))).toEqual([null, 'fim_trial_2d', null, 'fim_trial_0d', null])
  })
  it('régua nova (desligada): 3 dias antes, último dia e 1 dia depois', () => {
    expect([4, 3, 2, 1, 0, -1, -2].map((d) => tipoDoDia(d, true))).toEqual([null, 'fim_trial_3d', null, null, 'fim_trial_0d', 'fim_trial_d1', null])
  })
  it('quem recebe: teste sem cortesia; "1 dia depois" também pro teste já encerrado', () => {
    expect(recebe({ status: 'trial', is_cortesia: false }, 'fim_trial_3d')).toBe(true)
    expect(recebe({ status: 'expired', is_cortesia: false }, 'fim_trial_3d')).toBe(false)
    expect(recebe({ status: 'expired', is_cortesia: false }, 'fim_trial_d1')).toBe(true)
    expect(recebe({ status: 'active', is_cortesia: false }, 'fim_trial_d1')).toBe(false)
    expect(recebe({ status: 'trial', is_cortesia: true }, 'fim_trial_0d')).toBe(false)
    expect(recebe({ status: 'canceled', is_cortesia: false }, 'fim_trial_d1')).toBe(false)
  })
})

describe('textos', () => {
  it('preços vêm do banco e a oferta vale até 31/12 (horário de SP)', () => {
    expect(reais(14990)).toBe('R$ 149,90')
    expect(ddmmSP(PRECOS.lancamento_ate)).toBe('31/12')
    const o = oferta(PRECOS)
    expect(o).toContain('R$ 149,90 no Pix')
    expect(o).toContain('12x de R$ 14,90')
    expect(o).toContain('R$ 24,90')
    expect(oferta({ ...PRECOS, lancamento_ativo: false })).toBe('O Plano Família custa R$ 24,90 por mês, ou R$ 199,90 no ano pagando no Pix.')
  })
  it('cada e-mail da régua nova tem assunto, título, corpo e botão pros planos', () => {
    for (const tipo of ['fim_trial_3d', 'fim_trial_0d', 'fim_trial_d1']) {
      const c = conteudoRegua(tipo, { nome: 'Raul Erickson', fim: '2026-11-23', precos: PRECOS })
      expect(c.assunto.length).toBeGreaterThan(10)
      expect(c.corpo.startsWith('Oi, Raul! ')).toBe(true)
      expect(c.cta.url).toBe('https://app.hopefin.com.br/planos')
    }
    expect(conteudoRegua('fim_trial_3d', { nome: 'Raul', fim: '2026-11-23', precos: PRECOS }).corpo).toContain('no dia 23/11')
    expect(conteudoRegua('fim_trial_d1', { nome: 'Raul', precos: PRECOS }).assunto).toBe('Sentimos sua falta no HopeFin')
  })
  it('nada da oferta antiga (fundador, 14 dias, R$ 19,90/mês)', () => {
    const todos = ['fim_trial_3d', 'fim_trial_0d', 'fim_trial_d1', 'fim_trial_2d']
      .map((t) => JSON.stringify(conteudoRegua(t, { nome: 'Ana', precos: PRECOS }))).join(' ') + JSON.stringify(conteudoAntigo0d('Ana'))
    expect(todos).not.toMatch(/fundador|14 dias|19,90\/m|R\$ 19,90 por m/i)
  })
  it('nome com HTML é escapado', () => {
    expect(conteudoRegua('fim_trial_0d', { nome: '<b>x</b>', precos: PRECOS }).corpo).toContain('Oi, &lt;b&gt;x&lt;/b&gt;!')
  })
  it('régua de hoje continua com o mesmo texto de antes', () => {
    expect(conteudoRegua('fim_trial_2d', { nome: 'Ana' }).assunto).toBe('Seu teste do HopeFin termina em 2 dias')
    expect(conteudoAntigo0d('Ana').assunto).toBe('Seu teste do HopeFin termina hoje')
  })
})
