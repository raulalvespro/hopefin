import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { criarFetchComMemoria, limparLeituras, aoMudarDados, _estado } from '../src/lib/cacheLeitura.js'

const BASE = 'https://x.supabase.co'
const GASTOS = `${BASE}/rest/v1/gastos?select=*&grupo_id=eq.1`
const H = (tok = 'A') => ({ Authorization: `Bearer ${tok}`, apikey: 'k' })
const espera = () => new Promise((r) => setTimeout(r, 0))

function fetchFalso(corpos) {
  const chamadas = []
  let i = 0
  const fn = vi.fn(async (input, init = {}) => {
    chamadas.push({ url: input, metodo: init.method || 'GET' })
    const corpo = typeof corpos === 'function' ? corpos(input, init) : corpos[Math.min(i++, corpos.length - 1)]
    if (corpo instanceof Response) return corpo
    return new Response(corpo, { status: 200, headers: { 'content-type': 'application/json' } })
  })
  return { fn, chamadas }
}

beforeEach(() => { limparLeituras(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-19T12:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

describe('memória das leituras (desempenho das abas)', () => {
  it('a 2ª leitura igual volta na hora, sem ir ao banco', async () => {
    const { fn } = fetchFalso(['[1]'])
    const f = criarFetchComMemoria(fn)
    expect(await (await f(GASTOS, { method: 'GET', headers: H() })).text()).toBe('[1]')
    expect(await (await f(GASTOS, { method: 'GET', headers: H() })).text()).toBe('[1]')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('depois de 1,5 s mostra o que tinha e confere o banco por trás; se mudou, avisa a tela', async () => {
    const { fn } = fetchFalso(['[1]', '[1,2]'])
    const f = criarFetchComMemoria(fn)
    const aviso = vi.fn()
    const sair = aoMudarDados(aviso)
    await (await f(GASTOS, { headers: H() })).text()
    vi.setSystemTime(new Date('2026-11-19T12:00:02Z'))
    expect(await (await f(GASTOS, { headers: H() })).text()).toBe('[1]') // na hora, o que tinha
    await espera(); await espera()
    expect(fn).toHaveBeenCalledTimes(2) // foi ao banco por trás
    await new Promise((r) => setTimeout(r, 80))
    expect(aviso).toHaveBeenCalledTimes(1) // dado novo → tela se atualiza
    expect(await (await f(GASTOS, { headers: H() })).text()).toBe('[1,2]')
    sair()
  })

  it('leitura por trás igual à anterior não avisa ninguém', async () => {
    const { fn } = fetchFalso(['[1]', '[1]'])
    const f = criarFetchComMemoria(fn)
    const aviso = vi.fn()
    const sair = aoMudarDados(aviso)
    await f(GASTOS, { headers: H() })
    vi.setSystemTime(new Date('2026-11-19T12:00:03Z'))
    await f(GASTOS, { headers: H() })
    await new Promise((r) => setTimeout(r, 80))
    expect(aviso).not.toHaveBeenCalled()
    sair()
  })

  it('salvar (POST/PATCH/DELETE) apaga a memória: a próxima leitura vai ao banco', async () => {
    for (const metodo of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      limparLeituras()
      const { fn } = fetchFalso(['[1]', '{}', '[1,2]'])
      const f = criarFetchComMemoria(fn)
      await f(GASTOS, { headers: H() })
      await f(`${BASE}/rest/v1/gastos`, { method: metodo, headers: H(), body: '{}' })
      expect(await (await f(GASTOS, { headers: H() })).text()).toBe('[1,2]')
      expect(fn).toHaveBeenCalledTimes(3)
    }
  })

  it('RPC que grava e chamada de função apagam a memória; RPC só de leitura não', async () => {
    const { fn } = fetchFalso(() => '[1]')
    const f = criarFetchComMemoria(fn)
    await f(GASTOS, { headers: H() })
    await f(`${BASE}/rest/v1/rpc/minhas_flags`, { method: 'POST', headers: H(), body: '{}' })
    expect(_estado().itens).toBe(1)
    await f(`${BASE}/rest/v1/rpc/juntar_pessoas`, { method: 'POST', headers: H(), body: '{}' })
    expect(_estado().itens).toBe(0)
    await f(GASTOS, { headers: H() })
    await f(`${BASE}/functions/v1/remover-membro`, { method: 'POST', headers: H(), body: '{}' })
    expect(_estado().itens).toBe(0)
  })

  it('leitura que saiu antes de salvar e chegou depois não entra na memória', async () => {
    let soltar
    const lenta = new Promise((r) => { soltar = r })
    const fn = vi.fn(async (input, init = {}) => {
      if ((init.method || 'GET') === 'GET' && fn.mock.calls.length === 1) { await lenta; return new Response('[velho]') }
      return new Response((init.method || 'GET') === 'GET' ? '[novo]' : '{}')
    })
    const f = criarFetchComMemoria(fn)
    const leituraVelha = f(GASTOS, { headers: H() })
    await f(`${BASE}/rest/v1/gastos`, { method: 'POST', headers: H(), body: '{}' })
    soltar()
    expect(await (await leituraVelha).text()).toBe('[velho]') // quem pediu recebe
    expect(_estado().itens).toBe(0) // mas não fica guardada
    expect(await (await f(GASTOS, { headers: H() })).text()).toBe('[novo]')
  })

  it('cada usuário (token) tem a sua memória; login, arquivos e erro não ficam guardados', async () => {
    const { fn } = fetchFalso((input, init) => (new Headers(init.headers).get('authorization') === 'Bearer B' ? '["B"]' : '["A"]'))
    const f = criarFetchComMemoria(fn)
    expect(await (await f(GASTOS, { headers: H('A') })).text()).toBe('["A"]')
    expect(await (await f(GASTOS, { headers: H('B') })).text()).toBe('["B"]')
    await f(`${BASE}/auth/v1/user`, { headers: H() })
    await f(`${BASE}/auth/v1/user`, { headers: H() })
    expect(fn).toHaveBeenCalledTimes(4)
    const erro = vi.fn(async () => new Response('{"message":"jwt expired"}', { status: 401 }))
    const g = criarFetchComMemoria(erro)
    await g(GASTOS, { headers: H('C') }); await g(GASTOS, { headers: H('C') })
    expect(erro).toHaveBeenCalledTimes(2)
  })

  it('contagem (HEAD + content-range) também fica e respeita o .single() (Accept)', async () => {
    const fn = vi.fn(async (input, init = {}) => new Response(init.method === 'HEAD' ? null : '{"id":1}', {
      status: 200, headers: { 'content-range': '0-0/7' },
    }))
    const f = criarFetchComMemoria(fn)
    const r1 = await f(GASTOS, { method: 'HEAD', headers: H() })
    const r2 = await f(GASTOS, { method: 'HEAD', headers: H() })
    expect(r2.headers.get('content-range')).toBe('0-0/7')
    expect(r1.status).toBe(200)
    await f(GASTOS, { headers: { ...H(), Accept: 'application/vnd.pgrst.object+json' } })
    await f(GASTOS, { headers: H() })
    expect(fn).toHaveBeenCalledTimes(3) // HEAD 1x, objeto 1x, lista 1x
  })
})
