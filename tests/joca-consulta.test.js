// Joca parte 2 (A8.23, 26/11/2026): perguntas com os números do app. A IA só diz o que a pessoa
// quer saber (limparConsulta); o número vem do motor (consulta.js). Dados de mentira em
// tests/joca-casos.json › contexto.dados (os mesmos da bateria com a IA de verdade).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { limparIA, limparConsulta, instrucoesIA, TEXTOS } from '../supabase/functions/whatsapp-webhook/joca.js'
import { calcularConsulta, responderConsulta, janelaConsulta, nomeMes } from '../supabase/functions/whatsapp-webhook/consulta.js'

const { contexto: CTX } = JSON.parse(readFileSync(new URL('./joca-casos.json', import.meta.url), 'utf8'))
const H = CTX.hoje // 2026-11-26
const D = CTX.dados
const [NU, , IN] = CTX.cartoes.map((c) => c.id)
const ctx = { hoje: H, categorias: CTX.categorias, cartoes: CTX.cartoes }

describe('limparConsulta (o que a IA mandou)', () => {
  it('tipo desconhecido ou sem consulta = null (vira a resposta padrão)', () => {
    expect(limparConsulta(null, ctx)).toBe(null)
    expect(limparConsulta({ tipo: 'investir' }, ctx)).toBe(null)
  })
  it('mês: sem mês ou inválido = mês atual; futuro distante e muito antigo também', () => {
    expect(limparConsulta({ tipo: 'sobra' }, ctx).mes).toBe('2026-11')
    expect(limparConsulta({ tipo: 'sobra', mes: '2026-10' }, ctx).mes).toBe('2026-10')
    expect(limparConsulta({ tipo: 'sobra', mes: '2026-12' }, ctx).mes).toBe('2026-12')
    expect(limparConsulta({ tipo: 'sobra', mes: '2027-05' }, ctx).mes).toBe('2026-11')
    expect(limparConsulta({ tipo: 'sobra', mes: '2020-01' }, ctx).mes).toBe('2026-11')
    expect(limparConsulta({ tipo: 'sobra', mes: '2026-13' }, ctx).mes).toBe('2026-11')
  })
  it('categoria só das do grupo; termo só quando não é categoria', () => {
    expect(limparConsulta({ tipo: 'gasto', categoria: 'mercado', termo: 'extra' }, ctx)).toMatchObject({ categoria: 'mercado', termo: null })
    expect(limparConsulta({ tipo: 'gasto', categoria: 'inventada', termo: 'uber' }, ctx)).toMatchObject({ categoria: null, termo: 'uber' })
  })
  it('cartão só da lista; "falta pagar do Nubank" vira a fatura do Nubank', () => {
    expect(limparConsulta({ tipo: 'fatura', cartao_id: 'xyz' }, ctx).cartao_id).toBe(null)
    expect(limparConsulta({ tipo: 'falta_pagar', cartao_id: NU }, ctx)).toMatchObject({ tipo: 'fatura', cartao_id: NU })
    expect(limparConsulta({ tipo: 'falta_pagar', cartao_id: 'xyz' }, ctx)).toMatchObject({ tipo: 'falta_pagar', cartao_id: null })
  })
  it('limparIA só leva a consulta em "pergunta"', () => {
    expect(limparIA({ acao: 'pergunta', consulta: { tipo: 'sobra' } }, ctx).consulta).toMatchObject({ tipo: 'sobra', mes: '2026-11' })
    expect(limparIA({ acao: 'lancar', valor: 10, consulta: { tipo: 'sobra' } }, ctx).consulta).toBe(null)
  })
  it('as instruções dizem que a IA nunca escreve número', () => {
    expect(instrucoesIA({ hoje: H, semana: 'quinta', categorias: CTX.categorias })).toMatch(/NUNCA escreve número/)
  })
})

describe('números do app (motor) nas respostas', () => {
  it('gasto por categoria: só o que é seu (o mercado da Jack fica fora)', () => {
    const x = calcularConsulta({ tipo: 'gasto', categoria: 'mercado', mes: '2026-11' }, D, H)
    expect(x.total).toBe(450)
    expect(x.qtd).toBe(2)
    expect(responderConsulta({ tipo: 'gasto', categoria: 'mercado', mes: '2026-11' }, D, H)).toContain('*R$ 450,00* com Mercado')
  })
  it('gasto por termo, sem acento e sem maiúscula', () => {
    expect(calcularConsulta({ tipo: 'gasto', termo: 'UBER', mes: '2026-11' }, D, H).total).toBe(53.5)
    expect(calcularConsulta({ tipo: 'gasto', termo: 'farmacia', mes: '2026-11' }, D, H).total).toBe(48.9)
    expect(calcularConsulta({ tipo: 'gasto', termo: 'uber', mes: '2026-10' }, D, H).total).toBe(40)
  })
  it('gasto total do mês e nada encontrado', () => {
    expect(calcularConsulta({ tipo: 'gasto', mes: '2026-11' }, D, H).total).toBe(2578.3)
    expect(responderConsulta({ tipo: 'gasto', termo: 'padaria', mes: '2026-11' }, D, H)).toMatch(/não achei nenhum gasto com "padaria"/)
  })
  it('falta pagar = "a pagar" do Início', () => {
    const x = calcularConsulta({ tipo: 'falta_pagar', mes: '2026-11' }, D, H)
    expect(x.total).toBe(200)
    expect(responderConsulta({ tipo: 'falta_pagar', mes: '2026-11' }, D, H)).toContain('• Luz · R$ 200,00 · vence 28/11')
    expect(responderConsulta({ tipo: 'falta_pagar', mes: '2026-10' }, D, H)).toMatch(/tudo pago/)
  })
  it('fatura do cartão: a pagar e a aberta, iguais a Cartões', () => {
    expect(responderConsulta({ tipo: 'fatura', cartao_id: IN }, D, H)).toContain('A pagar: *R$ 280,00* · vence 05/12')
    const nu = responderConsulta({ tipo: 'fatura', cartao_id: NU }, D, H)
    expect(nu).toContain('Nenhuma fatura fechada esperando pagamento')
    expect(nu).toContain('Aberta (fecha 03/12, vence 10/12): *R$ 115,90*')
    expect(responderConsulta({ tipo: 'fatura', cartao_id: null }, D, H)).toMatch(/De qual cartão\?/)
  })
  it('sobra = "Vai sobrar no fim do mês" do Início; mês passado no passado', () => {
    const x = calcularConsulta({ tipo: 'sobra', mes: '2026-11' }, D, H)
    expect(x).toMatchObject({ sobra: 3341.7, entra: 5920, sai: 2578.3, dias: 5 })
    expect(responderConsulta({ tipo: 'sobra', mes: '2026-10' }, D, H)).toContain('Em outubro sobrou *R$ 2.914,10*')
  })
  it('entradas: o que entrou e o que falta entrar (com o A receber previsto)', () => {
    expect(calcularConsulta({ tipo: 'entradas', mes: '2026-11' }, D, H)).toMatchObject({ recebido: 5000, falta: 920, previsto: 5920 })
  })
  it('janela de meses cobre a fatura de agora e o mês perguntado', () => {
    expect(janelaConsulta({ mes: '2026-11' }, H)).toEqual({ compIni: '2026-07', compFim: '2027-01' })
    expect(janelaConsulta({ mes: '2025-12' }, H)).toEqual({ compIni: '2025-12', compFim: '2027-01' })
    expect(nomeMes('2025-12', H)).toBe('dezembro de 2025')
  })
  it('a resposta padrão de pergunta não promete o que não existe', () => {
    expect(TEXTOS.pergunta).not.toMatch(/Ainda não respondo perguntas/)
    expect(TEXTOS.ajuda).toMatch(/quanto falta pagar/)
  })
})
