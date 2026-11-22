// Botão de Ajuda (L29): a curadoria por tela aponta pra telas que existem e nenhuma resposta
// está vazia ou fala da oferta antiga. Busca, perguntas com chave de recurso e chamados (0081).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { copy } from '../src/copy/pt-BR.js'
import { perguntasDaTela, buscarPerguntas, perguntaVisivel } from '../src/components/Ajuda.jsx'
import { codChamado, mensagemErroChamado, telaAtual, rotuloCategoriaChamado, diaCurto, diaEHora, MENSAGEM_MIN, MENSAGEM_MAX } from '../src/lib/chamados.js'

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const rotas = new Set(['/', ...[...app.matchAll(/<Route path="([a-z-]+)"/g)].map((m) => `/${m[1]}`)])
const migracao = readFileSync(new URL('../supabase/migrations/0081_chamados_suporte.sql', import.meta.url), 'utf8')
const CHAVES = ['ajuda', 'busca_filtros', 'importar', 'whatsapp_app', 'financiamentos']
const todas = () => [...Object.values(copy.ajuda.telas).flatMap((t) => t.perguntas), ...copy.ajuda.perguntasGerais]

describe('Ajuda — perguntas por tela', () => {
  it('cada tela da curadoria existe no app', () => {
    for (const caminho of Object.keys(copy.ajuda.telas)) expect(rotas.has(caminho), caminho).toBe(true)
  })
  it('as telas principais têm várias perguntas', () => {
    for (const c of ['/', '/gastos', '/entradas', '/cartoes', '/contas-do-mes', '/configuracoes', '/planos']) {
      expect(copy.ajuda.telas[c]?.perguntas?.length, c).toBeGreaterThan(3)
    }
    expect(copy.ajuda.perguntasGerais.length).toBeGreaterThanOrEqual(8)
  })
  it('nenhuma pergunta ou resposta vazia; nada da oferta antiga; nenhuma pergunta repetida na mesma tela', () => {
    for (const { p, r } of todas()) {
      expect(p.trim().length, p).toBeGreaterThan(5)
      expect(r.trim().length, p).toBeGreaterThan(20)
      expect(`${p} ${r}`).not.toMatch(/fundador|14 dias|100 vagas|R\$ ?19,90\/m|R\$ ?14,90\/m/i)
    }
    for (const [rota, tela] of Object.entries(copy.ajuda.telas)) {
      const ps = tela.perguntas.map((x) => x.p)
      expect(new Set(ps).size, rota).toBe(ps.length)
    }
  })
  it('pergunta com chave só usa chaves de recurso que existem, e some pra quem não tem a chave', () => {
    const comChave = todas().filter((x) => x.chave)
    expect(comChave.length).toBeGreaterThan(0)
    for (const x of comChave) expect(CHAVES, x.p).toContain(x.chave)
    const whats = copy.ajuda.telas['/configuracoes'].perguntas.find((x) => x.chave === 'whatsapp_app')
    expect(perguntaVisivel({})(whats)).toBe(false)
    expect(perguntaVisivel({ whatsapp_app: true })(whats)).toBe(true)
    expect(perguntaVisivel(null)({ p: 'x', r: 'y' })).toBe(true)
  })
  it('a fatura do mês saiu do Início: a resposta aponta pro "contas a vencer" e pra Contas do mês', () => {
    const r = copy.ajuda.telas['/'].perguntas.find((x) => x.p.startsWith('Onde vejo a fatura')).r
    expect(r).toMatch(/contas a vencer/)
    expect(r).toMatch(/Contas do mês/)
    expect(r).not.toMatch(/aqui no Início, no bloco/i)
  })
  it('faturas do mês (P17, Cartões): situações, título e "Pagas" escondidas', () => {
    for (const s of ['paga', 'aberta', 'fechada', 'atrasada']) expect(copy.faturasMes.status[s], s).toBeTruthy()
    expect(copy.faturasMes.titulo('novembro')).toBe('Faturas que vencem em novembro')
    expect(copy.faturasMes.status.aberta('03/12')).toBe('aberta, fecha 03/12')
    expect(copy.faturasMes.pagas(1)).toBe('Paga (1)')
    expect(copy.faturasMes.pagas(3)).toBe('Pagas (3)')
    expect(copy.contasMes.abrirFatura('Fatura Nubank')).toBe('Ver as compras da Fatura Nubank')
  })
  it('acha a tela pelo caminho (com ou sem barra no fim); tela sem curadoria = só as gerais', () => {
    expect(perguntasDaTela('/cartoes')?.nome).toBe('Cartões')
    expect(perguntasDaTela('/cartoes/')?.nome).toBe('Cartões')
    expect(perguntasDaTela('/')?.nome).toBe('o Início')
    expect(perguntasDaTela('/checkout')).toBe(null)
  })
})

describe('Ajuda — busca', () => {
  it('acha sem acento, sem maiúscula e pela raiz da palavra (cancelar acha "cancelo")', () => {
    const r = buscarPerguntas('CANCELAR', {})
    expect(r.some((x) => /Como cancelo\?/.test(x.p))).toBe(true)
    expect(buscarPerguntas('saldo do mes', {}).some((x) => x.p.includes('Saldo do mês'))).toBe(true)
  })
  it('todas as palavras precisam aparecer; menos de 2 letras não busca; no máximo 30', () => {
    expect(buscarPerguntas('a', {})).toEqual([])
    expect(buscarPerguntas('fatura xyzqw', {})).toEqual([])
    expect(buscarPerguntas('o', {}).length).toBe(0)
    expect(buscarPerguntas('de', {}).length).toBeLessThanOrEqual(30)
  })
  it('pergunta com chave só aparece na busca pra quem tem a chave', () => {
    expect(buscarPerguntas('whatsapp joca', {}).length).toBe(0)
    expect(buscarPerguntas('whatsapp joca', { whatsapp_app: true }).length).toBeGreaterThan(0)
  })
  it('diz de que tela é cada resposta (ou geral)', () => {
    const r = buscarPerguntas('limite disponivel', {})
    expect(r[0].tela).toBe('Cartões')
  })
})

describe('Chamados (0081)', () => {
  it('código curto igual ao do painel e do e-mail', () => {
    expect(codChamado('aa67dca0-a538-42fb-9157-1506eb7c5663')).toBe('HF-AA67DC')
    expect(codChamado('')).toBe('HF-')
  })
  it('erro do banco vira frase pra pessoa', () => {
    expect(mensagemErroChamado({ message: 'mensagem_curta' })).toBe(copy.ajuda.chamado.erros.mensagem_curta)
    expect(mensagemErroChamado({ message: 'P0001: muitos_chamados' })).toBe(copy.ajuda.chamado.erros.muitos_chamados)
    expect(mensagemErroChamado(new Error('Failed to fetch'))).toBe(copy.ajuda.chamado.erros.generico)
  })
  it('a tela vai limpa (só o caminho) e nada estranho passa', () => {
    expect(telaAtual('/cartoes')).toBe('/cartoes')
    expect(telaAtual('/cartoes/')).toBe('/cartoes')
    expect(telaAtual('/')).toBe('/')
    expect(telaAtual('/Cartões<script>')).toBe(null)
  })
  it('categorias do app = as que o banco aceita, com rótulo', () => {
    const ids = copy.ajuda.chamado.categorias.map((c) => c.id)
    expect(ids).toEqual(['duvida', 'problema', 'sugestao', 'assinatura', 'outro'])
    for (const id of ids) expect(migracao).toContain(`'${id}'`)
    expect(rotuloCategoriaChamado('problema')).toBe('Algo não funciona')
    expect(rotuloCategoriaChamado('qualquer')).toBe('Outro assunto')
  })
  it('limites do app batem com os do banco (10 a 4000 letras) e o prazo é 2 dias úteis', () => {
    expect(MENSAGEM_MIN).toBe(10)
    expect(MENSAGEM_MAX).toBe(4000)
    expect(migracao).toContain('char_length(v_msg) < 10')
    expect(migracao).toContain('char_length(v_msg) > 4000')
    expect(migracao).toContain('suporte_prazo(now(), 2)')
    expect(copy.ajuda.chamado.prazo).toMatch(/2 dias úteis/)
  })
  it('as funções novas nascem fechadas: só authenticated executa (nunca anon)', () => {
    for (const fn of ['suporte_abrir_chamado', 'suporte_meus_chamados', 'suporte_respostas_novas', 'suporte_marcar_respostas_vistas']) {
      expect(migracao).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`))
      expect(migracao).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`))
      expect(migracao).not.toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to anon`))
    }
  })
  it('datas no horário de Brasília', () => {
    expect(diaCurto('2026-11-24T12:47:52Z')).toBe('24/11')
    expect(diaEHora('2026-11-20T13:01:00Z')).toBe('20/11 às 10:01')
    expect(diaCurto('xx')).toBe('')
  })
})
