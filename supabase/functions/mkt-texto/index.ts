// mkt-texto — ajuste de TEXTO de uma peça da Agência na hora, pelo painel (26/11/2026).
// O Raul escreve o recado ("troca o gancho por uma pergunta") e a IA reescreve a legenda ou o roteiro da
// narração seguindo as regras da marca (marca.ts, cópia de hopefin-social/docs/agencia/REGRAS-DA-MARCA.md).
// NÃO salva nada: devolve a sugestão; o painel mostra e o Raul decide se usa (aí o painel grava e comenta).
// Imagem e vídeo continuam com a equipe no Claude Code (rodadas das 8h e 14h).
//
// Corpo (JSON): { peca_id: uuid, campo: 'legenda' | 'roteiro_narracao', recado: string }
// Resposta:     { ok, texto, nota } | { erro }
// Acesso: usuário logado com o código do celular (aal2) que lê a peça pela RLS (sou_admin()).
// Segredos: ANTHROPIC_API_KEY. (SUPABASE_URL / SUPABASE_ANON_KEY são injetados.)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { nivelDaSessao } from '../_shared/sessao.ts'
import { REGRAS_MARCA } from './marca.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const MODELO = 'claude-opus-5-5'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const CAMPOS: Record<string, string> = {
  legenda: 'a LEGENDA (caption) do post',
  roteiro_narracao: 'o ROTEIRO DA NARRAÇÃO do reel (o texto que o Raul vai ler e gravar)',
}

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
  if (nivelDaSessao(jwt) !== 'aal2') return json({ erro: 'precisa do código do celular' }, 403)

  const body = await req.json().catch(() => ({}))
  const pecaId = String(body.peca_id || '')
  const campo = String(body.campo || '')
  const recado = String(body.recado || '').trim().slice(0, 1500)
  if (!pecaId || !CAMPOS[campo]) return json({ erro: 'pedido inválido' }, 400)
  if (!recado) return json({ erro: 'escreva o que ajustar' }, 400)

  // RLS: só admin com aal2 enxerga mkt_pecas — se não vier a linha, não tem acesso.
  const { data: p } = await sb.from('mkt_pecas')
    .select('id, data, horario, formato, titulo, ideia, comemorativa, legenda, roteiro_narracao, status')
    .eq('id', pecaId).maybeSingle()
  if (!p) return json({ erro: 'peça não encontrada ou sem permissão' }, 403)
  const atual = String((p as any)[campo] || '').trim()

  const system = [
    'Você é o redator da agência de conteúdo do HopeFin (@hopefinapp) e escreve em português do Brasil.',
    'Siga À RISCA as regras da marca abaixo. Se o recado do Raul pedir algo que quebra uma regra "Nunca", ',
    'faça o ajuste mais próximo que respeite a regra e explique isso em "nota".',
    '',
    '<regras_da_marca>', REGRAS_MARCA, '</regras_da_marca>',
  ].join('\n')

  const formatoTexto = campo === 'roteiro_narracao'
    ? 'Roteiro de narração: linhas numeradas ("1. …"), 1 linha = 1 cena, frases curtas de conversa, 20–40 s no total (~2,5 palavras por segundo). Só o texto falado, sem indicação de cena.'
    : 'Legenda: gancho na 1ª linha → cena real → virada → CTA; no máximo 3 hashtags, sem acento, no fim.'

  const userMsg = [
    `Reescreva ${CAMPOS[campo]} desta peça conforme o recado do Raul. Mude só o que o recado pede; mantenha o resto.`,
    '',
    `Peça: ${p.formato} de ${p.data}${p.horario ? ' ' + String(p.horario).slice(0, 5) : ''} — "${p.titulo}"`,
    p.comemorativa ? `Data comemorativa: ${p.comemorativa}` : '',
    p.ideia ? `Ideia: ${p.ideia}` : '',
    campo === 'legenda' && p.roteiro_narracao ? `Roteiro da narração (contexto):\n${p.roteiro_narracao}` : '',
    campo === 'roteiro_narracao' && p.legenda ? `Legenda (contexto):\n${p.legenda}` : '',
    '',
    `Texto atual:\n${atual || '(vazio — escreva do zero)'}`,
    '',
    `Recado do Raul: ${recado}`,
    '',
    formatoTexto,
    'Responda SÓ com JSON: {"texto": "<o texto novo completo>", "nota": "<1 frase curta sobre o que mudou, ou vazio>"}',
  ].filter((l) => l !== '').join('\n')

  let tokensIn = 0, tokensOut = 0
  const t0 = Date.now()
  const registrar = async (sucesso: boolean, erro?: string) => {
    try {
      await sb.rpc('registrar_ia_chamada', {
        p_operacao: `mkt_texto_${campo}`, p_modelo: MODELO,
        p_tokens_entrada: tokensIn, p_tokens_saida: tokensOut,
        p_ms: Date.now() - t0, p_sucesso: sucesso, p_erro: erro ? erro.slice(0, 300) : null,
      })
    } catch (_) { /* silencioso */ }
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 4000,
        output_config: { effort: 'medium' },
        fallbacks: 'default',
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })
    const out = await r.json()
    if (!r.ok) throw new Error(out?.error?.message || `Anthropic HTTP ${r.status}`)
    tokensIn = Number(out?.usage?.input_tokens) || 0
    tokensOut = Number(out?.usage?.output_tokens) || 0
    if (out?.stop_reason === 'refusal') throw new Error('a IA recusou o pedido')
    const textoResp = Array.isArray(out?.content) ? (out.content.find((b: any) => b.type === 'text')?.text || '') : ''
    const dados = extrairJson(textoResp)
    const texto = String(dados?.texto || '').trim()
    if (!texto) throw new Error('resposta vazia')
    await registrar(true)
    return json({ ok: true, texto: texto.slice(0, 5000), nota: String(dados?.nota || '').trim().slice(0, 300) })
  } catch (err) {
    const msg = String((err as Error)?.message || err)
    console.error('[mkt-texto]', msg)
    await registrar(false, msg)
    return json({ erro: 'não consegui ajustar agora. Tente de novo ou peça pra equipe.' }, 502)
  }
})
