// joca-bateria.mjs — bateria de testes da IA do Joca (WhatsApp) contra a IA DE VERDADE.
//
//   npm run joca:bateria                 # roda todos os casos de tests/joca-casos.json, 1 vez
//   npm run joca:bateria -- --vezes 2    # roda 2 vezes (mostra o que muda de uma vez pra outra)
//   npm run joca:bateria -- --grupo "outra pessoa"   # só um grupo (pode repetir)
//   npm run joca:bateria -- --caso x05   # só um caso (pode repetir: --caso x05 --caso z03)
//
// Usa EXATAMENTE o que o webhook usa: instrucoesIA + limparIA + emDuvida do joca.js, o mesmo MODELO
// do index.ts (lido do arquivo) e o mesmo pedido (system + JSON com texto, cartões, pessoas, membros
// e pendente). Antes da IA, o mesmo atalho do webhook: "sim"/"não" e oi/obrigado/ajuda sem IA.
// Sem banco e sem WhatsApp: nada é salvo nem enviado. A chave vem de supabase/.env.local
// (ANTHROPIC_API_KEY) e nunca é mostrada.
//
// Erro GRAVE (zero aceitável): valor, cartão ou pessoa inventados/errados; dúvida que seria salva
// sem perguntar; pedido de investimento (ou pergunta, fatura...) que viraria lançamento salvo.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const J = await import(pathToFileURL(join(RAIZ, 'supabase/functions/whatsapp-webhook/joca.js')).href)
const C = await import(pathToFileURL(join(RAIZ, 'supabase/functions/whatsapp-webhook/consulta.js')).href)
const INDEX = readFileSync(join(RAIZ, 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8')
const MODELO = INDEX.match(/const MODELO = '([^']+)'/)?.[1]
if (!MODELO) throw new Error('não achei a constante MODELO no index.ts')
// Tarifa do /admin (tabela ia_tarifas, US$ por 1 milhão de tokens).
const TARIFA = { 'claude-haiku-5-5': [0.10, 0.50], 'claude-opus-5-5': [4, 20] }[MODELO] || [0, 0]
const DOLAR = 5.4 // só pra mostrar em reais (aproximado)

// ---------------------------------------------------------------- argumentos
const args = process.argv.slice(2)
const arg = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined }
const todos = (nome) => args.flatMap((a, i) => (a === nome ? [args[i + 1]] : []))
const VEZES = Math.max(1, Number(arg('--vezes')) || 1)
const SO_GRUPOS = todos('--grupo')
const SO_CASOS = todos('--caso')
const PARALELO = Math.max(1, Number(arg('--paralelo')) || 6)

// ---------------------------------------------------------------- chave (sem mostrar)
function lerChave() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  const lugares = [join(RAIZ, 'supabase/.env.local')]
  try { // numa worktree o .env.local fica no checkout principal
    const comum = execSync('git rev-parse --path-format=absolute --git-common-dir', { cwd: RAIZ }).toString().trim()
    lugares.push(join(dirname(comum), 'supabase/.env.local'))
  } catch { /* sem git */ }
  for (const f of lugares) {
    if (!existsSync(f)) continue
    const m = readFileSync(f, 'utf8').match(/^\s*ANTHROPIC_API_KEY\s*=\s*"?([^"\r\n]+)"?/m)
    if (m && m[1].trim()) return m[1].trim()
  }
  throw new Error('ANTHROPIC_API_KEY não encontrada em supabase/.env.local')
}
const CHAVE = lerChave()

// ---------------------------------------------------------------- casos e contexto
const { contexto: CTX, casos: TODOS } = JSON.parse(readFileSync(join(RAIZ, 'tests/joca-casos.json'), 'utf8'))
const casos = TODOS.filter((c) => (!SO_GRUPOS.length || SO_GRUPOS.includes(c.grupo)) && (!SO_CASOS.length || SO_CASOS.includes(c.id)))
if (!casos.length) throw new Error('nenhum caso com esse filtro')
const HOJE = CTX.hoje
const ONTEM = new Date(Date.parse(`${HOJE}T12:00:00Z`) - 864e5).toISOString().slice(0, 10)
const SYSTEM = J.instrucoesIA({ hoje: HOJE, semana: CTX.semana, categorias: CTX.categorias })
const nomeCartao = (id) => CTX.cartoes.find((c) => c.id === id)?.nome ?? null

// ---------------------------------------------------------------- IA (igual ao interpretar() do index.ts)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
async function chamarIA(texto, pendente) {
  const userMsg = JSON.stringify({ texto, cartoes: CTX.cartoes.map((c) => ({ id: c.id, nome: c.nome })), contas: CTX.contas || [], pessoas: CTX.pessoas, membros: CTX.membros, ...(pendente ? { pendente } : {}) })
  let tokIn = 0, tokOut = 0
  for (let tentativa = 1, semJson = 0; ; tentativa++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': CHAVE, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO, max_tokens: 1500, system: SYSTEM, messages: [{ role: 'user', content: userMsg }] }),
    })
    const out = await r.json().catch(() => ({}))
    if (!r.ok) {
      // Sobrecarga/limite: só a bateria espera e tenta de novo (o webhook responde "não entendi").
      if ([429, 500, 502, 503, 529].includes(r.status) && tentativa < 6) { await espera(2000 * tentativa); continue }
      throw new Error(out?.error?.message || `HTTP ${r.status}`)
    }
    tokIn += Number(out?.usage?.input_tokens) || 0
    tokOut += Number(out?.usage?.output_tokens) || 0
    const textoResp = Array.isArray(out?.content) ? (out.content.find((b) => b.type === 'text')?.text || '') : ''
    try {
      return { bruto: J.extrairJson(textoResp), tokIn, tokOut, semJson }
    } catch {
      semJson++
      if (semJson >= 2) return { bruto: null, tokIn, tokOut, semJson, erroIA: 'sem JSON 2x' } // webhook: "não entendi"
    }
  }
}

// ---------------------------------------------------------------- o que o webhook faria (sem banco)
// desfecho: salva | pergunta | sem_valor | muitos | qual_cartao | resposta | nao_entendi
async function simular(caso) {
  const { texto, pendente } = caso
  if (!pendente && J.ehSim(texto)) return { acao: 'ok', desfecho: 'resposta', semIA: true }
  if (!pendente && J.ehNao(texto)) return { acao: 'nao', desfecho: 'resposta', semIA: true }
  const rapida = J.respostaRapida(texto)
  if (rapida) return { acao: rapida, desfecho: 'resposta', semIA: true }

  const ia = await chamarIA(texto, pendente)
  if (!ia.bruto) return { acao: 'falha_ia', desfecho: 'nao_entendi', ...ia }
  const d = J.limparIA(ia.bruto, { texto, hoje: HOJE, categorias: CTX.categorias, cartoes: CTX.cartoes, pessoas: CTX.pessoas, membros: CTX.membros, contas: CTX.contas || [] })
  const base = { ...ia, dados: d, acao: d.acao }
  const lancar = (x) => (!x.valor ? 'sem_valor' : J.emDuvida(x) ? 'pergunta' : 'salva')
  switch (d.acao) {
    case 'lancar': return { ...base, desfecho: lancar(d), final: d }
    case 'lancar_varios': {
      const itens = d.itens || []
      if (!itens.length) return { ...base, desfecho: 'sem_valor', final: d }
      if (itens.length === 1) { const um = { ...itens[0], confianca: d.confianca }; return { ...base, acaoEfetiva: 'lancar', desfecho: lancar(um), final: um } }
      return { ...base, desfecho: itens.length > J.VARIOS_MAX ? 'muitos' : 'pergunta', final: d }
    }
    case 'corrigir_ultimo':
      if (!d.valor) return { ...base, desfecho: 'sem_valor', final: d }
      if (pendente) return { ...base, desfecho: 'salva', final: { ...pendente, valor: d.valor } } // salva o pendente com o valor novo
      return { ...base, desfecho: J.emDuvida(d) ? 'pergunta' : 'salva', final: d }
    case 'apagar_ultimo': return { ...base, desfecho: 'pergunta', final: d }
    case 'pagar_fatura': return { ...base, desfecho: d.cartao_id ? 'pergunta' : 'qual_cartao', final: d }
    case 'pagar_conta': return { ...base, desfecho: d.conta ? 'pergunta' : 'qual_conta', final: d }
    case 'pergunta': // igual ao webhook: com consulta, o texto sai do motor; sem, a resposta padrão
      return { ...base, desfecho: 'resposta', final: d, resposta: d.consulta ? C.responderConsulta(d.consulta, CTX.dados, HOJE) : J.TEXTOS.pergunta }
    default: return { ...base, desfecho: d.acao === 'outro' ? 'nao_entendi' : 'resposta', final: d }
  }
}

// ---------------------------------------------------------------- comparação
const lista = (v) => (Array.isArray(v) ? v : [v])
const dataEsperada = (v) => (v === 'hoje' ? HOJE : v === 'ontem' ? ONTEM : v)
const fmt = (v) => (v === null || v === undefined ? 'nada' : typeof v === 'string' ? `"${v}"` : String(v))
const ACOES_LANC = ['lancar', 'lancar_varios', 'corrigir_ultimo']

// Confere um lançamento (o principal ou um item da lista). Devolve [{ grav, msg }].
function conferirLanc(esp, got, prefixo = '') {
  const p = []
  const add = (grav, msg) => p.push({ grav, msg: prefixo + msg })
  if ('valor' in esp) {
    const ok = lista(esp.valor).some((v) => (v === null ? got.valor == null : Math.abs(Number(got.valor) - v) < 0.005))
    if (!ok) add('grave', `valor: esperado ${lista(esp.valor).map(fmt).join(' ou ')}, veio ${fmt(got.valor)}`)
  }
  if ('cartao' in esp) {
    const veio = got.cartao_nome ?? nomeCartao(got.cartao_id)
    if (!lista(esp.cartao).includes(veio ?? null)) add(veio ? 'grave' : 'erro', `cartão: esperado ${lista(esp.cartao).map(fmt).join(' ou ')}, veio ${fmt(veio)}`)
  }
  if ('pessoa' in esp) {
    const veio = got.pessoa ?? null
    if (!lista(esp.pessoa).includes(veio)) add(veio ? 'grave' : 'erro', `pessoa: esperado ${lista(esp.pessoa).map(fmt).join(' ou ')}, veio ${fmt(veio)}`)
  }
  for (const campo of ['tipo', 'parcelas', 'forma']) {
    if (campo in esp && !lista(esp[campo]).includes(got[campo] ?? null)) add('erro', `${campo}: esperado ${lista(esp[campo]).map(fmt).join(' ou ')}, veio ${fmt(got[campo])}`)
  }
  if ('data' in esp && !lista(esp.data).map(dataEsperada).includes(got.data)) add('erro', `data: esperado ${lista(esp.data).map(dataEsperada).join(' ou ')}, veio ${fmt(got.data)}`)
  if ('categoria' in esp && !lista(esp.categoria).includes(got.categoria)) add('aviso', `categoria: esperado ${lista(esp.categoria).join(' ou ')}, veio ${fmt(got.categoria)}`)
  return p
}

function conferir(caso, r) {
  const esp = caso.esperado
  const p = []
  const add = (grav, msg) => p.push({ grav, msg })
  const acao = r.acaoEfetiva || r.acao
  const salvou = r.desfecho === 'salva'

  if (r.acao === 'falha_ia') add('erro', `a IA não devolveu JSON (${r.erroIA}) — o Joca responderia "não entendi"`)
  if ('acao' in esp && !lista(esp.acao).includes(acao) && !lista(esp.acao).includes(r.acao)) {
    const espLanc = lista(esp.acao).some((a) => ACOES_LANC.includes(a))
    const grave = lista(esp.acao).includes('investimento') || (!espLanc && salvou)
    add(grave ? 'grave' : 'erro', `ação: esperado ${lista(esp.acao).join(' ou ')}, veio ${acao}${salvou ? ' (e SALVARIA)' : ''}`)
  }
  if (esp.duvida === true && salvou) add('grave', 'era pra perguntar antes, mas salvaria direto')
  if (esp.duvida === false && !salvou && ACOES_LANC.includes(acao)) add('erro', `era pra salvar direto, mas ${r.desfecho === 'pergunta' ? 'perguntou "tá certo?"' : r.desfecho}`)
  if ('desfecho' in esp && !lista(esp.desfecho).includes(r.desfecho)) add('erro', `desfecho: esperado ${lista(esp.desfecho).join(' ou ')}, veio ${r.desfecho}`)

  // Perguntas com os números do app (A8.23 parte 2): a IA só diz o que a pessoa quer saber; o
  // texto sai do motor com os dados de mentira (contexto.dados). Número errado na resposta = grave.
  if ('consulta' in esp && r.acao === 'pergunta') {
    const ec = esp.consulta, got = r.dados?.consulta || null
    if (ec === null && got) add('erro', `era pra responder "ainda não sei", mas virou consulta ${got.tipo}`)
    if (ec && !got) add('erro', `era consulta ${ec.tipo}, mas veio sem consulta (resposta padrão)`)
    if (ec && got) {
      if (ec.tipo && got.tipo !== ec.tipo) add('erro', `consulta: esperado ${ec.tipo}, veio ${got.tipo}`)
      if (ec.mes && got.mes !== ec.mes) add('erro', `mês: esperado ${ec.mes}, veio ${got.mes}`)
      if ('cartao' in ec) {
        const veio = nomeCartao(got.cartao_id)
        if (veio !== ec.cartao) add(veio ? 'grave' : 'erro', `cartão: esperado ${fmt(ec.cartao)}, veio ${fmt(veio)}`)
      }
    }
  }
  // "Paguei a X" (27/11): conta errada marcaria outra conta como paga = grave; conta nenhuma = o Joca pergunta qual.
  if ('conta' in esp && r.acao === 'pagar_conta') {
    const veio = r.dados?.conta ?? null
    if (!lista(esp.conta).includes(veio)) add(veio ? 'grave' : 'erro', `conta: esperado ${lista(esp.conta).map(fmt).join(' ou ')}, veio ${fmt(veio)}`)
  }
  if (Array.isArray(esp.resposta_contem)) {
    for (const trecho of esp.resposta_contem) if (!String(r.resposta || '').includes(trecho)) add('grave', `a resposta não tem "${trecho}"`)
  }

  if (r.final && r.acao !== 'pergunta') {
    if (Array.isArray(esp.itens)) {
      const itens = r.acao === 'lancar_varios' ? (r.dados?.itens || []) : [r.final]
      if (itens.length !== esp.itens.length) add('erro', `itens: esperado ${esp.itens.length}, vieram ${itens.length}`)
      esp.itens.forEach((ei, i) => { if (itens[i]) p.push(...conferirLanc(ei, itens[i], `item ${i + 1} · `)) })
    } else if (!(r.acao === 'lancar_varios' && !r.acaoEfetiva)) {
      p.push(...conferirLanc(esp, r.final))
    } else {
      // esperava UM lançamento e veio uma lista: a ação já contou como erro; aqui só confere se
      // algum item inventou cartão ou pessoa.
      const soQuem = Object.fromEntries(['cartao', 'pessoa'].filter((k) => k in esp).map((k) => [k, esp[k]]))
      ;(r.dados?.itens || []).forEach((it, i) => p.push(...conferirLanc(soQuem, it, `item ${i + 1} · `)))
    }
  }
  const nota = p.some((x) => x.grav === 'grave') ? 'grave' : p.some((x) => x.grav === 'erro') ? 'erro' : 'ok'
  return { nota, problemas: p }
}

// ---------------------------------------------------------------- execução
async function rodarTodos() {
  const res = new Array(casos.length)
  let prox = 0
  await Promise.all(Array.from({ length: PARALELO }, async () => {
    while (prox < casos.length) {
      const i = prox++
      const c = casos[i]
      try {
        const r = await simular(c)
        res[i] = { caso: c, r, ...conferir(c, r) }
      } catch (e) {
        res[i] = { caso: c, r: { acao: 'falha_rede', desfecho: 'nao_entendi', tokIn: 0, tokOut: 0 }, nota: 'erro', problemas: [{ grav: 'erro', msg: `falha ao chamar a IA: ${e.message}` }] }
      }
      process.stdout.write(res[i].nota === 'ok' ? '.' : res[i].nota === 'grave' ? 'G' : 'x')
    }
  }))
  process.stdout.write('\n')
  return res
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-')
const resumoDados = (r) => {
  const f = r.final || {}
  if (r.semIA) return `(sem IA) ${r.acao}`
  if (r.acao === 'pergunta') return `pergunta ${r.dados?.consulta ? JSON.stringify(r.dados.consulta) : '(sem consulta)'} → "${String(r.resposta || '').split('\n')[0]}"`
  if (r.acao === 'lancar_varios' && !r.acaoEfetiva) return `vários: ${(r.dados?.itens || []).map((i) => `${i.valor}${i.cartao_nome ? ' ' + i.cartao_nome : ''}${i.pessoa ? ' de ' + i.pessoa : ''}`).join(' | ')} (conf ${r.dados?.confianca})`
  return `${r.acaoEfetiva || r.acao} ${f.tipo || ''} ${f.valor ?? '-'} "${f.descricao || ''}" ${f.cartao_nome || ''} ${f.parcelas > 1 ? f.parcelas + 'x' : ''} ${f.data || ''} ${f.forma || ''} ${f.pessoa ? 'de ' + f.pessoa + (f.pessoa_nova ? ' (nova)' : '') : ''} conf ${f.confianca ?? r.dados?.confianca}`.replace(/\s+/g, ' ')
}

console.log(`\n🤖 Bateria do Joca — ${casos.length} casos × ${VEZES} ${VEZES > 1 ? 'vezes' : 'vez'} · modelo ${MODELO} · hoje fixo ${HOJE} (${CTX.semana})\n`)
const rodadas = []
let tokIn = 0, tokOut = 0, chamadas = 0
for (let v = 1; v <= VEZES; v++) {
  if (VEZES > 1) process.stdout.write(`Rodada ${v}: `)
  const res = await rodarTodos()
  rodadas.push(res)
  for (const x of res) { tokIn += x.r.tokIn || 0; tokOut += x.r.tokOut || 0; if (!x.r.semIA) chamadas++ }
}

for (const [v, res] of rodadas.entries()) {
  const grupos = [...new Set(res.map((x) => x.caso.grupo))]
  console.log(`\n=== ${VEZES > 1 ? `Rodada ${v + 1}` : 'Placar'} ===`)
  console.log('Grupo'.padEnd(26) + 'Casos  Certos  Erros  Graves')
  for (const g of grupos) {
    const gs = res.filter((x) => x.caso.grupo === g)
    const ok = gs.filter((x) => x.nota === 'ok').length
    const er = gs.filter((x) => x.nota === 'erro').length
    const gr = gs.filter((x) => x.nota === 'grave').length
    console.log(`${g.padEnd(26)}${String(gs.length).padStart(5)}${String(ok).padStart(8)}${String(er).padStart(7)}${String(gr).padStart(8)}${gr ? '  ⚠️' : ''}`)
  }
  const ok = res.filter((x) => x.nota === 'ok').length
  const gr = res.filter((x) => x.nota === 'grave').length
  console.log(`${'TOTAL'.padEnd(26)}${String(res.length).padStart(5)}${String(ok).padStart(8)}${String(res.length - ok - gr).padStart(7)}${String(gr).padStart(8)}   → ${pct(ok, res.length)} certos, ${gr} grave${gr === 1 ? '' : 's'}`)

  const ruins = res.filter((x) => x.nota !== 'ok')
  if (ruins.length) {
    console.log('\nO que errou:')
    for (const x of ruins) {
      console.log(`  ${x.nota === 'grave' ? '🔴 GRAVE' : '🟡 erro '} [${x.caso.id}] "${x.caso.texto}"${x.caso.pendente ? ' (respondendo um tá certo?)' : ''}`)
      for (const pr of x.problemas.filter((q) => q.grav !== 'aviso')) console.log(`        - ${pr.msg}`)
      console.log(`        Joca entendeu: ${resumoDados(x.r)} → ${x.r.desfecho}`)
    }
  }
  const avisos = res.filter((x) => x.problemas.some((q) => q.grav === 'aviso'))
  if (avisos.length) console.log(`\nAvisos (categoria, não conta como erro): ${avisos.map((x) => `[${x.caso.id}] ${x.problemas.find((q) => q.grav === 'aviso').msg}`).join(' · ')}`)
}

if (VEZES > 1) {
  const variaram = casos.filter((_, i) => new Set(rodadas.map((res) => res[i].nota)).size > 1)
  console.log(`\nVariação entre rodadas: ${variaram.length ? variaram.map((c) => `[${c.id}] "${c.texto}" (${rodadas.map((res) => res[casos.indexOf(c)].nota).join(' → ')})`).join(' · ') : 'nenhuma — deu o mesmo resultado em todas'}`)
}

const usd = (tokIn * TARIFA[0] + tokOut * TARIFA[1]) / 1e6
console.log(`\n💰 Custo estimado: ${chamadas} chamadas à IA, ${tokIn} tokens de entrada + ${tokOut} de saída ≈ US$ ${usd.toFixed(4)} (~R$ ${(usd * DOLAR).toFixed(2)}) · por mensagem ≈ US$ ${(usd / Math.max(1, chamadas)).toFixed(5)} (tarifa do /admin: US$ ${TARIFA[0]}/${TARIFA[1]} por milhão)`)

const pasta = join(tmpdir(), 'hopefin-joca-bateria'); mkdirSync(pasta, { recursive: true })
const arq = join(pasta, `bateria-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(arq, JSON.stringify(rodadas.map((res) => res.map((x) => ({ id: x.caso.id, texto: x.caso.texto, nota: x.nota, problemas: x.problemas, desfecho: x.r.desfecho, bruto: x.r.bruto, final: x.r.final }))), null, 2))
console.log(`📄 Detalhe completo (respostas da IA): ${arq}\n`)
const graves = rodadas.flat().filter((x) => x.nota === 'grave').length
process.exitCode = graves ? 1 : 0
