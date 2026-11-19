// Cobrança do A Receber (A1.15 / A1.16): Pix copia e cola e mensagem do WhatsApp.
import { describe, it, expect } from 'vitest'
import { crc16, pixCopiaECola } from '../src/lib/pix.js'
import { textoCobranca, agruparPorOrigem, rotuloOrigem, pagarAtePadrao } from '../src/lib/cobranca.js'

describe('Pix copia e cola (BR Code)', () => {
  it('bate com o exemplo oficial do Banco Central', () => {
    const p = pixCopiaECola({ chave: '123e4567-e12b-12d1-a456-426655440000', nome: 'Fulano de Tal', cidade: 'BRASILIA' })
    expect(p).toBe('00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D')
  })
  it('com valor, nome com acento e e-mail como chave', () => {
    const p = pixCopiaECola({ chave: ' Raul@Exemplo.com ', nome: 'Raúl Érickson', cidade: 'São Luís', valor: 754.97 })
    expect(p).toContain('0116raul@exemplo.com')
    expect(p).toContain('5406754.97')
    expect(p).toContain('5913Raul Erickson')
    expect(p).toContain('6008Sao Luis')
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)))
  })
  it('sem chave não monta nada', () => {
    expect(pixCopiaECola({ chave: '  ', nome: 'X', cidade: 'Y' })).toBe('')
  })
})

describe('mensagem de cobrança', () => {
  const itens = [
    { tipo: 'parcela', descricao: 'Trinitas ECC', valor: 97, numero: 3, deTotal: 12, dataSaida: '2026-12-07', origem: { tipo: 'cartao', cartaoNome: 'Inter Larissa' } },
    { tipo: 'parcela', descricao: 'Empréstimo', valor: 163.04, numero: 7, deTotal: 10, dataSaida: '2026-12-25', origem: { tipo: 'cartao', cartaoNome: 'Nubank Larissa' } },
    { tipo: 'gasto', descricao: 'Farmácia *urgente*', valor: 40, dataSaida: '2026-12-03', origem: { tipo: 'avista', forma: 'pix' } },
    { tipo: 'manual', descricao: 'Parte da luz', valor: 120, dataSaida: '2026-12-10', origem: { tipo: 'conta_fixa', contaFixaNome: 'Luz' } },
  ]
  it('agrupa por origem, na ordem das datas', () => {
    expect(agruparPorOrigem(itens).map((g) => [g.rotulo, g.total])).toEqual([
      ['Pix', 40], ['Inter Larissa', 97], ['Conta fixa: Luz', 120], ['Nubank Larissa', 163.04],
    ])
    expect(rotuloOrigem({ tipo: 'todo_mes' })).toBe('Todo mês')
    expect(pagarAtePadrao(itens)).toBe('2026-12-25')
  })
  it('texto com negrito do WhatsApp, total, prazo e Pix', () => {
    const t = textoCobranca({ nome: 'Jack Silva', mesNome: 'dezembro', itens, ate: '2026-12-25', pix: '000201XYZ' })
    expect(t.startsWith('Oi, Jack! 👋\nSegue o resumo de *dezembro*:')).toBe(true)
    expect(t).toContain('*Inter Larissa*\n• Trinitas ECC (3/12) — R$')
    expect(t).toContain('• Farmácia urgente — R$') // tira os * que quebrariam o negrito
    expect(t).toMatch(/\*Total: R\$\s420,04\*/)
    expect(t).toContain('Pode me pagar até *25/12*? 🙏')
    expect(t.endsWith('Pix copia e cola:\n000201XYZ')).toBe(true)
  })
})
