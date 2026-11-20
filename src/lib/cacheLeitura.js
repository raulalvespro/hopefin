// Memória das leituras do banco (desempenho, 19/11/2026).
//
// Cada ida ao Supabase leva ~0,2 s (o banco fica em Oregon, EUA) e cada aba buscava tudo de
// novo a cada visita, em várias idas seguidas. Agora:
// - Leitura do banco (GET/HEAD em /rest/v1) já feita volta NA HORA da memória, e uma leitura
//   nova vai por trás. Se o banco mudou (outro celular, WhatsApp), avisa as telas abertas
//   (aoMudarDados → hook useAtualizarSozinho) e elas se atualizam sem "Carregando".
// - Qualquer escrita (POST/PATCH/PUT/DELETE no banco ou chamada de função, que pode gravar)
//   apaga a memória toda ANTES e DEPOIS de ir: depois de salvar nunca aparece dado velho.
//   Leitura que começou antes de uma escrita e chega depois dela não entra na memória.
// - A chave inclui o token do usuário (um usuário nunca vê a leitura de outro) e sair da conta
//   apaga tudo (supabase.js). Fica só na memória da aba: nada é gravado no aparelho.

const MAX_ITENS = 120
const IDADE_MAX = 5 * 60_000    // mais velha que isso: espera a leitura nova
const REVALIDAR_APOS = 1_500    // a mesma leitura não vai por trás 2x em 1,5 s
// RPC só de leitura (não apaga a memória). Na dúvida, NÃO pôr aqui: tratar leitura como
// escrita só custa desempenho; tratar escrita como leitura mostraria dado velho.
const RPC_SO_LEITURA = new Set(['minhas_flags', 'planos_publicos', 'config_mascote'])

const memoria = new Map()   // chave -> { t, status, statusText, headers, body, head }
const emVoo = new Set()     // chaves com leitura por trás em andamento
const ouvintes = new Set()
let versao = 0
let avisoAgendado = null

// A tela se inscreve pra se atualizar quando uma leitura por trás trouxe dado diferente.
export function aoMudarDados(fn) {
  ouvintes.add(fn)
  return () => { ouvintes.delete(fn) }
}

// Apaga tudo (escrita, sair da conta, "puxar pra atualizar").
export function limparLeituras() {
  memoria.clear()
  emVoo.clear()
  versao++
}

// Só pra teste
export const _estado = () => ({ itens: memoria.size, versao, ouvintes: ouvintes.size })

function avisar() {
  if (avisoAgendado) return
  avisoAgendado = setTimeout(() => {
    avisoAgendado = null
    for (const fn of [...ouvintes]) {
      try { fn() } catch (e) { console.error('[cacheLeitura] aviso', e) }
    }
  }, 60)
}

function urlDe(input) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input?.url || ''
}

function chaveDe(metodo, url, headers) {
  const partes = []
  new Headers(headers || {}).forEach((v, k) => { if (k !== 'x-client-info') partes.push(`${k}:${v}`) })
  partes.sort()
  return `${metodo} ${url} ${partes.join('|')}`
}

function rpcDe(url) {
  const m = url.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i)
  return m ? m[1] : null
}

function guardar(chave, item) {
  memoria.delete(chave) // reinsere no fim (a mais nova fica por último)
  memoria.set(chave, item)
  while (memoria.size > MAX_ITENS) memoria.delete(memoria.keys().next().value)
}

const resposta = (item) => new Response(item.head ? null : item.body, {
  status: item.status, statusText: item.statusText, headers: item.headers,
})

const guardavel = (r) => r.status === 200 || r.status === 206

export function criarFetchComMemoria(fetchBase = (...a) => fetch(...a)) {
  async function ler(chave, input, init, head) {
    const v = versao
    const r = await fetchBase(input, init)
    if (guardavel(r) && v === versao) {
      try {
        const body = head ? '' : await r.clone().text()
        if (v === versao) guardar(chave, { t: Date.now(), status: r.status, statusText: r.statusText, headers: [...r.headers.entries()], body, head })
      } catch { /* sem memória pra essa leitura */ }
    }
    return r
  }

  function lerPorTras(chave, input, init, antigo) {
    if (emVoo.has(chave)) return
    emVoo.add(chave)
    const v = versao
    const { signal: _semSinal, ...semSinal } = init || {}
    fetchBase(input, semSinal)
      .then(async (r) => {
        if (!guardavel(r)) return
        const body = antigo.head ? '' : await r.text()
        if (v !== versao) return // houve escrita no meio: não guarda
        const faixa = (hs) => new Headers(hs).get('content-range')
        const mudou = body !== antigo.body || r.headers.get('content-range') !== faixa(antigo.headers)
        guardar(chave, { t: Date.now(), status: r.status, statusText: r.statusText, headers: [...r.headers.entries()], body, head: antigo.head })
        if (mudou) avisar()
      })
      .catch(() => { /* sem rede: fica o que já tinha */ })
      .finally(() => { emVoo.delete(chave) })
  }

  return async function fetchComMemoria(input, init = {}) {
    const url = urlDe(input)
    const metodo = String(init?.method || input?.method || 'GET').toUpperCase()
    const ehBanco = url.includes('/rest/v1/')
    const ehFuncao = url.includes('/functions/v1/')
    const ehLeitura = metodo === 'GET' || metodo === 'HEAD'

    if (!ehLeitura) {
      const escreve = (ehBanco && !RPC_SO_LEITURA.has(rpcDe(url))) || ehFuncao
      if (!escreve) return fetchBase(input, init)
      limparLeituras()
      try { return await fetchBase(input, init) } finally { limparLeituras() }
    }

    // Só leitura do banco por endereço simples entra na memória (auth, arquivos etc. não).
    if (!ehBanco || typeof input === 'object' && !(input instanceof URL)) return fetchBase(input, init)

    const head = metodo === 'HEAD'
    const chave = chaveDe(metodo, url, init?.headers)
    const item = memoria.get(chave)
    if (item && Date.now() - item.t < IDADE_MAX) {
      if (Date.now() - item.t > REVALIDAR_APOS) lerPorTras(chave, input, init, item)
      return resposta(item)
    }
    return ler(chave, input, init, head)
  }
}
