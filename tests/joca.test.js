// Testes do Joca (WhatsApp, A8.23 + A8.24): textos aprovados pelo Raul, leitura do "sim"/"não",
// limpeza da resposta da IA e a regra de não recomendar investimento. Nada aqui manda mensagem.
import { describe, it, expect } from 'vitest'
import {
  TEXTOS, brl, ddmm, rotuloCategoria, resumoLancamento, msgLancado, ehSim, ehNao, normalizar,
  respostaRapida, limparIA, emDuvida, instrucoesIA, extrairJson, paraSalvar, comoVaiSalvar,
  custoAudioUsd, LIMIAR_CONFIANCA, pendenteParaIA, formaDoGasto, resumoUltimo,
} from '../supabase/functions/whatsapp-webhook/joca.js'

const HOJE = '2026-11-20'
const CARTOES = [{ id: 'c1', nome: 'Itaú azul' }, { id: 'c2', nome: 'Nubank' }]
const CATS = ['alimentacao', 'mercado', 'outros', 'transporte']

describe('formatação', () => {
  it('reais no padrão brasileiro', () => {
    expect(brl(100)).toBe('R$ 100,00')
    expect(brl(2000)).toBe('R$ 2.000,00')
    expect(brl(1234567.891)).toBe('R$ 1.234.567,89')
    expect(brl(0.5)).toBe('R$ 0,50')
  })
  it('data curta e categoria com acento', () => {
    expect(ddmm('2026-11-18')).toBe('18/11')
    expect(rotuloCategoria('alimentacao')).toBe('Alimentação')
    expect(rotuloCategoria('mercado')).toBe('Mercado')
  })
})

describe('textos aprovados (20/11/2026) — uma informação por linha', () => {
  const gasto = { tipo: 'gasto', valor: 100, descricao: 'Janta', categoria: 'alimentacao', cartao_id: 'c1', cartao_nome: 'Itaú azul', data: HOJE, parcelas: 1 }

  it('gasto no cartão lançado hoje: sem data e sem parcelas', () => {
    expect(msgLancado('Raul Erickson', gasto, HOJE)).toBe('Prontinho, Raul! Lancei aqui 👇\n\n💸 *R$ 100,00* · Janta\n🏷️ Alimentação\n💳 Itaú azul')
  })
  it('data só quando não é hoje; parcelas só quando parcelado no cartão (na linha do cartão)', () => {
    const m = msgLancado('Raul', { ...gasto, valor: 100, parcelas: 3, data: '2026-11-18' }, HOJE)
    expect(m).toBe('Prontinho, Raul! Lancei aqui 👇\n\n💸 *R$ 100,00* · Janta\n🏷️ Alimentação\n💳 Itaú azul · 3x de R$ 33,33\n📅 18/11')
    // sem cartão o banco salva à vista (wa_salvar_lancamento): não mostra parcelas, mostra Pix
    const pix = msgLancado('Raul', { ...gasto, cartao_id: null, cartao_nome: null, parcelas: 3 }, HOJE)
    expect(pix).toBe('Prontinho, Raul! Lancei aqui 👇\n\n💸 *R$ 100,00* · Janta\n🏷️ Alimentação\n💵 Pix')
  })
  it('gasto em dinheiro mostra "💵 Dinheiro"', () => {
    const m = msgLancado('Raul', { ...gasto, cartao_id: null, cartao_nome: null, forma: 'dinheiro' }, HOJE)
    expect(m).toBe('Prontinho, Raul! Lancei aqui 👇\n\n💸 *R$ 100,00* · Janta\n🏷️ Alimentação\n💵 Dinheiro')
  })
  it('entrada lançada', () => {
    const m = msgLancado('Raul', { tipo: 'entrada', valor: 2000, descricao: 'Salário', categoria: 'outros', data: HOJE, parcelas: 1 }, HOJE)
    expect(m).toBe('Oba, entrou dinheiro! 💰\n\n💰 *R$ 2.000,00* · Salário\nJá está nas suas entradas.')
  })
  it('demais textos aprovados, palavra por palavra', () => {
    expect(TEXTOS.naoEntendi).toBe('Hmm, esse eu não entendi 😅 Me manda assim: *farmácia 48,90* ou *uber 23,50 ontem*.')
    expect(TEXTOS.semValor).toBe('Quase lá! Só faltou o valor 🤔 Ex.: *farmácia 48,90*.')
    expect(TEXTOS.audio).toBe('Não consegui ouvir direito 😅 Pode repetir mais devagar ou mandar por texto?')
    expect(TEXTOS.limite).toBe('Você usou todos os lançamentos por WhatsApp deste mês 🗓️ Eles voltam no dia 1º. Pelo app segue tudo normal.')
    expect(TEXTOS.naoConectado).toBe('Oi! Eu sou o Joca, do HopeFin 👋 Pra lançar por aqui, abra o app › Minha conta › Configurações › Conectar meu WhatsApp e me mande o código.')
  })
  it('sem nome não quebra a frase', () => {
    expect(msgLancado('', gasto, HOJE).startsWith('Prontinho! Lancei aqui 👇')).toBe(true)
  })
})

describe('"tá certo?" e confirmações', () => {
  it('pergunta mostra o tipo e o que vai ser salvo', () => {
    const t = TEXTOS.taCerto({ tipo: 'gasto', valor: 50, descricao: 'Aquilo', categoria: 'outros', cartao_id: null, data: HOJE, parcelas: 1 }, HOJE)
    expect(t).toBe('Deixa eu conferir antes de lançar 🤔\n\n💸 *R$ 50,00* · Aquilo\n🏷️ Outros\n💵 Pix\n\nTá certo? Responde *sim* pra eu lançar, ou me manda do jeito certo.')
  })
  it('lê sim', () => {
    for (const s of ['sim', 'Sim!', 'SIM.', 's', 'pode', 'pode lançar', 'isso mesmo', 'tá certo', 'ok', 'Ok 👍', '👍', '👍🏽', '✅', 'sim, por favor', 'Beleza', 'tá bom', 'isso aí']) {
      expect(ehSim(s), s).toBe(true)
    }
  })
  it('não confunde sim com outra coisa', () => {
    for (const s of ['sim, mas era 50', 'não', 'mercado 120', 'pode ser no nubank', 'e aí', 'tá', '', 'simone 30', 'okinawa']) {
      expect(ehSim(s), s).toBe(false)
    }
  })
  it('lê não (sem número)', () => {
    for (const s of ['não', 'nao', 'N', 'cancela', 'Não, tá errado', 'esquece', '👎', 'não, foi no Nubank']) {
      expect(ehNao(s), s).toBe(true)
    }
    for (const s of ['não, era 50', 'sim', 'nubank 50', 'apaga o último']) {
      expect(ehNao(s), s).toBe(false)
    }
  })
  it('respostas prontas sem IA (oi, obrigado, ajuda)', () => {
    expect(respostaRapida('Oi')).toBe('saudacao')
    expect(respostaRapida('bom dia!')).toBe('saudacao')
    expect(respostaRapida('Valeu')).toBe('agradecimento')
    expect(respostaRapida('obrigada Joca')).toBe('agradecimento')
    expect(respostaRapida('?')).toBe('ajuda')
    expect(respostaRapida('ajuda')).toBe('ajuda')
    expect(respostaRapida('bom dia, mercado 120')).toBe(null)
    expect(respostaRapida('mercado 120')).toBe(null)
  })
  it('normaliza acento, pontuação e tom de pele', () => {
    expect(normalizar('  Não!!  ')).toBe('nao')
    expect(normalizar('👍🏿')).toBe('👍')
  })
})

describe('resposta da IA (nunca confiar cegamente)', () => {
  const ctx = { texto: 'janta 100 no itaú', hoje: HOJE, categorias: CATS, cartoes: CARTOES }
  it('aceita só cartão da lista e categoria do grupo', () => {
    const d = limparIA({ acao: 'lancar', tipo: 'gasto', valor: '100', descricao: 'janta', categoria: 'inventada', cartao_id: 'c9', data: 'ontem', parcelas: 1, confianca: 0.9 }, ctx)
    expect(d).toMatchObject({ acao: 'lancar', valor: 100, descricao: 'Janta', categoria: 'outros', cartao_id: null, cartao_nome: null, data: HOJE, parcelas: 1, confianca: 0.9 })
    const ok = limparIA({ acao: 'lancar', tipo: 'gasto', valor: 100, descricao: 'Janta', categoria: 'alimentacao', cartao_id: 'c1', data: '2026-11-19', parcelas: 3, confianca: 0.95 }, ctx)
    expect(ok).toMatchObject({ categoria: 'alimentacao', cartao_id: 'c1', cartao_nome: 'Itaú azul', data: '2026-11-19', parcelas: 3 })
  })
  it('valor inválido, negativo ou absurdo vira nulo', () => {
    expect(limparIA({ acao: 'lancar', valor: -5 }, ctx).valor).toBe(null)
    expect(limparIA({ acao: 'lancar', valor: 'abc' }, ctx).valor).toBe(null)
    expect(limparIA({ acao: 'lancar', valor: 99_000_000 }, ctx).valor).toBe(null)
    expect(limparIA({ acao: 'lancar', valor: 10.005 }, ctx).valor).toBe(10.01)
  })
  it('ação desconhecida: vira lançamento se tem tipo, senão "outro"', () => {
    expect(limparIA({ tipo: 'gasto', valor: 10 }, ctx).acao).toBe('lancar')
    expect(limparIA({ acao: 'hackear' }, ctx).acao).toBe('outro')
    expect(limparIA({ acao: 'pagar_fatura', cartao_id: 'c2' }, ctx)).toMatchObject({ acao: 'pagar_fatura', cartao_id: 'c2', cartao_nome: 'Nubank' })
  })
  it('confiança: abaixo do limiar pergunta antes', () => {
    expect(LIMIAR_CONFIANCA).toBe(0.6)
    expect(emDuvida({ confianca: 0.59 })).toBe(true)
    expect(emDuvida({ confianca: 0.6 })).toBe(false)
    expect(emDuvida({})).toBe(true)
    expect(limparIA({ acao: 'lancar', confianca: 7 }, ctx).confianca).toBe(1)
  })
  it('parcelas: só inteiro entre 2 e 72', () => {
    expect(limparIA({ acao: 'lancar', parcelas: 2.5 }, ctx).parcelas).toBe(1)
    expect(limparIA({ acao: 'lancar', parcelas: 500 }, ctx).parcelas).toBe(1)
    expect(limparIA({ acao: 'lancar', parcelas: 12 }, ctx).parcelas).toBe(12)
  })
  it('tira o JSON mesmo embrulhado', () => {
    expect(extrairJson('```json\n{"acao":"lancar","valor":5}\n```')).toEqual({ acao: 'lancar', valor: 5 })
    expect(() => extrairJson('sem nada')).toThrow()
  })
  it('vai pro banco só o que o banco usa', () => {
    const d = limparIA({ acao: 'lancar', tipo: 'gasto', valor: 30, descricao: 'Uber', categoria: 'transporte', confianca: 0.9 }, ctx)
    expect(Object.keys(paraSalvar(d)).sort()).toEqual(['cartao_id', 'categoria', 'data', 'descricao', 'parcelas', 'pessoa_nome', 'tipo', 'tipo_pagamento', 'valor'])
    expect(pendenteParaIA(d)).toEqual({ tipo: 'gasto', valor: 30, descricao: 'Uber', categoria: 'transporte', cartao_id: null, data: HOJE, parcelas: 1, forma: 'pix', pessoa: null })
  })
  it('forma do gasto sem cartão: dinheiro só quando dito; o resto é Pix (igual ao app)', () => {
    expect(formaDoGasto('dinheiro', '')).toBe('dinheiro')
    expect(formaDoGasto(null, 'pão 12 em dinheiro')).toBe('dinheiro')
    expect(formaDoGasto(null, 'feira 30 em espécie')).toBe('dinheiro')
    expect(formaDoGasto('debito', 'farmácia 40 no débito')).toBe('pix')
    expect(formaDoGasto(null, 'uber 23')).toBe('pix')
    const din = limparIA({ acao: 'lancar', tipo: 'gasto', valor: 12, descricao: 'Pão', categoria: 'outros', forma: 'dinheiro', confianca: 0.9 }, ctx)
    expect(din.forma).toBe('dinheiro')
    expect(paraSalvar(din).tipo_pagamento).toBe('dinheiro')
    // com cartão ou entrada: sem forma (o banco grava "cartao" / não se aplica)
    const card = limparIA({ acao: 'lancar', tipo: 'gasto', valor: 12, cartao_id: 'c1', forma: 'dinheiro', confianca: 0.9 }, ctx)
    expect(card.forma).toBe(null)
    expect(paraSalvar(card).tipo_pagamento).toBe(null)
    expect(limparIA({ acao: 'lancar', tipo: 'entrada', valor: 12, forma: 'dinheiro' }, ctx).forma).toBe(null)
  })
  it('a IA sabe que só existe pix ou dinheiro no gasto sem cartão', () => {
    expect(instrucoesIA({ hoje: HOJE, semana: 'sexta', categorias: CATS })).toMatch(/forma: só em gasto SEM cartão/)
  })
  it('parcela igual ao banco (total ÷ parcelas, no centavo)', () => {
    expect(comoVaiSalvar({ tipo: 'gasto', valor: 100, cartao_id: 'c1', parcelas: 3 }).valor_parcela).toBe(33.33)
    expect(comoVaiSalvar({ tipo: 'gasto', valor: 100, cartao_id: null, parcelas: 3 }).parcelas).toBe(1)
  })
})

describe('regras do Joca nas instruções da IA', () => {
  const inst = instrucoesIA({ hoje: HOJE, semana: 'sexta', categorias: CATS })
  it('nunca recomenda investimento específico (só educação financeira)', () => {
    expect(inst).toMatch(/NUNCA recomende investimento específico/)
    expect(inst).toMatch(/CVM/)
    expect(inst).toMatch(/Educação financeira pode/)
  })
  it('sabe a data de hoje e as categorias do grupo', () => {
    expect(inst).toContain('Hoje é 2026-11-20 (sexta')
    expect(inst).toContain('alimentacao, mercado, outros, transporte')
  })
  it('resposta de investimento aponta pro profissional da CVM', () => {
    expect(TEXTOS.investimento).toMatch(/CVM/)
  })
})

describe('fatura e último lançamento', () => {
  it('pergunta da fatura com valor diferente do que a pessoa falou', () => {
    const t = TEXTOS.faturaPergunta({ cartao: 'Nubank', fatura: { vencimento: '2026-12-10', total: 1234.56, status: 'fechada' }, valorDito: 1200, temParcelas: true })
    expect(t).toBe('Achei a fatura do *Nubank* 💳\n\n📅 Vence 10/12\n💰 *R$ 1.234,56*\n(Você falou R$ 1.200,00. Se tiver compra faltando ou sobrando nela, ajusta no app em Cartões.)\n\nMarco como paga? As parcelas dela entram como pagas também.\nResponde *sim* pra confirmar.')
    const atrasada = TEXTOS.faturaPergunta({ cartao: 'Itaú', fatura: { vencimento: '2026-11-08', total: 50, status: 'atrasada' }, valorDito: 50, temParcelas: false })
    expect(atrasada).toBe('Achei a fatura do *Itaú* 💳\n\n📅 Venceu 08/11\n💰 *R$ 50,00*\n\nMarco como paga?\nResponde *sim* pra confirmar.')
  })
  it('fatura paga com e sem parcelas', () => {
    expect(TEXTOS.faturaPaga('Raul', { cartao: 'Nubank', vencimento: '2026-12-10', total: 300, parcelas: 2 }))
      .toBe('Prontinho, Raul! Fatura paga ✅\n\n💳 Nubank · vence 10/12\n💰 *R$ 300,00*\n2 parcelas entraram como pagas')
    expect(TEXTOS.faturaPaga('Raul', { cartao: 'Nubank', vencimento: '2026-12-10', total: 300, parcelas: 1 })).toContain('1 parcela entrou como paga')
    expect(TEXTOS.faturaPaga('Raul', { cartao: 'Nubank', vencimento: '2026-12-10', total: 300, parcelas: 0 })).toMatch(/\*R\$ 300,00\*$/)
    // data que já passou: "venceu"
    expect(TEXTOS.faturaPaga('Raul', { cartao: 'Itaú', vencimento: '2026-11-08', total: 10, parcelas: 0 }, HOJE)).toContain('💳 Itaú · venceu 08/11')
    expect(TEXTOS.faturaJaPaga('Itaú', '2026-11-08', HOJE)).toBe('A fatura do Itaú que venceu 08/11 já está paga 👍')
    expect(TEXTOS.faturaJaPaga('Nubank', '2026-12-10', HOJE)).toBe('A fatura do Nubank que vence 10/12 já está paga 👍')
  })
  it('qual cartão: lista os cartões do grupo', () => {
    expect(TEXTOS.faturaQualCartao(['Nubank', 'Inter'])).toBe('De qual cartão? Me manda assim: *paguei a fatura do Nubank*.\nSeus cartões: Nubank, Inter.')
    expect(TEXTOS.faturaQualCartao([])).toMatch(/ainda não tem cartão/)
  })
  it('apagar e corrigir mostram o que muda', () => {
    const u = { tipo: 'parcelamento', valor: 300, descricao: 'Tênis', categoria: 'vestuario', cartao_nome: 'Nubank', num_parcelas: 3, valor_parcela: 100, data: null }
    expect(TEXTOS.apagarPergunta(u, HOJE)).toBe('Apago este lançamento? 🗑️\n\n💸 *R$ 300,00* · Tênis\n🏷️ Vestuário\n💳 Nubank · 3x de R$ 100,00\n\nResponde *sim* pra apagar.')
    expect(TEXTOS.corrigido({ ...u, valor: 150, valor_parcela: 50, valor_antes: 300 }, HOJE))
      .toBe('Arrumei ✅ Agora ficou assim 👇\n\n💸 *R$ 150,00* · Tênis\n🏷️ Vestuário\n💳 Nubank · 3x de R$ 50,00\n(antes: R$ 300,00)')
    expect(TEXTOS.corrigirPergunta({ descricao: 'Janta', valor: 100 }, 50)).toBe('Corrijo o último lançamento? ✏️\n\nJanta: de R$ 100,00 pra *R$ 50,00*\n\nResponde *sim* pra confirmar.')
    expect(TEXTOS.apagado({ tipo: 'gasto', valor: 100, descricao: 'Janta' })).toBe('Apaguei ✅\n\n💸 R$ 100,00 · Janta\nSe precisar, é só me mandar de novo.')
    expect(TEXTOS.apagado({ tipo: 'entrada', valor: 50, descricao: 'Freela' })).toContain('💰 R$ 50,00 · Freela')
    // gasto do banco em dinheiro: o último mostra "💵 Dinheiro"
    expect(resumoUltimo({ tipo: 'gasto', valor: 12, descricao: 'Pão', categoria: 'outros', cartao_nome: null, tipo_pagamento: 'dinheiro', data: HOJE }, HOJE)).toBe('💸 *R$ 12,00* · Pão\n🏷️ Outros\n💵 Dinheiro')
    expect(TEXTOS.bloqueio('dividido')).toMatch(/dividido/)
    expect(TEXTOS.bloqueio('xyz')).toMatch(/pelo app/)
  })
  it('custo do áudio (Whisper US$ 0,006/min)', () => {
    expect(custoAudioUsd(60)).toBeCloseTo(0.006, 6)
    expect(custoAudioUsd(-3)).toBe(0)
  })
})
