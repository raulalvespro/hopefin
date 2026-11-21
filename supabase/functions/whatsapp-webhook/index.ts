// whatsapp-webhook — recebe mensagens do WhatsApp Cloud API (Meta) e conversa com a pessoa como o
// Joca: lança gastos/entradas, marca fatura paga, apaga ou corrige o último lançamento.
// (prompt 11.1 / L23; Joca parte 1 = A8.23 + A8.24, 20/11/2026.)
//
// Roda como SERVICE_ROLE (a Meta chama sem JWT) -> deploy SEM verificação de JWT:
//   supabase functions deploy whatsapp-webhook --no-verify-jwt
// Como NÃO há RLS neste caminho, TODA a trava (assinatura, teto mensal, isolamento por grupo,
// só mexer no que é da própria pessoa) vem das RPCs wa_* (SECURITY DEFINER, só service_role):
// migrações 0055, 0056, 0063 e 0078.
//
// Fluxo de uma mensagem:
//   1) idempotência pelo id da Meta (whatsapp_mensagens.wa_message_id único)
//   2) se o WhatsApp está pausado no /admin -> responde e para
//   3) texto com código de conexão pendente -> vincula o número (opção A)
//   4) número não verificado -> orienta a conectar (sem gastar IA nem transcrição)
//   5) confirmação pendente ("tá certo?", fatura, apagar, corrigir) + "sim"/"não" -> resolve sem IA
//   6) trava (assinatura, teto do mês, teto de IA por pessoa/dia) ANTES de gastar IA/áudio
//   7) áudio -> Whisper; texto -> IA (Claude Haiku) entende a ação e o webhook executa
//
// Simulação (testes, sem WhatsApp de verdade): POST com headers x-joca-simulacao: 1 e
// x-cron-secret: <CRON_SECRET>, corpo { from: '5500...', texto, tipo?: 'audio', transcricao?,
// segundos?, audio_falha? }. Só aceita números de teste 5500... (DDD 00 não existe), NUNCA chama a
// API da Meta (nem envio, nem mídia) e devolve as respostas no JSON. O resto (IA, banco, consumo,
// custo) é o caminho de verdade.
//
// Segredos (scripts/set-secrets.mjs, de supabase/.env.local):
//   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TOKEN, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET,
//   ANTHROPIC_API_KEY, OPENAI_API_KEY, CRON_SECRET. (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY são injetados.)
//   WHATSAPP_STICKER_JOCA_ID (opcional): media_id de um sticker do Joca para as boas-vindas.

import { createClient } from 'npm:@supabase/supabase-js@2'
import * as J from './joca.js'
import { faturasDoCartaoAgora, faturaDoCartao, compDe, addMeses, hojeBRT } from '../_shared/motor.js'
import { carregarDadosMotor } from '../_shared/motor-dados.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || ''
const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN') || ''
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || ''
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') || ''
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') || ''   // transcrição de áudio (Whisper)
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''      // libera o modo simulação
const STICKER_JOCA = Deno.env.get('WHATSAPP_STICKER_JOCA_ID') || ''
const MODELO = 'claude-haiku-5-5'                          // IA barata em tudo (decisão do Raul, 20/11)
const GRAPH = 'https://graph.facebook.com/v21.0'
const NUMERO_TESTE = /^5500\d{6,11}$/                      // simulação: DDD 00 não existe no Brasil

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

// ---- utilidades ----
function semanaSP() {
  const sp = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][sp.getDay()]
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Para ENVIAR a um celular brasileiro: a Meta entrega o `from` SEM o 9 (55+DDD+8
// = 12 dígitos), mas a lista de permissão/entrega espera o número COM o 9. Então
// reinserimos o 9 após o DDD no envio. A Meta normaliza de volta no wa_id. A
// entrada/armazenamento continua como vem (o wa_id canônico, sem o 9).
function paraEnvio(num: string): string {
  const d = String(num).replace(/\D/g, '')
  if (d.startsWith('55') && d.length === 12) return d.slice(0, 4) + '9' + d.slice(4)
  return d
}

// Valida a assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o App Secret).
async function assinaturaOk(raw: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET) return false
  if (!header || !header.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
  const esperado = header.slice('sha256='.length)
  return iguais(hex, esperado)
}
// comparação de tempo constante
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ---- saída real (Meta) ----
async function enviarTexto(to: string, body: string) {
  if (!PHONE_ID || !WA_TOKEN) { console.error('[whatsapp] sem PHONE_ID/TOKEN'); return }
  try {
    await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: paraEnvio(to), type: 'text', text: { body } }),
    })
  } catch (e) { console.error('[whatsapp] enviarTexto', (e as Error).message) }
}

async function enviarStickerJoca(to: string) {
  if (!STICKER_JOCA) return
  try {
    await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: paraEnvio(to), type: 'sticker', sticker: { id: STICKER_JOCA } }),
    })
  } catch (_) { /* opcional, silencioso */ }
}

// Baixa o áudio da Meta (Graph) e transcreve via OpenAI Whisper -> texto PT-BR + duração.
// WhatsApp manda nota de voz como audio/ogg (opus), que o Whisper aceita.
async function transcreverAudio(mediaId: string | undefined): Promise<{ texto: string, segundos: number, longo?: boolean }> {
  if (!OPENAI_KEY) throw new Error('sem OPENAI_API_KEY')
  if (!mediaId) throw new Error('sem media id')
  // 1) metadados da mídia -> URL temporária (+ tamanho: áudio muito longo nem transcreve)
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${WA_TOKEN}` } })
  const mj = await meta.json()
  if (!meta.ok || !mj?.url) throw new Error(mj?.error?.message || 'mídia sem url')
  if (Number(mj.file_size) > J.AUDIO_MAX_BYTES) return { texto: '', segundos: 0, longo: true }
  // 2) baixa o binário (exige o mesmo Bearer da Graph)
  const bin = await fetch(mj.url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } })
  if (!bin.ok) throw new Error(`download HTTP ${bin.status}`)
  const buf = new Uint8Array(await bin.arrayBuffer())
  if (buf.length > J.AUDIO_MAX_BYTES) return { texto: '', segundos: 0, longo: true }
  const mime = String(mj.mime_type || 'audio/ogg').split(';')[0]
  const ext = mime.includes('mpeg') || mime.includes('mp3') ? 'mp3'
    : mime.includes('wav') ? 'wav'
    : mime.includes('mp4') || mime.includes('m4a') ? 'm4a'
    : mime.includes('webm') ? 'webm' : 'ogg'
  // 3) Whisper (pt). Form multipart. verbose_json traz a duração (custo real no /admin).
  const form = new FormData()
  form.append('file', new Blob([buf], { type: mime }), `audio.${ext}`)
  form.append('model', 'whisper-1')
  form.append('language', 'pt')
  form.append('response_format', 'verbose_json')
  const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: form,
  })
  const tj = await tr.json()
  if (!tr.ok) throw new Error(tj?.error?.message || `Whisper HTTP ${tr.status}`)
  return { texto: String(tj?.text || '').trim(), segundos: Number(tj?.duration) || 0 }
}

// ---- banco ----
async function logMsg(row: Record<string, unknown>) {
  try { await admin.from('whatsapp_mensagens').insert(row) } catch (_) { /* silencioso */ }
}

// Custo real de cada chamada de IA (ia_chamadas, aparece no /admin). Não derruba a conversa.
async function registrarIA(u: any, operacao: string, modelo: string, extra: Record<string, unknown>) {
  try {
    await admin.rpc('wa_registrar_ia_chamada', {
      p_grupo: u.grupo_id, p_usuario: u.usuario_id, p_operacao: operacao, p_modelo: modelo,
      p_tokens_entrada: extra.tokensIn ?? 0, p_tokens_saida: extra.tokensOut ?? 0, p_ms: extra.ms ?? null,
      p_sucesso: extra.sucesso ?? true, p_erro: extra.erro ?? null, p_custo_usd: extra.custoUsd ?? null,
    })
  } catch (_) { /* silencioso */ }
}

// Estado da conversa (whatsapp_estado, migração 0078): a confirmação que espera o "sim".
async function lerEstado(usuarioId: string) {
  const { data } = await admin.from('whatsapp_estado')
    .select('pendencia, pendencia_expira').eq('usuario_id', usuarioId).maybeSingle()
  return data
}
async function guardarPendencia(u: any, pendencia: Record<string, unknown>) {
  const expira = new Date(Date.now() + J.PENDENCIA_MIN * 60_000).toISOString()
  const { error } = await admin.from('whatsapp_estado').upsert(
    { usuario_id: u.usuario_id, grupo_id: u.grupo_id, pendencia, pendencia_expira: expira, atualizado_em: new Date().toISOString() },
    { onConflict: 'usuario_id' },
  )
  if (error) throw new Error(`pendência: ${error.message}`)
}
async function limparPendencia(usuarioId: string) {
  await admin.from('whatsapp_estado')
    .update({ pendencia: null, pendencia_expira: null, atualizado_em: new Date().toISOString() })
    .eq('usuario_id', usuarioId)
}

// Trava antes de gastar IA/áudio: assinatura + teto do mês (wa_pode_grupo) e, contra abuso,
// no máximo `por_pessoa_dia` chamadas de IA por pessoa no dia (limites_config).
async function trava(u: any): Promise<string | null> {
  const { data: pode, error } = await admin.rpc('wa_pode_grupo', { p_grupo: u.grupo_id })
  if (error) return 'falha'
  if (!pode?.pode) return pode?.motivo === 'limite' ? 'limite' : 'assinatura'
  const { data: lc } = await admin.from('limites_config').select('por_pessoa_dia').eq('id', 1).maybeSingle()
  const limiteDia = Number(lc?.por_pessoa_dia) || 40
  const { count } = await admin.from('ia_chamadas').select('id', { count: 'exact', head: true })
    .eq('usuario_id', u.usuario_id).like('operacao', 'whatsapp%').gte('criado_em', `${hojeBRT()}T00:00:00-03:00`)
  if ((count || 0) >= limiteDia) return 'limite_dia'
  return null
}
const TEXTO_TRAVA: Record<string, string> = {
  limite: J.TEXTOS.limite, assinatura: J.TEXTOS.assinatura, limite_dia: J.TEXTOS.limiteDia, falha: J.TEXTOS.falhaSalvar,
}

// Interpreta a mensagem no contexto do grupo (categorias/cartões), com a IA barata (Haiku).
// `pendente`: o lançamento que espera o "sim" (a pessoa pode estar corrigindo ele).
async function interpretar(u: any, texto: string, pendente?: Record<string, unknown>) {
  const [{ data: cats }, { data: cartoes }] = await Promise.all([
    admin.from('categorias').select('nome').eq('grupo_id', u.grupo_id).order('nome'),
    admin.from('cartoes').select('id, nome').eq('grupo_id', u.grupo_id).eq('ativo', true),
  ])
  const categorias = (cats || []).map((c: any) => c.nome)
  const hoje = hojeBRT()
  const system = J.instrucoesIA({ hoje, semana: semanaSP(), categorias })
  const userMsg = JSON.stringify({ texto, cartoes: (cartoes || []).map((c: any) => ({ id: c.id, nome: c.nome })), ...(pendente ? { pendente } : {}) })

  // Às vezes (raro) a IA responde sem o JSON — viu-se em 20/11 ("janta 100 no itaú" deu "não
  // entendi" e na 2ª vez lançou). Nesse caso tenta de novo UMA vez; erro de rede/HTTP não repete.
  for (let tentativa = 1; ; tentativa++) {
    let tokensIn = 0, tokensOut = 0
    const t0 = Date.now()
    let semJson = false
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODELO, max_tokens: 1500, system, messages: [{ role: 'user', content: userMsg }] }), // 1500: cabe a lista de vários
      })
      const out = await r.json()
      if (!r.ok) throw new Error(out?.error?.message || `Anthropic HTTP ${r.status}`)
      tokensIn = Number(out?.usage?.input_tokens) || 0
      tokensOut = Number(out?.usage?.output_tokens) || 0
      // O Haiku pode devolver um bloco "thinking" antes do texto — pegue o de texto.
      const textoResp = Array.isArray(out?.content) ? (out.content.find((b: any) => b.type === 'text')?.text || '') : ''
      let bruto
      try { bruto = J.extrairJson(textoResp) } catch (e) {
        semJson = true
        throw new Error(`sem JSON (stop: ${out?.stop_reason || '?'}, ${String(textoResp).length} letras)`)
      }
      const dados = J.limparIA(bruto, { texto, hoje, categorias, cartoes: cartoes || [] })
      await registrarIA(u, 'whatsapp_interpretar', MODELO, { tokensIn, tokensOut, ms: Date.now() - t0 })
      return { dados, cartoes: cartoes || [] }
    } catch (e) {
      await registrarIA(u, 'whatsapp_interpretar', MODELO, {
        tokensIn, tokensOut, ms: Date.now() - t0, sucesso: false,
        erro: `${tentativa > 1 ? '2ª tentativa: ' : ''}${String((e as Error)?.message || '')}`.slice(0, 300),
      })
      if (!semJson || tentativa >= 2) throw e
    }
  }
}

// A fatura que o "Marcar como paga" de Cartões mostraria agora (mesma regra e mesmo motor do app).
async function faturaDoMomento(grupoId: string, cartaoId: string, comp?: string) {
  const hoje = hojeBRT()
  const compHoje = compDe(hoje)
  const dados = await carregarDadosMotor(admin, grupoId, { compIni: addMeses(compHoje, -4), compFim: addMeses(compHoje, 2) })
  const cartao = (dados.cartoes || []).find((c: any) => c.id === cartaoId)
  if (!cartao) return { cartao: null }
  if (comp) return { cartao, alvo: faturaDoCartao(cartao, comp, dados, hoje) }
  const { aPagar, aberta } = faturasDoCartaoAgora(cartao, dados, hoje)
  // Cartões: a fatura a pagar; sem ela, a aberta só se vence este mês, não está paga e tem valor.
  const alvo = aPagar || (compDe(aberta.vencimento) === compHoje && !aberta.paga && aberta.total > 0 ? aberta : null)
  return { cartao, alvo, aberta, doMes: faturaDoCartao(cartao, compHoje, dados, hoje) }
}

// ---- a conversa ----
type Ctx = {
  enviar: (to: string, body: string) => Promise<void>,
  sticker: (to: string) => Promise<void>,
  transcrever: (mediaId: string | undefined) => Promise<{ texto: string, segundos: number, longo?: boolean }>,
}

async function processar(m: any, ctx: Ctx) {
  const tipoMsg = m?.type
  if (tipoMsg !== 'text' && tipoMsg !== 'audio') return
  const waId = String(m.id || '')
  const from = String(m.from || '')          // dígitos com DDI, ex. 5511999998888
  if (!waId || !from) return

  // 1) Idempotência (ANTES de transcrever/gastar): a tabela tem unique(wa_message_id).
  const { error: dupErr } = await admin.from('whatsapp_mensagens').insert({
    wa_message_id: waId, telefone: from, direcao: 'entrada', tipo: 'desconhecido',
    texto: tipoMsg === 'audio' ? '[áudio]' : String(m?.text?.body || '').trim(),
  })
  if (dupErr && (dupErr as any).code === '23505') return

  let u: any = null
  const responder = async (texto: string, tipo: string, nota: string) => {
    await ctx.enviar(from, texto)
    await logMsg({ telefone: from, direcao: 'saida', usuario_id: u?.usuario_id || null, grupo_id: u?.grupo_id || null, tipo, texto: nota })
  }

  // 2) Pausa global do /admin.
  const { data: cfg } = await admin.from('admin_config').select('whatsapp_pausado').eq('id', 1).maybeSingle()
  if (cfg?.whatsapp_pausado) return responder(J.TEXTOS.pausado, 'bloqueado', 'pausado')

  // 3) Código de conexão (opção A). A mensagem pode ser uma frase ("...meu código é A1B2C3"),
  // então extraímos os tokens de 6 hex (formato do código) e tentamos cada um.
  let texto = tipoMsg === 'text' ? String(m?.text?.body || '').trim() : ''
  if (texto) {
    const candidatos = Array.from(new Set((texto.toUpperCase().match(/\b[0-9A-F]{6}\b/g) || [])))
    for (const cod of candidatos) {
      const { data: conn } = await admin.rpc('wa_conectar', { p_telefone: from, p_codigo: cod })
      if (conn?.ok) {
        u = { usuario_id: conn.usuario_id, grupo_id: conn.grupo_id }
        await responder(J.TEXTOS.boasVindas(conn.nome), 'conexao', 'conectado')
        await ctx.sticker(from)
        return
      }
    }
  }

  // 4) Número já verificado? (antes de qualquer gasto com IA ou áudio)
  const { data: quem } = await admin.rpc('wa_usuario', { p_telefone: from })
  if (!quem?.ok) {
    if (quem?.motivo === 'sem_grupo') return responder(J.TEXTOS.semGrupo, 'bloqueado', 'sem grupo')
    return responder(J.TEXTOS.naoConectado, 'desconhecido', 'orientou a conectar')
  }
  u = quem

  // 5) Áudio: trava antes de transcrever (o Whisper é o que mais custa) e custo real no /admin.
  let travou: string | null | undefined
  if (tipoMsg === 'audio') {
    travou = await trava(u)
    if (travou) return responder(TEXTO_TRAVA[travou], 'bloqueado', travou)
    const t0 = Date.now()
    try {
      const t = await ctx.transcrever(m?.audio?.id)
      if (t.longo) return responder(J.TEXTOS.audioLongo, 'erro', 'áudio longo')
      texto = t.texto
      await registrarIA(u, 'whatsapp_audio', 'whisper-1', { ms: Date.now() - t0, custoUsd: J.custoAudioUsd(t.segundos) })
    } catch (e) {
      console.error('[whatsapp] transcrever', (e as Error).message)
      await registrarIA(u, 'whatsapp_audio', 'whisper-1', { ms: Date.now() - t0, sucesso: false, erro: String((e as Error).message).slice(0, 300) })
      return responder(J.TEXTOS.audio, 'erro', 'falha transcrição')
    }
  }
  if (!texto) return responder(J.TEXTOS.vazio, 'erro', 'sem texto')

  // 6) Confirmação pendente ("sim" / "não"), sem IA.
  const estado = await lerEstado(u.usuario_id)
  const pend = estado?.pendencia || null
  const pendAtiva = !!pend && !!estado?.pendencia_expira && new Date(estado.pendencia_expira).getTime() > Date.now()
  let pendAnterior: any = null
  if (pend && !pendAtiva) {
    await limparPendencia(u.usuario_id)
    if (J.ehSim(texto)) return responder(J.TEXTOS.expirou, 'resposta', 'confirmação expirada')
  }
  if (pendAtiva) {
    if (J.ehSim(texto)) return executarPendencia(u, pend, responder)
    // Lista de vários esperando o "sim": "tira o 2" / "o 3 é 70" arrumam a lista sem IA.
    if (pend.acao === 'lancar_varios') {
      const ed = J.editarLista(texto, pend.itens)
      if (ed?.erro) return responder(J.TEXTOS_VARIOS.numeroInvalido(ed.n, (pend.itens || []).length), 'resposta', 'vários: número inválido')
      if (ed?.itens) {
        if (!ed.itens.length) { await limparPendencia(u.usuario_id); return responder(J.TEXTOS_VARIOS.esvaziou, 'resposta', 'vários: esvaziou') }
        try { await guardarPendencia(u, { acao: 'lancar_varios', itens: ed.itens }) } catch (_) {
          return responder(J.TEXTOS.falhaSalvar, 'erro', 'falha pendência')
        }
        return responder(J.TEXTOS_VARIOS.pergunta(ed.itens, hojeBRT(), true), 'resposta', 'vários: arrumou')
      }
    }
    await limparPendencia(u.usuario_id)
    if (J.ehNao(texto)) return responder(J.TEXTOS.cancelado, 'resposta', 'cancelou')
    pendAnterior = pend                            // a pessoa mandou outra coisa: vale a mensagem nova
  } else if (J.ehSim(texto)) {
    return responder(J.TEXTOS.okSemPendencia, 'resposta', 'ok')
  } else if (J.ehNao(texto)) {
    return responder(J.TEXTOS.naoSemPendencia, 'resposta', 'não')
  }

  // Oi / obrigado / ajuda: resposta pronta, sem IA.
  const rapida = J.respostaRapida(texto)
  if (rapida === 'saudacao') return responder(J.TEXTOS.saudacao(u.nome), 'resposta', 'saudação')
  if (rapida === 'agradecimento') return responder(J.TEXTOS.agradecimento(u.nome), 'resposta', 'agradecimento')
  if (rapida === 'ajuda') return responder(J.TEXTOS.ajuda, 'resposta', 'ajuda')

  // 7) Trava (texto) e IA.
  if (travou === undefined) {
    travou = await trava(u)
    if (travou) return responder(TEXTO_TRAVA[travou], 'bloqueado', travou)
  }
  const lancPendente = pendAnterior?.acao === 'lancar' ? pendAnterior.dados : null
  let dados: any, cartoes: any[] = []
  try {
    ({ dados, cartoes } = await interpretar(u, texto, J.pendenteParaIA(lancPendente)))
  } catch (e) {
    console.error('[whatsapp] interpretar', (e as Error).message)
    return responder(J.TEXTOS.naoEntendi, 'erro', 'falha IA')
  }

  // Pergunta e guarda o que espera o "sim" (se não conseguir guardar, não pergunta).
  const perguntar = async (pendencia: Record<string, unknown>, textoPergunta: string, nota: string) => {
    try { await guardarPendencia(u, pendencia) } catch (e) {
      console.error('[whatsapp] pendência', (e as Error).message)
      return responder(J.TEXTOS.falhaSalvar, 'erro', 'falha pendência')
    }
    return responder(textoPergunta, 'resposta', nota)
  }

  const hoje = hojeBRT()
  switch (dados.acao) {
    case 'lancar': {
      if (!dados.valor) return responder(J.TEXTOS.semValor, 'erro', 'sem valor')
      if (J.emDuvida(dados)) return perguntar({ acao: 'lancar', dados }, J.TEXTOS.taCerto(dados, hoje), 'tá certo?')
      return salvarLancamento(u, dados, responder)
    }
    case 'lancar_varios': {
      // Vários lançamentos numa mensagem (21/11/2026): SEMPRE lista e pergunta antes de salvar.
      const itens = dados.itens || []
      if (!itens.length) return responder(J.TEXTOS.semValor, 'erro', 'vários: sem valor')
      if (itens.length === 1) {
        const um = { ...itens[0], acao: 'lancar', confianca: dados.confianca }
        if (J.emDuvida(um)) return perguntar({ acao: 'lancar', dados: um }, J.TEXTOS.taCerto(um, hoje), 'tá certo?')
        return salvarLancamento(u, um, responder)
      }
      if (itens.length > J.VARIOS_MAX) return responder(J.TEXTOS_VARIOS.muitos(itens.length), 'resposta', `vários: ${itens.length} (muitos)`)
      return perguntar({ acao: 'lancar_varios', itens }, J.TEXTOS_VARIOS.pergunta(itens, hoje), `vários: ${itens.length}?`)
    }
    case 'corrigir_ultimo': {
      if (!dados.valor) return responder(J.TEXTOS.semValor, 'erro', 'sem valor')
      // Respondendo ao "tá certo?" com o valor certo ("não, era 50"): lança o pendente com ele.
      if (lancPendente) return salvarLancamento(u, { ...lancPendente, valor: dados.valor }, responder)
      const { data: ult } = await admin.rpc('wa_ultimo_lancamento', { p_grupo: u.grupo_id, p_usuario: u.usuario_id })
      const barrou = motivoUltimo(ult)
      if (barrou) return responder(barrou, 'resposta', `corrigir: ${ult?.motivo || ult?.bloqueio}`)
      if (J.emDuvida(dados)) return perguntar({ acao: 'corrigir', id: ult.id, valor: dados.valor }, J.TEXTOS.corrigirPergunta(ult, dados.valor), 'corrigir?')
      return corrigir(u, ult.id, dados.valor, responder)
    }
    case 'apagar_ultimo': {
      // "Apaga esse" logo depois do "tá certo?": o pendente nem foi salvo, então é só deixar pra lá.
      if (lancPendente) return responder(J.TEXTOS.cancelado, 'resposta', 'cancelou')
      const { data: ult } = await admin.rpc('wa_ultimo_lancamento', { p_grupo: u.grupo_id, p_usuario: u.usuario_id })
      const barrou = motivoUltimo(ult)
      if (barrou) return responder(barrou, 'resposta', `apagar: ${ult?.motivo || ult?.bloqueio}`)
      return perguntar({ acao: 'apagar', id: ult.id }, J.TEXTOS.apagarPergunta(ult, hoje), 'apagar?')
    }
    case 'pagar_fatura': {
      if (!dados.cartao_id) return responder(J.TEXTOS.faturaQualCartao(cartoes.map((c: any) => String(c.nome || '').trim()).filter(Boolean)), 'resposta', 'fatura: qual cartão')
      const f = await faturaDoMomento(u.grupo_id, dados.cartao_id)
      if (!f.cartao) return responder(J.TEXTOS.faturaQualCartao(cartoes.map((c: any) => String(c.nome || '').trim()).filter(Boolean)), 'resposta', 'fatura: cartão sumiu')
      const nome = String(f.cartao.nome || '').trim()
      if (!f.alvo) {
        if (f.doMes?.paga) return responder(J.TEXTOS.faturaJaPaga(nome, f.doMes.vencimento, hoje), 'resposta', 'fatura já paga')
        return responder(J.TEXTOS.faturaNada(nome, f.aberta), 'resposta', 'fatura: nada a pagar')
      }
      const temParcelas = (f.alvo.itens || []).some((i: any) => i.tipo === 'parcela' && !i.paga)
      return perguntar({ acao: 'pagar_fatura', cartao_id: f.cartao.id, comp: f.alvo.comp, total: f.alvo.total },
        J.TEXTOS.faturaPergunta({ cartao: nome, fatura: f.alvo, valorDito: dados.valor, temParcelas }), 'fatura?')
    }
    case 'saudacao': return responder(J.TEXTOS.saudacao(u.nome), 'resposta', 'saudação')
    case 'agradecimento': return responder(J.TEXTOS.agradecimento(u.nome), 'resposta', 'agradecimento')
    case 'ajuda': return responder(J.TEXTOS.ajuda, 'resposta', 'ajuda')
    case 'pergunta': return responder(J.TEXTOS.pergunta, 'resposta', 'pergunta')
    case 'investimento': return responder(J.TEXTOS.investimento, 'resposta', 'investimento')
    default: return responder(J.TEXTOS.naoEntendi, 'resposta', 'não entendi')
  }
}

// O último lançamento dá pra mexer por aqui? Devolve o texto de quando NÃO dá (ou null).
function motivoUltimo(ult: any): string | null {
  if (!ult?.ok) return ult?.motivo === 'sumiu' ? J.TEXTOS.sumiu : J.TEXTOS.nenhumUltimo
  if (ult.bloqueio) return J.TEXTOS.bloqueio(ult.bloqueio)
  return null
}

type Responder = (texto: string, tipo: string, nota: string) => Promise<void>

async function salvarLancamento(u: any, dados: any, responder: Responder) {
  const { data: salvo } = await admin.rpc('wa_salvar_lancamento', { p_grupo: u.grupo_id, p_usuario: u.usuario_id, p_dados: J.paraSalvar(dados) })
  if (salvo?.ok) return responder(J.msgLancado(u.nome, dados, hojeBRT()), 'lancamento', `${dados.tipo} ${dados.valor}`)
  const msg = salvo?.motivo === 'limite' ? J.TEXTOS.limite
    : salvo?.motivo === 'assinatura' ? J.TEXTOS.assinatura
    : salvo?.motivo === 'sem_valor' ? J.TEXTOS.semValor
    : J.TEXTOS.falhaSalvar
  return responder(msg, 'erro', salvo?.motivo || 'falha salvar')
}

async function corrigir(u: any, id: string, valor: number, responder: Responder) {
  const { data: r } = await admin.rpc('wa_corrigir_ultimo', { p_grupo: u.grupo_id, p_usuario: u.usuario_id, p_id: id, p_valor: valor })
  if (r?.ok) return responder(J.TEXTOS.corrigido(r, hojeBRT()), 'resposta', 'corrigido')
  return responder(textoMotivo(r?.motivo), 'erro', `corrigir: ${r?.motivo || 'falha'}`)
}

function textoMotivo(motivo: string | undefined): string {
  if (motivo === 'nenhum') return J.TEXTOS.nenhumUltimo
  if (motivo === 'sumiu') return J.TEXTOS.sumiu
  if (motivo === 'mudou') return J.TEXTOS.mudou
  if (motivo === 'valor') return J.TEXTOS.semValor
  if (motivo && ['terceiro', 'dividido', 'pago', 'serie', 'ligado'].includes(motivo)) return J.TEXTOS.bloqueio(motivo)
  return J.TEXTOS.falhaSalvar
}

// O "sim" de uma confirmação pendente.
async function executarPendencia(u: any, pend: any, responder: Responder) {
  await limparPendencia(u.usuario_id)
  if (pend.acao === 'lancar') return salvarLancamento(u, pend.dados || {}, responder)
  if (pend.acao === 'lancar_varios') {
    // Salva um por um (cada um conta 1 no limite do mês, como mandar separado). Para no 1º que o
    // banco barrar por limite ou assinatura; outro erro pula e segue.
    const itens = (pend.itens || []).slice(0, J.VARIOS_MAX)
    const salvos: any[] = []
    let motivo: string | null = null
    for (const it of itens) {
      const { data: r } = await admin.rpc('wa_salvar_lancamento', { p_grupo: u.grupo_id, p_usuario: u.usuario_id, p_dados: J.paraSalvar(it) })
      if (r?.ok) { salvos.push(J.comoVaiSalvar(it)); continue }
      motivo = r?.motivo || 'falha'
      if (motivo === 'limite' || motivo === 'assinatura') break
    }
    if (salvos.length === itens.length) return responder(J.TEXTOS_VARIOS.lancados(u.nome, salvos, hojeBRT()), 'lancamento', `vários: ${salvos.length}`)
    if (!salvos.length) {
      const msg = motivo === 'limite' ? J.TEXTOS.limite : motivo === 'assinatura' ? J.TEXTOS.assinatura : J.TEXTOS.falhaSalvar
      return responder(msg, 'erro', `vários: ${motivo}`)
    }
    return responder(J.TEXTOS_VARIOS.parcial(salvos.length, itens.length, motivo), 'lancamento', `vários: ${salvos.length}/${itens.length} (${motivo})`)
  }
  if (pend.acao === 'corrigir') return corrigir(u, pend.id, Number(pend.valor), responder)
  if (pend.acao === 'apagar') {
    const { data: r } = await admin.rpc('wa_apagar_ultimo', { p_grupo: u.grupo_id, p_usuario: u.usuario_id, p_id: pend.id })
    if (r?.ok) return responder(J.TEXTOS.apagado(r), 'resposta', 'apagado')
    return responder(textoMotivo(r?.motivo), 'erro', `apagar: ${r?.motivo || 'falha'}`)
  }
  if (pend.acao === 'pagar_fatura') {
    // Confere de novo, com os dados de agora: pode ter mudado desde a pergunta.
    const f = await faturaDoMomento(u.grupo_id, pend.cartao_id, pend.comp)
    if (!f.cartao || !f.alvo) return responder(J.TEXTOS.falhaSalvar, 'erro', 'fatura: cartão sumiu')
    const nome = String(f.cartao.nome || '').trim()
    if (f.alvo.paga) return responder(J.TEXTOS.faturaJaPaga(nome, f.alvo.vencimento, hojeBRT()), 'resposta', 'fatura já paga')
    if (!(f.alvo.total > 0)) return responder(J.TEXTOS.faturaNada(nome, f.alvo), 'resposta', 'fatura: zerou')
    if (Math.abs(f.alvo.total - Number(pend.total)) >= 0.01) {
      try { await guardarPendencia(u, { ...pend, total: f.alvo.total }) } catch (_) {
        return responder(J.TEXTOS.falhaSalvar, 'erro', 'falha pendência')
      }
      return responder(J.TEXTOS.faturaMudou(nome, f.alvo.total), 'resposta', 'fatura mudou')
    }
    const { data: r } = await admin.rpc('wa_pagar_fatura', {
      p_grupo: u.grupo_id, p_usuario: u.usuario_id, p_cartao: f.cartao.id, p_comp: f.alvo.comp, p_valor: f.alvo.total,
    })
    if (r?.ok) {
      return responder(J.TEXTOS.faturaPaga(u.nome, { cartao: nome, vencimento: f.alvo.vencimento, total: f.alvo.total, parcelas: Number(r.parcelas) || 0 }, hojeBRT()), 'resposta', 'fatura paga')
    }
    if (r?.motivo === 'ja_paga') return responder(J.TEXTOS.faturaJaPaga(nome, f.alvo.vencimento, hojeBRT()), 'resposta', 'fatura já paga')
    return responder(J.TEXTOS.falhaSalvar, 'erro', `fatura: ${r?.motivo || 'falha'}`)
  }
  return responder(J.TEXTOS.naoEntendi, 'erro', 'pendência desconhecida')
}

// ---- HTTP ----
const ctxReal: Ctx = { enviar: enviarTexto, sticker: enviarStickerJoca, transcrever: transcreverAudio }

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // 1) Verificação do webhook (a Meta faz um GET ao cadastrar a URL).
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge') || ''
    if (mode === 'subscribe' && token && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    return new Response('forbidden', { status: 403 })
  }
  if (req.method !== 'POST') return new Response('método não permitido', { status: 405 })

  // 2) Simulação (testes): nunca fala com a Meta; só com o CRON_SECRET e número de teste.
  if (req.headers.get('x-joca-simulacao') === '1') {
    if (!CRON_SECRET || !iguais(req.headers.get('x-cron-secret') || '', CRON_SECRET)) return json({ erro: 'não autorizado' }, 401)
    const body = await req.json().catch(() => ({}))
    const from = String(body.from || '')
    if (!NUMERO_TESTE.test(from)) return json({ erro: 'simulação só com número de teste (5500...)' }, 400)
    const respostas: string[] = []
    const m = {
      id: String(body.id || `sim-${crypto.randomUUID()}`), from, type: body.tipo === 'audio' ? 'audio' : 'text',
      text: { body: String(body.texto || '') }, audio: { id: 'simulado' },
    }
    try {
      await processar(m, {
        enviar: async (_to, texto) => { respostas.push(texto) },
        sticker: async () => {},
        transcrever: async () => {
          if (body.audio_falha) throw new Error('falha simulada')
          if (body.audio_longo) return { texto: '', segundos: 0, longo: true }
          return { texto: String(body.transcricao || ''), segundos: Number(body.segundos) || 5 }
        },
      })
    } catch (e) {
      return json({ ok: false, erro: (e as Error).message, respostas }, 500)
    }
    return json({ ok: true, respostas })
  }

  // 3) Valida a assinatura da Meta (corpo cru + App Secret).
  const raw = await req.text()
  if (!(await assinaturaOk(raw, req.headers.get('x-hub-signature-256')))) {
    return new Response('assinatura inválida', { status: 401 })
  }

  // Responde 200 sempre (a Meta re-tenta em erro). Processa best-effort.
  let payload: any
  try { payload = JSON.parse(raw) } catch { return new Response('ok', { status: 200 }) }

  try {
    const changes = payload?.entry?.flatMap((e: any) => e?.changes || []) || []
    for (const ch of changes) {
      for (const m of ch?.value?.messages || []) {
        try { await processar(m, ctxReal) } catch (e) { console.error('[whatsapp] mensagem', (e as Error).message) }
      }
    }
  } catch (e) {
    console.error('[whatsapp] processamento', (e as Error).message)
  }
  return new Response('ok', { status: 200 })
})
