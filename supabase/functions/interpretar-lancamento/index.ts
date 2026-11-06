// interpretar-lancamento — recebe um texto (falado ou digitado) e devolve um
// lançamento estruturado, usando o Claude Haiku. Roda com o JWT do usuário
// (RLS ativa) — NUNCA com a service role. Reaproveitável pelo webhook do
// WhatsApp (prompt 11.1): basta chamar com { texto, origem: 'whatsapp' }.
//
// Corpo (JSON): { texto: string, origem?: 'voz'|'texto'|'whatsapp' }
// Resposta:     { ok, dados, log_id, limite } | { erro, limite? }
// Segredos: ANTHROPIC_API_KEY. (SUPABASE_URL / SUPABASE_ANON_KEY são injetados.)

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const MODELO = 'claude-haiku-5-5'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Data de hoje no fuso de São Paulo (para entender "ontem", "sexta" etc.).
function hojeSP() {
  const agora = new Date()
  const sp = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const iso = `${sp.getFullYear()}-${String(sp.getMonth() + 1).padStart(2, '0')}-${String(sp.getDate()).padStart(2, '0')}`
  const semana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][sp.getDay()]
  return { iso, semana }
}

// Extrai o primeiro objeto JSON de um texto (a IA às vezes embrulha em ```json).
function extrairJson(txt: string): any {
  const limpo = txt.replace(/```json/gi, '').replace(/```/g, '').trim()
  const ini = limpo.indexOf('{'); const fim = limpo.lastIndexOf('}')
  if (ini < 0 || fim < 0) throw new Error('sem JSON na resposta')
  return JSON.parse(limpo.slice(ini, fim + 1))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!ANTHROPIC_KEY) return json({ erro: 'ANTHROPIC_API_KEY não configurada' }, 500)

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const sb = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
  const { data: userData } = await sb.auth.getUser()
  if (!userData?.user) return json({ erro: 'não autenticado' }, 401)
  const uid = userData.user.id

  const body = await req.json().catch(() => ({}))
  const texto = String(body.texto || '').trim()
  const origem = ['voz', 'texto', 'whatsapp'].includes(body.origem) ? body.origem : 'texto'
  if (!texto) return json({ erro: 'texto vazio' }, 400)
  if (texto.length > 500) return json({ erro: 'texto muito longo' }, 400)

  // Limite de uso (config do prompt 2.1). Não consome se já estourou.
  const { data: limite } = await sb.rpc('limite_ia_status')
  if (limite && limite.pode === false) {
    return json({ erro: 'limite_atingido', limite })
  }

  // Grupo do usuário + contexto (categorias/contas/cartões) via RLS.
  const { data: perfil } = await sb.from('usuarios').select('grupo_id').eq('id', uid).maybeSingle()
  if (!perfil?.grupo_id) return json({ erro: 'usuário sem grupo' }, 400)
  const [{ data: cats }, { data: contas }, { data: cartoes }] = await Promise.all([
    sb.from('categorias').select('nome').order('nome'),
    sb.from('contas').select('id, nome'),
    sb.from('cartoes').select('id, nome').eq('ativo', true),
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
    '- conta_id: id de uma conta da lista, ou null',
    `- data: "YYYY-MM-DD". Hoje é ${hoje} (${semana}, America/Sao_Paulo). Entenda "ontem", "sexta", "dia 3".`,
    '- parcelas: inteiro >= 1 (1 = à vista)',
    '- confianca: número de 0 a 1 (quão seguro você está do valor e do tipo)',
    'Se não houver valor claro, use confianca baixa.',
  ].join('\n')

  const userMsg = JSON.stringify({
    texto,
    cartoes: (cartoes || []).map((c: any) => ({ id: c.id, nome: c.nome })),
    contas: (contas || []).map((c: any) => ({ id: c.id, nome: c.nome })),
  })

  let dados: any
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })
    const out = await r.json()
    if (!r.ok) throw new Error(out?.error?.message || `Anthropic HTTP ${r.status}`)
    // O Haiku pode devolver um bloco "thinking" antes do texto — pegue o de texto.
    const textoResp = Array.isArray(out?.content)
      ? (out.content.find((b: any) => b.type === 'text')?.text || '')
      : ''
    dados = extrairJson(textoResp)
  } catch (err) {
    console.error('[interpretar-lancamento]', (err as Error)?.message)
    return json({ erro: 'não consegui interpretar agora. Tente de novo ou lance manualmente.' }, 502)
  }

  // Validação/saneamento (nunca confiar cegamente na IA).
  const idsCartao = new Set((cartoes || []).map((c: any) => c.id))
  const idsConta = new Set((contas || []).map((c: any) => c.id))
  const valor = Number(dados.valor)
  const limpo = {
    tipo: dados.tipo === 'entrada' ? 'entrada' : 'gasto',
    valor: Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : null,
    descricao: String(dados.descricao || texto).slice(0, 120),
    categoria: nomesCategorias.includes(dados.categoria) ? dados.categoria : 'outros',
    cartao_id: idsCartao.has(dados.cartao_id) ? dados.cartao_id : null,
    conta_id: idsConta.has(dados.conta_id) ? dados.conta_id : null,
    data: /^\d{4}-\d{2}-\d{2}$/.test(dados.data) ? dados.data : hoje,
    parcelas: Number.isInteger(dados.parcelas) && dados.parcelas > 1 ? dados.parcelas : 1,
    confianca: Number.isFinite(Number(dados.confianca)) ? Number(dados.confianca) : 0.5,
  }

  // Registra consumo (prompt 2.1) e grava o log para a taxa de acerto do /admin.
  await sb.rpc('registrar_consumo_ia', {
    p_origem: origem === 'whatsapp' ? 'whatsapp' : 'app', p_qtd: 1, p_custo: 0,
  })
  const { data: logRow } = await sb.from('interpretacoes_log')
    .insert({ grupo_id: perfil.grupo_id, usuario_id: uid, origem, texto, json_ia: limpo })
    .select('id').maybeSingle()

  return json({ ok: true, dados: limpo, log_id: logRow?.id || null, limite })
})
