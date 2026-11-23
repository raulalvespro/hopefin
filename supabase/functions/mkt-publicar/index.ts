// mkt-publicar — Agência de marketing, FASE 3 (docs/PLANO_AGENCIA_MARKETING.md, migração 0124).
// Posta no Instagram (e, se ligado, na Página do Facebook) as peças 'agendado' cujo data+horario (Brasília) já chegou.
// Chamada pelo cron hopefin-mkt-publicar (a cada 5 min, só quando a chave está ligada e há peça vencida — ver
// scripts/setup-cron.mjs). Exige x-cron-secret (deploy --no-verify-jwt).
//
// Token: META_PAGE_TOKEN = token de USUÁRIO DO SISTEMA do Business Manager (não expira); o da Página sai dele na hora.
// Fica INOFENSIVA enquanto: mkt_config.publicar_ativo = false (nasce assim), ou falta o secret META_PAGE_TOKEN,
// ou falta mkt_config.ig_user_id. Passo a passo pro Raul ligar: docs/META_PUBLICACAO.md.
//
// Corpo opcional: { simular: true } → só diz o que publicaria agora (não chama a Meta, não grava nada).
//
// Trava contra postar 2x: cada peça é "pega" gravando pub_iniciada_em (só se estiver livre há 15 min); o id da mídia
// fica em pub_ig_id / pub_fb_id assim que sai, e rede que já tem id não é postada de novo. Reel que a Meta ainda
// está processando fica em pub_ig_container e a próxima execução continua de onde parou.
// Nunca loga nem devolve o token nem as URLs assinadas.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  relogioNoFuso, escolherPecas, planoDaPeca, camposFalha, mensagemErroMeta, TRAVA_MINUTOS,
} from './regras.js'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
// Token de USUÁRIO DO SISTEMA (Business Manager), com a Página e o Instagram como ativos. Usado direto no Instagram;
// pro Facebook, o token da Página é pedido em tempo de execução (GET /{page-id}?fields=access_token). Nunca logado.
const TOKEN = Deno.env.get('META_PAGE_TOKEN') || ''
const VER = Deno.env.get('META_GRAPH_VERSION') || 'v23.0'
const BUCKET = 'mkt-midia'
const VALIDADE_URL = 2 * 60 * 60 // 2 h pra Meta baixar o arquivo
const ORCAMENTO_MS = 110_000     // a função tem ~150 s; o resto fica pra gravar e responder
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

const COLS = 'id, titulo, data, horario, formato, status, legenda, midia, link_post, pub_tentativas, pub_erro, pub_ig_id, pub_ig_container, pub_fb_id, pub_iniciada_em'

type Peca = {
  id: string; titulo: string; data: string; horario: string | null; formato: string; status: string
  legenda: string | null; midia: unknown; link_post: string | null; pub_tentativas: number; pub_erro: string | null
  pub_ig_id: string | null; pub_ig_container: string | null; pub_fb_id: string | null; pub_iniciada_em: string | null
}
type Plano = { tipo: string; video?: string; capa?: string | null; imagens?: string[] }

class ErroMeta extends Error {}
const ocultar = (msg: string) => (TOKEN ? msg.split(TOKEN).join('***') : msg)

// ---------- Graph API (token no header, nunca na URL) ----------
async function graph(metodo: 'GET' | 'POST', caminho: string, params: Record<string, string> = {}, token = TOKEN) {
  const url = new URL(`https://graph.facebook.com/${VER}/${caminho}`)
  const init: RequestInit = { method: metodo, headers: { Authorization: `Bearer ${token}` } }
  if (metodo === 'GET') for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  else init.body = new URLSearchParams(params)
  const r = await fetch(url, init)
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok || corpo?.error) throw new ErroMeta(ocultar(mensagemErroMeta(corpo, token)))
  return corpo
}

// Token da Página, pedido com o token do usuário do sistema (cache por execução). Nunca logado.
let tokenPagina: string | null = null
async function pegarTokenPagina(page: string) {
  if (tokenPagina) return tokenPagina
  const r = await graph('GET', page, { fields: 'access_token' })
  if (!r?.access_token) throw new ErroMeta('sem token da Página (o usuário do sistema tem a Página como ativo?)')
  tokenPagina = r.access_token as string
  return tokenPagina
}

async function assinar(path: string) {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, VALIDADE_URL)
  if (error || !data?.signedUrl) throw new Error(`arquivo não encontrado no Storage: ${path}`)
  return data.signedUrl
}

async function salvar(id: string, campos: Record<string, unknown>) {
  const { error } = await admin.from('mkt_pecas').update(campos).eq('id', id)
  if (error) console.error('mkt-publicar: falha ao gravar peça', id, error.message)
}

// ---------- Instagram ----------
// Espera o container ficar FINISHED. 'pendente' = ainda processando quando o tempo acabou.
async function esperarContainer(container: string, ate: number): Promise<'FINISHED' | 'PUBLISHED' | 'pendente'> {
  while (true) {
    const { status_code, status } = await graph('GET', container, { fields: 'status_code,status' })
    if (status_code === 'FINISHED' || status_code === 'PUBLISHED') return status_code
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new ErroMeta(`container ${status_code}: ${status || ''}`.trim())
    if (Date.now() + 5000 > ate) return 'pendente'
    await dormir(5000)
  }
}

async function criarContainerIg(ig: string, plano: Plano, legenda: string) {
  if (plano.tipo === 'reel') {
    const p: Record<string, string> = { media_type: 'REELS', video_url: await assinar(plano.video!), caption: legenda, share_to_feed: 'true' }
    if (plano.capa) p.cover_url = await assinar(plano.capa)
    return (await graph('POST', `${ig}/media`, p)).id as string
  }
  if (plano.tipo === 'imagem') {
    return (await graph('POST', `${ig}/media`, { image_url: await assinar(plano.imagens![0]), caption: legenda })).id as string
  }
  if (plano.tipo === 'story_imagem') {
    return (await graph('POST', `${ig}/media`, { media_type: 'STORIES', image_url: await assinar(plano.imagens![0]) })).id as string
  }
  if (plano.tipo === 'story_video') {
    return (await graph('POST', `${ig}/media`, { media_type: 'STORIES', video_url: await assinar(plano.video!) })).id as string
  }
  if (plano.tipo === 'carrossel') {
    const filhos: string[] = []
    for (const path of plano.imagens!) {
      filhos.push((await graph('POST', `${ig}/media`, { image_url: await assinar(path), is_carousel_item: 'true' })).id)
    }
    return (await graph('POST', `${ig}/media`, { media_type: 'CAROUSEL', children: filhos.join(','), caption: legenda })).id as string
  }
  throw new Error(`tipo sem publicação no Instagram: ${plano.tipo}`)
}

async function permalinkIg(midiaId: string) {
  try { return (await graph('GET', midiaId, { fields: 'permalink' })).permalink || null } catch { return null }
}

// Devolve { id, link } quando publicou, ou { pendente: true } quando o vídeo ainda está processando.
async function publicarIg(ig: string, p: Peca, plano: Plano, ate: number) {
  let container = p.pub_ig_container
  if (!container) {
    container = await criarContainerIg(ig, plano, p.legenda || '')
    await salvar(p.id, { pub_ig_container: container })
  }
  let estado: string
  try {
    estado = await esperarContainer(container, ate)
  } catch (e) {
    await salvar(p.id, { pub_ig_container: null }) // container morto: a próxima tentativa cria outro
    throw e
  }
  if (estado === 'pendente') return { pendente: true as const }

  let midiaId: string
  if (estado === 'PUBLISHED') {
    // Já tinha sido publicado (a execução anterior caiu antes de gravar o id): pega a mídia mais recente.
    const r = await graph('GET', `${ig}/media`, { fields: 'id,permalink', limit: '1' })
    midiaId = r?.data?.[0]?.id
    if (!midiaId) throw new ErroMeta('container publicado, mas a mídia não foi encontrada')
  } else {
    midiaId = (await graph('POST', `${ig}/media_publish`, { creation_id: container })).id
  }
  await salvar(p.id, { pub_ig_id: midiaId, pub_ig_container: null })
  return { id: midiaId, link: await permalinkIg(midiaId) }
}

// ---------- Página do Facebook ----------
async function publicarFb(page: string, plano: Plano, legenda: string) {
  if (plano.tipo !== 'reel' && plano.tipo !== 'imagem' && plano.tipo !== 'carrossel') return null // story: só no Instagram
  const pt = await pegarTokenPagina(page)
  if (plano.tipo === 'reel') {
    const inicio = await graph('POST', `${page}/video_reels`, { upload_phase: 'start' }, pt)
    const videoId = inicio.video_id as string
    const up = await fetch(`https://rupload.facebook.com/video-upload/${VER}/${videoId}`, {
      method: 'POST', headers: { Authorization: `OAuth ${pt}`, file_url: await assinar(plano.video!) },
    })
    const upCorpo = await up.json().catch(() => ({}))
    if (!up.ok || upCorpo?.error || upCorpo?.success === false) throw new ErroMeta(ocultar(mensagemErroMeta(upCorpo, pt)))
    await graph('POST', `${page}/video_reels`, { upload_phase: 'finish', video_id: videoId, video_state: 'PUBLISHED', description: legenda }, pt)
    return { id: videoId, link: `https://www.facebook.com/reel/${videoId}` }
  }
  if (plano.tipo === 'imagem' || plano.tipo === 'carrossel') {
    const fotos: string[] = []
    for (const path of plano.imagens!) {
      fotos.push((await graph('POST', `${page}/photos`, { url: await assinar(path), published: 'false' }, pt)).id)
    }
    const p: Record<string, string> = { message: legenda }
    fotos.forEach((id, i) => { p[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }) })
    const post = await graph('POST', `${page}/feed`, p, pt)
    let link: string | null = null
    try { link = (await graph('GET', post.id, { fields: 'permalink_url' }, pt)).permalink_url || null } catch { /* sem link */ }
    return { id: post.id as string, link }
  }
  return null
}

// ---------- uma peça ----------
async function publicarPeca(p: Peca, cfg: Record<string, any>, ate: number) {
  const plano = planoDaPeca(p) as Plano & { erro?: string }
  if (plano.erro) {
    await salvar(p.id, camposFalha(p, plano.erro))
    return { id: p.id, erro: plano.erro }
  }
  let ig: { id?: string; link?: string | null } | null = null
  let avisoFb: string | null = null
  try {
    if (cfg.publicar_instagram && !p.pub_ig_id) {
      const r = await publicarIg(cfg.ig_user_id, p, plano, ate)
      if ('pendente' in r) {
        await salvar(p.id, { pub_iniciada_em: null }) // solta pra próxima execução continuar
        return { id: p.id, pendente: 'vídeo ainda processando na Meta' }
      }
      ig = r
    }
    let fb: { id: string; link: string | null } | null = null
    if (cfg.publicar_facebook && cfg.fb_page_id && !p.pub_fb_id) {
      try {
        fb = await publicarFb(cfg.fb_page_id, plano, p.legenda || '')
        if (fb) await salvar(p.id, { pub_fb_id: fb.id })
      } catch (e) {
        // Instagram já saiu (ou está desligado): sem IG, a falha do FB conta como falha da peça.
        if (!cfg.publicar_instagram) throw e
        avisoFb = `Facebook: ${(e as Error).message}`.slice(0, 300)
      }
    }
    if (!ig?.id && !fb?.id && !p.pub_ig_id && !p.pub_fb_id) throw new Error('nenhuma rede publicou esta peça (story só sai no Instagram)')
    await salvar(p.id, {
      status: 'postado', postado_em: new Date().toISOString(), pub_erro: avisoFb, pub_iniciada_em: null,
      link_post: ig?.link || fb?.link || p.link_post || null,
    })
    return { id: p.id, postado: true, instagram: !!ig?.id, facebook: !!fb?.id, aviso: avisoFb || undefined }
  } catch (e) {
    const msg = (e as Error).message || 'erro'
    const campos = camposFalha(p, msg) // trava continua: nova tentativa só depois de TRAVA_MINUTOS
    await salvar(p.id, campos)
    console.error('mkt-publicar: falhou', p.id, campos.pub_tentativas, msg)
    return { id: p.id, erro: msg, tentativas: campos.pub_tentativas, status: campos.status }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405)
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ erro: 'não autorizado' }, 401)
  const corpo = await req.json().catch(() => ({}))
  const inicio = Date.now()
  const agora = new Date()

  const { data: cfg, error: eCfg } = await admin.from('mkt_config').select('*').eq('id', 1).maybeSingle()
  if (eCfg || !cfg) return json({ erro: eCfg?.message || 'mkt_config sem linha' }, 500)

  let motivo: string | null = null
  if (!cfg.publicar_ativo) motivo = 'desligado'
  else if (!TOKEN) motivo = 'sem_token'
  else if (!cfg.publicar_instagram && !cfg.publicar_facebook) motivo = 'nenhuma_rede'
  else if (cfg.publicar_instagram && !cfg.ig_user_id) motivo = 'sem_ig_user_id'
  else if (!cfg.publicar_instagram && !cfg.fb_page_id) motivo = 'sem_fb_page_id'

  const hoje = relogioNoFuso(agora).data
  const { data: lista, error } = await admin.from('mkt_pecas').select(COLS)
    .eq('status', 'agendado').lte('data', hoje).order('data').order('horario').limit(50)
  if (error) return json({ erro: error.message }, 500)
  const escolhidas = escolherPecas(lista || [], agora, 3) as Peca[]

  if (corpo?.simular) {
    return json({ ok: true, simulacao: true, bloqueio: motivo, agora_brasilia: relogioNoFuso(agora),
      publicaria: escolhidas.map((p) => ({ id: p.id, titulo: p.titulo, data: p.data, horario: p.horario, formato: p.formato, plano: planoDaPeca(p) })) })
  }
  if (motivo) {
    console.log(`mkt-publicar: nada a fazer (${motivo})`)
    return json({ ok: true, pulou: motivo })
  }
  if (!escolhidas.length) return json({ ok: true, publicadas: [] })

  const saida = []
  const corte = new Date(agora.getTime() - TRAVA_MINUTOS * 60_000).toISOString()
  for (const p of escolhidas) {
    const sobra = inicio + ORCAMENTO_MS - Date.now()
    if (sobra < 20_000) break // pouco tempo: fica pra próxima execução
    // pega a peça (trava): só se continua agendada e ninguém pegou nos últimos TRAVA_MINUTOS
    const { data: pegou } = await admin.from('mkt_pecas').update({ pub_iniciada_em: new Date().toISOString() })
      .eq('id', p.id).eq('status', 'agendado')
      .or(`pub_iniciada_em.is.null,pub_iniciada_em.lte."${corte}"`).select('id')
    if (!pegou?.length) continue
    saida.push(await publicarPeca(p, cfg, inicio + ORCAMENTO_MS))
  }
  console.log('mkt-publicar:', JSON.stringify(saida.map((s: any) => ({ id: s.id, ok: !!s.postado, pendente: !!s.pendente, erro: s.erro ? true : undefined }))))
  return json({ ok: true, publicadas: saida })
})
