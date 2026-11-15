// whatsapp-webhook — recebe mensagens do WhatsApp Cloud API (Meta) e lança
// gastos/entradas no HopeFin. (prompt 11.1 / item L23 do painel de demandas.)
//
// Roda como SERVICE_ROLE (a Meta chama sem JWT) -> deploy SEM verificação de JWT:
//   supabase functions deploy whatsapp-webhook --no-verify-jwt
// Como NÃO há RLS neste caminho, TODA a trava (assinatura, teto mensal, isolamento
// por grupo) vem das RPCs wa_* (SECURITY DEFINER) da migração 0055/0056.
//
// Fluxo de uma mensagem de texto:
//   1) idempotência pelo id da Meta (whatsapp_mensagens.wa_message_id único)
//   2) se o WhatsApp está pausado no /admin -> responde e para
//   3) se o texto bate com um código de conexão pendente -> vincula o número (opção A)
//   4) senão, se o número está verificado -> interpreta (Claude Haiku) e lança
//   5) senão -> orienta a conectar no app
//
// Segredos (setados por scripts/set-secrets.mjs a partir de supabase/.env.local):
//   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TOKEN, WHATSAPP_VERIFY_TOKEN,
//   WHATSAPP_APP_SECRET, ANTHROPIC_API_KEY.
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY são injetados.)
//   WHATSAPP_STICKER_JOCA_ID (opcional): media_id de um sticker do Joca para a
//   mensagem de boas-vindas; se ausente, manda só texto.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || ''
const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN') || ''
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || ''
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') || ''
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') || ''   // transcrição de áudio (Whisper)
const STICKER_JOCA = Deno.env.get('WHATSAPP_STICKER_JOCA_ID') || ''
const MODELO = 'claude-haiku-5-5'
const GRAPH = 'https://graph.facebook.com/v21.0'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

// ---- utilidades ----
function hojeSP() {
  const sp = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const iso = `${sp.getFullYear()}-${String(sp.getMonth() + 1).padStart(2, '0')}-${String(sp.getDate()).padStart(2, '0')}`
  const semana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][sp.getDay()]
  return { iso, semana }
}
function extrairJson(txt: string): any {
  const limpo = txt.replace(/```json/gi, '').replace(/```/g, '').trim()
  const ini = limpo.indexOf('{'); const fim = limpo.lastIndexOf('}')
  if (ini < 0 || fim < 0) throw new Error('sem JSON')
  return JSON.parse(limpo.slice(ini, fim + 1))
}
function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

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
  // comparação de tempo constante
  if (hex.length !== esperado.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ esperado.charCodeAt(i)
  return diff === 0
}

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

async function logMsg(row: Record<string, unknown>) {
  try { await admin.from('whatsapp_mensagens').insert(row) } catch (_) { /* silencioso */ }
}

// Baixa o áudio da Meta (Graph) e transcreve via OpenAI Whisper -> texto PT-BR.
// WhatsApp manda nota de voz como audio/ogg (opus), que o Whisper aceita.
async function transcreverAudio(mediaId: string | undefined): Promise<string> {
  if (!OPENAI_KEY) throw new Error('sem OPENAI_API_KEY')
  if (!mediaId) throw new Error('sem media id')
  // 1) metadados da mídia -> URL temporária
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${WA_TOKEN}` } })
  const mj = await meta.json()
  if (!meta.ok || !mj?.url) throw new Error(mj?.error?.message || 'mídia sem url')
  // 2) baixa o binário (exige o mesmo Bearer da Graph)
  const bin = await fetch(mj.url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } })
  if (!bin.ok) throw new Error(`download HTTP ${bin.status}`)
  const buf = new Uint8Array(await bin.arrayBuffer())
  const mime = String(mj.mime_type || 'audio/ogg').split(';')[0]
  const ext = mime.includes('mpeg') || mime.includes('mp3') ? 'mp3'
    : mime.includes('wav') ? 'wav'
    : mime.includes('mp4') || mime.includes('m4a') ? 'm4a'
    : mime.includes('webm') ? 'webm' : 'ogg'
  // 3) Whisper (pt). Form multipart.
  const form = new FormData()
  form.append('file', new Blob([buf], { type: mime }), `audio.${ext}`)
  form.append('model', 'whisper-1')
  form.append('language', 'pt')
  const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: form,
  })
  const tj = await tr.json()
  if (!tr.ok) throw new Error(tj?.error?.message || `Whisper HTTP ${tr.status}`)
  return String(tj?.text || '').trim()
}

// Interpreta o texto no contexto do grupo (categorias/contas/cartões), service_role.
async function interpretar(grupoId: string, texto: string) {
  const [{ data: cats }, { data: contas }, { data: cartoes }] = await Promise.all([
    admin.from('categorias').select('nome').eq('grupo_id', grupoId).order('nome'),
    admin.from('contas').select('id, nome').eq('grupo_id', grupoId),
    admin.from('cartoes').select('id, nome').eq('grupo_id', grupoId).eq('ativo', true),
  ])
  const nomesCategorias = (cats || []).map((c: any) => c.nome)
  const { iso: hoje, semana } = hojeSP()
  const system = [
    'Você extrai UM lançamento financeiro de um texto em português do Brasil.',
    'Responda APENAS com um objeto JSON válido, sem comentários nem texto fora do JSON.',
    'Campos:',
    '- tipo: "gasto" ou "entrada"',
    '- valor: número em reais (ponto decimal), sem símbolo',
    '- descricao: string curta e natural',
    `- categoria: UMA destas (ou "outros"): ${nomesCategorias.join(', ') || 'outros'}`,
    '- cartao_id: id de um cartão da lista, ou null',
    `- data: "YYYY-MM-DD". Hoje é ${hoje} (${semana}, America/Sao_Paulo). Entenda "ontem", "sexta", "dia 3".`,
    '- parcelas: inteiro >= 1 (1 = à vista)',
    '- confianca: número de 0 a 1',
  ].join('\n')
  const userMsg = JSON.stringify({ texto, cartoes: (cartoes || []).map((c: any) => ({ id: c.id, nome: c.nome })) })

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELO, max_tokens: 400, system, messages: [{ role: 'user', content: userMsg }] }),
  })
  const out = await r.json()
  if (!r.ok) throw new Error(out?.error?.message || `Anthropic HTTP ${r.status}`)
  const textoResp = Array.isArray(out?.content) ? (out.content.find((b: any) => b.type === 'text')?.text || '') : ''
  const dados = extrairJson(textoResp)

  const idsCartao = new Set((cartoes || []).map((c: any) => c.id))
  const valor = Number(dados.valor)
  return {
    tipo: dados.tipo === 'entrada' ? 'entrada' : 'gasto',
    valor: Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : null,
    descricao: String(dados.descricao || texto).slice(0, 120),
    categoria: nomesCategorias.includes(dados.categoria) ? dados.categoria : 'outros',
    cartao_id: idsCartao.has(dados.cartao_id) ? dados.cartao_id : null,
    data: /^\d{4}-\d{2}-\d{2}$/.test(dados.data) ? dados.data : hoje,
    parcelas: Number.isInteger(dados.parcelas) && dados.parcelas > 1 ? dados.parcelas : 1,
    confianca: Number.isFinite(Number(dados.confianca)) ? Number(dados.confianca) : 0.5,
  }
}

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

  // 2) Valida a assinatura da Meta (corpo cru + App Secret).
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
      const msgs = ch?.value?.messages || []
      for (const m of msgs) {
        const tipoMsg = m?.type
        if (tipoMsg !== 'text' && tipoMsg !== 'audio') continue
        const waId = String(m.id || '')
        const from = String(m.from || '')          // dígitos com DDI, ex. 5511999998888
        if (!waId || !from) continue

        // Idempotência (ANTES de transcrever/gastar): a tabela tem unique(wa_message_id).
        // Para áudio gravamos um marcador; o texto transcrito vai no log de saída.
        const { error: dupErr } = await admin.from('whatsapp_mensagens').insert({
          wa_message_id: waId, telefone: from, direcao: 'entrada', tipo: 'desconhecido',
          texto: tipoMsg === 'audio' ? '[áudio]' : String(m?.text?.body || '').trim(),
        })
        if (dupErr) { if ((dupErr as any).code === '23505') continue; /* outro erro: segue mesmo assim */ }

        // Pausa global do /admin.
        const { data: cfg } = await admin.from('admin_config').select('whatsapp_pausado').eq('id', 1).maybeSingle()
        if (cfg?.whatsapp_pausado) {
          await enviarTexto(from, 'O lançamento por WhatsApp está temporariamente pausado. Tente de novo mais tarde 🙏')
          await logMsg({ telefone: from, direcao: 'saida', tipo: 'bloqueado', texto: 'pausado' })
          continue
        }

        // Resolve o texto: se for áudio, baixa a mídia e transcreve (Whisper).
        let texto = ''
        if (tipoMsg === 'audio') {
          try {
            texto = await transcreverAudio(m?.audio?.id)
          } catch (e) {
            console.error('[whatsapp] transcrever', (e as Error).message)
            await enviarTexto(from, 'Não consegui ouvir seu áudio agora 😅. Pode mandar por texto, por favor?')
            await logMsg({ telefone: from, direcao: 'saida', tipo: 'erro', texto: 'falha transcrição' })
            continue
          }
        } else {
          texto = String(m?.text?.body || '').trim()
        }
        if (!texto) {
          await enviarTexto(from, tipoMsg === 'audio'
            ? 'Seu áudio chegou sem fala que eu entendesse 🤔. Tenta de novo, ex.: "mercado cento e vinte".'
            : 'Não entendi 🤔. Me manda o gasto, ex.: "mercado 120".')
          await logMsg({ telefone: from, direcao: 'saida', tipo: 'erro', texto: 'sem texto' })
          continue
        }

        // 3) Tenta vincular pelo código (opção A). A mensagem pode ser uma frase
        // ("...meu código é A1B2C3"), então extraímos os tokens de 6 hex (formato do
        // código) e tentamos cada um. Um lançamento comum não bate com código pendente.
        const candidatos = Array.from(new Set((texto.toUpperCase().match(/\b[0-9A-F]{6}\b/g) || [])))
        let conectou = false
        for (const cod of candidatos) {
          const { data: conn } = await admin.rpc('wa_conectar', { p_telefone: from, p_codigo: cod })
          if (conn?.ok) {
            await enviarTexto(from, [
              `Prontinho, ${conn.nome?.split(' ')?.[0] || ''}! ✅ Seu WhatsApp agora está conectado ao HopeFin.`,
              '',
              'Daqui pra frente, é só me mandar seus gastos e entradas em português normal que eu lanço no app na hora. Veja como:',
              '',
              '💸 *Gastos*',
              '• "mercado 120"',
              '• "uber 23,50 ontem"',
              '• "farmácia 48,90 no crédito"',
              '• "almoço 35 parcelado em 3x"',
              '',
              '💰 *Entradas*',
              '• "recebi 2000 de salário"',
              '• "entrou 150 de freela sexta"',
              '',
              'Eu entendo sozinho o valor, a data ("ontem", "sexta", "dia 3"), a categoria, o cartão e as parcelas. Manda um lançamento de cada vez. 💙',
            ].join('\n'))
            await enviarStickerJoca(from)
            await logMsg({ telefone: from, direcao: 'saida', usuario_id: conn.usuario_id, grupo_id: conn.grupo_id, tipo: 'conexao', texto: 'conectado' })
            conectou = true
            break
          }
        }
        if (conectou) continue

        // 4) Número já verificado? Então é lançamento.
        const { data: u } = await admin.rpc('wa_usuario', { p_telefone: from })
        if (!u?.ok) {
          await enviarTexto(from, 'Oi! Para lançar seus gastos por aqui, abra o HopeFin, vá em Configurações → "Conectar meu WhatsApp" e me mande o código que aparecer. 😊')
          await logMsg({ telefone: from, direcao: 'saida', tipo: 'desconhecido', texto: 'orientou a conectar' })
          continue
        }

        // Trava de assinatura + teto mensal (antes de gastar IA).
        const { data: pode } = await admin.rpc('wa_pode_grupo', { p_grupo: u.grupo_id })
        if (!pode?.pode) {
          const msg = pode?.motivo === 'limite'
            ? 'Você atingiu o limite de mensagens do seu plano neste mês. Ele renova no início do próximo mês. 🗓️'
            : 'Sua assinatura do HopeFin está inativa. Reative no app para voltar a lançar por aqui. 💙'
          await enviarTexto(from, msg)
          await logMsg({ telefone: from, direcao: 'saida', usuario_id: u.usuario_id, grupo_id: u.grupo_id, tipo: 'bloqueado', texto: pode?.motivo || 'bloqueado' })
          continue
        }

        // Interpreta e salva.
        let dados: any
        try {
          dados = await interpretar(u.grupo_id, texto)
        } catch (e) {
          console.error('[whatsapp] interpretar', (e as Error).message)
          await enviarTexto(from, 'Não consegui entender agora 😅. Tente algo como "uber 23,50" ou lance pelo app.')
          await logMsg({ telefone: from, direcao: 'saida', usuario_id: u.usuario_id, grupo_id: u.grupo_id, tipo: 'erro', texto: 'falha IA' })
          continue
        }
        if (!dados.valor) {
          await enviarTexto(from, 'Não achei o valor 🤔. Tente incluir quanto foi, ex.: "farmácia 48,90".')
          await logMsg({ telefone: from, direcao: 'saida', usuario_id: u.usuario_id, grupo_id: u.grupo_id, tipo: 'erro', texto: 'sem valor' })
          continue
        }

        const { data: salvo } = await admin.rpc('wa_salvar_lancamento', { p_grupo: u.grupo_id, p_usuario: u.usuario_id, p_dados: dados })
        if (salvo?.ok) {
          const verbo = dados.tipo === 'entrada' ? 'Entrada' : 'Gasto'
          const extra = dados.parcelas > 1 ? ` em ${dados.parcelas}x` : ''
          await enviarTexto(from, `✅ ${verbo} de ${brl(dados.valor)}${extra} — "${dados.descricao}" (${dados.categoria}) lançado!`)
          await logMsg({ telefone: from, direcao: 'saida', usuario_id: u.usuario_id, grupo_id: u.grupo_id, tipo: 'lancamento', texto: `${dados.tipo} ${dados.valor}` })
        } else {
          const motivo = salvo?.motivo === 'limite' ? 'Você atingiu o limite do mês.' : 'Não consegui salvar agora.'
          await enviarTexto(from, `${motivo} Tente pelo app, por favor. 🙏`)
          await logMsg({ telefone: from, direcao: 'saida', usuario_id: u.usuario_id, grupo_id: u.grupo_id, tipo: 'erro', texto: salvo?.motivo || 'falha salvar' })
        }
      }
    }
  } catch (e) {
    console.error('[whatsapp] processamento', (e as Error).message)
  }
  return new Response('ok', { status: 200 })
})
