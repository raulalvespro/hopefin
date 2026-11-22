// E-mails automáticos (22/11/2026): texto do Painel → HTML seguro, e as regras do remarketing.
import { describe, it, expect } from 'vitest'
import { corpoParaHtml, preencherTexto, linkBotao, montarConteudo, varsBase, ehCampanha, varsExemplo } from '../supabase/functions/_shared/modelo.js'
import { proximaEtapa, dataFixaValeHoje, diasEntre } from '../supabase/functions/automacoes-email/regras.js'
import { tipoDoDia, pushRegua } from '../supabase/functions/fim-de-trial/regua.js'

describe('texto do Painel vira e-mail', () => {
  it('parágrafos, negrito e variáveis', () => {
    const h = corpoParaHtml('{ola} Tudo **bem**?\n\nLinha 1\nLinha 2', varsBase('Ana Souza'))
    expect(h).toBe('Oi, Ana! Tudo <strong>bem</strong>?<br><br>Linha 1<br>Linha 2')
  })
  it('o que a pessoa escreve e o nome do cliente são escapados; blocos montados pelo código, não', () => {
    const h = corpoParaHtml('<script>x</script> {nome} {lista}', { nome: '<b>Zé</b>', lista: { html: '<table></table>' } })
    expect(h).toContain('&lt;script&gt;')
    expect(h).toContain('&lt;b&gt;Zé&lt;/b&gt;')
    expect(h).toContain('<table></table>')
  })
  it('parágrafo que fica vazio (ex.: sem oferta) some, sem buraco', () => {
    expect(corpoParaHtml('A\n\n{oferta}\n\nB', { oferta: '' })).toBe('A<br><br>B')
  })
  it('variável desconhecida some; assunto sem HTML', () => {
    expect(preencherTexto('Faltam {dias_restantes} {xyz}', { dias_restantes: '3 dias' })).toBe('Faltam 3 dias')
    expect(preencherTexto('{quem} entrou', { quem: { html: '<b>x</b>', texto: 'Carlos' } })).toBe('Carlos entrou')
  })
  it('botão só com tela do app ou https', () => {
    expect(linkBotao('/planos')).toBe('https://app.hopefin.com.br/planos')
    expect(linkBotao('/')).toBe('https://app.hopefin.com.br')
    expect(linkBotao('https://hopefin.com.br/x')).toBe('https://hopefin.com.br/x')
    expect(linkBotao('javascript:alert(1)')).toBe(null)
    expect(linkBotao('http://x.com')).toBe(null)
    expect(montarConteudo({ assunto: 'A b c', corpo: 'x', botao_texto: 'Ir', botao_link: 'ftp://x' }).cta).toBeUndefined()
  })
  it('título e preheader caem no assunto quando vazios', () => {
    const c = montarConteudo({ assunto: 'Oi {nome}', corpo: 'x' }, varsBase('Bia'))
    expect(c.titulo).toBe('Oi Bia')
    expect(c.preheader).toBe('Oi Bia')
  })
  it('sem nome: "Oi!"', () => {
    expect(varsBase('').ola).toBe('Oi!')
    expect(varsBase(null).nome).toBe('')
  })
  it('campanha = remarketing ou automação criada no Painel', () => {
    expect(ehCampanha({ categoria: 'remarketing' })).toBe(true)
    expect(ehCampanha({ categoria: 'personalizado' })).toBe(true)
    expect(ehCampanha({ categoria: 'cobranca' })).toBe(false)
  })
  it('exemplos da prévia cobrem as variáveis dos e-mails de fábrica', () => {
    const v = varsExemplo('x')
    for (const k of ['ola', 'nome', 'fim', 'dias_restantes', 'quem', 'grupo', 'qtd_contas', 'total', 'lista_contas', 'mes', 'saldo', 'sobra', 'numeros', 'data_renovacao', 'valor', 'forma', 'situacao', 'codigo', 'assunto_chamado', 'resposta']) {
      expect(v[k], k).toBeTruthy()
    }
  })
})

describe('régua do teste com dias do Painel', () => {
  it('padrão continua 3 antes / último dia / 1 depois', () => {
    expect([3, 0, -1].map((d) => tipoDoDia(d, true))).toEqual(['fim_trial_3d', 'fim_trial_0d', 'fim_trial_d1'])
  })
  it('dias trocados no Painel', () => {
    expect(tipoDoDia(5, true, { antes: 5, depois: 2 })).toBe('fim_trial_3d')
    expect(tipoDoDia(3, true, { antes: 5, depois: 2 })).toBe(null)
    expect(tipoDoDia(-2, true, { antes: 5, depois: 2 })).toBe('fim_trial_d1')
  })
  it('notificação acompanha os dias', () => {
    expect(pushRegua('fim_trial_3d').title).toBe('Faltam 3 dias do seu teste 💚')
    expect(pushRegua('fim_trial_3d', 1).title).toBe('Falta 1 dia do seu teste 💚')
  })
})

describe('remarketing: qual e-mail sai hoje', () => {
  const etapas = [
    { chave: 'a4', dias: 4, ligado: true }, { chave: 'a7', dias: 7, ligado: true },
    { chave: 'a15', dias: 15, ligado: false }, { chave: 'a30', dias: 30, ligado: true },
  ]
  const base = { etapas, entrouEm: '2026-11-01', enviadas: new Set(), intervalo: 7 }
  it('antes da primeira etapa, nada', () => {
    expect(proximaEtapa({ ...base, hoje: '2026-11-04' })).toBe(null)
  })
  it('no dia da etapa, ela sai', () => {
    expect(proximaEtapa({ ...base, hoje: '2026-11-05' }).chave).toBe('a4')
  })
  it('no máximo 1 por semana', () => {
    expect(proximaEtapa({ ...base, hoje: '2026-11-08', enviadas: new Set(['a4']), ultimoEnvio: '2026-11-05' })).toBe(null)
    expect(proximaEtapa({ ...base, hoje: '2026-11-12', enviadas: new Set(['a4']), ultimoEnvio: '2026-11-05' }).chave).toBe('a7')
  })
  it('etapa desligada é pulada', () => {
    expect(proximaEtapa({ ...base, hoje: '2026-11-20', enviadas: new Set(['a4', 'a7']), ultimoEnvio: '2026-11-12' })).toBe(null)
    expect(proximaEtapa({ ...base, hoje: '2026-12-01', enviadas: new Set(['a4', 'a7']), ultimoEnvio: '2026-11-12' }).chave).toBe('a30')
  })
  it('quem entrou atrasado recebe a etapa mais adiantada, e as antigas não voltam', () => {
    expect(proximaEtapa({ ...base, hoje: '2026-11-10' }).chave).toBe('a7')
    expect(proximaEtapa({ ...base, hoje: '2026-11-20', enviadas: new Set(['a7']), ultimoEnvio: '2026-11-10' })).toBe(null)
  })
  it('depois da última etapa, acabou', () => {
    expect(proximaEtapa({ ...base, hoje: '2027-02-01', enviadas: new Set(['a4', 'a7', 'a30']), ultimoEnvio: '2026-12-01' })).toBe(null)
  })
  it('data marcada: no dia ou até 2 dias depois, e só com a oferta valendo', () => {
    const m = { ligado: true, gatilho: 'data_fixa', data_envio: '2026-12-26', condicao: 'oferta_lancamento' }
    const p = { lancamento_ativo: true }
    expect(dataFixaValeHoje(m, '2026-12-25', p)).toBe(false)
    expect(dataFixaValeHoje(m, '2026-12-26', p)).toBe(true)
    expect(dataFixaValeHoje(m, '2026-12-28', p)).toBe(true)
    expect(dataFixaValeHoje(m, '2026-12-29', p)).toBe(false)
    expect(dataFixaValeHoje(m, '2026-12-26', { lancamento_ativo: false })).toBe(false)
    expect(dataFixaValeHoje({ ...m, ligado: false }, '2026-12-26', p)).toBe(false)
  })
  it('diasEntre', () => {
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3)
  })
})
