import { describe, it, expect } from 'vitest'
import { decidir, resumoSeguro } from '../supabase/functions/asaas-validar-saque/decidir.js'

const estorno = (o = {}) => ({
  type: 'PIX_REFUND',
  pixRefund: {
    id: 'ref-1', payment: 'pay_1', value: 24.9, status: 'AWAITING_REQUEST',
    externalAccount: { name: 'Fulano', cpfCnpj: '00000000000', addressKey: 'x@y.com' }, ...o,
  },
})
const aberto = { id: 'r1', asaas_payment_id: 'pay_1', valor_centavos: 2490, status: 'pendente' }

describe('validação de saque do Asaas', () => {
  it('aprova estorno Pix de reembolso aberto com o mesmo valor', () => {
    expect(decidir(estorno(), [aberto])).toMatchObject({ status: 'APPROVED', reembolsoId: 'r1' })
  })
  it('recusa quando não há reembolso aberto', () => {
    expect(decidir(estorno(), []).status).toBe('REFUSED')
    expect(decidir(estorno(), [{ ...aberto, status: 'feito' }]).status).toBe('REFUSED')
  })
  it('recusa valor diferente (inclusive centavo)', () => {
    expect(decidir(estorno({ value: 24.89 }), [aberto]).status).toBe('REFUSED')
    expect(decidir(estorno({ value: 100 }), [aberto]).status).toBe('REFUSED')
  })
  it('recusa outra cobrança, sem cobrança ou valor inválido', () => {
    expect(decidir(estorno({ payment: 'pay_2' }), [aberto]).status).toBe('REFUSED')
    expect(decidir(estorno({ payment: null }), [aberto]).status).toBe('REFUSED')
    expect(decidir(estorno({ value: 'abc' }), [aberto]).status).toBe('REFUSED')
  })
  it('recusa segundo estorno da mesma cobrança, mas aceita a repetição do mesmo id', () => {
    expect(decidir(estorno(), [aberto], ['ref-0']).status).toBe('REFUSED')
    expect(decidir(estorno(), [aberto], ['ref-1']).status).toBe('APPROVED')
  })
  it('recusa saque, boleto, QR Code, recarga e split', () => {
    for (const type of ['TRANSFER', 'BILL', 'PIX_QR_CODE', 'MOBILE_PHONE_RECHARGE', 'PAYMENT_SPLIT', undefined]) {
      expect(decidir({ type }, [aberto]).status).toBe('REFUSED')
    }
  })
  it('a resposta de recusa traz o motivo', () => {
    expect(decidir({ type: 'TRANSFER' }).refuseReason).toMatch(/não foi pedida/)
  })
  it('o log não guarda conta, CPF nem chave Pix', () => {
    const s = JSON.stringify(resumoSeguro(estorno()))
    expect(s).not.toMatch(/cpfCnpj|00000000000|addressKey|Fulano/)
    expect(resumoSeguro(estorno())).toMatchObject({ payment: 'pay_1', value: 24.9, id: 'ref-1' })
  })
})
