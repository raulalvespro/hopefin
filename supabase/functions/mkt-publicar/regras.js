// Regras puras da publicação automática (mkt-publicar). Sem rede e sem banco, para testar no vitest
// (tests/mkt-publicar.test.js) e usar igual na Edge Function (Deno).

export const FUSO = 'America/Sao_Paulo'
export const MAX_TENTATIVAS = 3
export const TRAVA_MINUTOS = 15 // peça "pegada" há menos que isso fica com quem pegou

// Relógio de parede de um instante num fuso: { data: 'AAAA-MM-DD', hora: 'HH:MM:SS' }.
export function relogioNoFuso(instante, fuso = FUSO) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instante).map((x) => [x.type, x.value]))
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}:${p.second}` }
}

// Instante (Date) em que "data às horario" acontece no fuso. Funciona com ou sem horário de verão.
export function instanteNoFuso(data, horario, fuso = FUSO) {
  const [a, m, d] = String(data).split('-').map(Number)
  const [h = 0, mi = 0, s = 0] = String(horario || '00:00').split(':').map((x) => Number(x) || 0)
  const comoUtc = Date.UTC(a, m - 1, d, h, mi, s)
  let palpite = comoUtc
  for (let i = 0; i < 2; i++) { // 2 passos bastam pra acertar o deslocamento do fuso
    const r = relogioNoFuso(new Date(palpite), fuso)
    const [ra, rm, rd] = r.data.split('-').map(Number)
    const [rh, rmi, rs] = r.hora.split(':').map(Number)
    const parede = Date.UTC(ra, rm - 1, rd, rh, rmi, rs)
    palpite += comoUtc - parede
  }
  return new Date(palpite)
}

// Peça pronta pra sair: agendada, com data E horário, e o horário (Brasília) já chegou.
export function estaVencida(peca, agora = new Date()) {
  if (!peca || peca.status !== 'agendado' || !peca.data || !peca.horario) return false
  return instanteNoFuso(peca.data, peca.horario).getTime() <= agora.getTime()
}

// Ninguém pegou a peça, ou pegou há mais de TRAVA_MINUTOS (a execução anterior morreu no meio).
export function travaLivre(peca, agora = new Date(), minutos = TRAVA_MINUTOS) {
  if (!peca?.pub_iniciada_em) return true
  return new Date(peca.pub_iniciada_em).getTime() <= agora.getTime() - minutos * 60_000
}

// Escolhe até `limite` peças pra publicar agora, das mais antigas pras mais novas.
export function escolherPecas(pecas, agora = new Date(), limite = 3) {
  return (pecas || [])
    .filter((p) => estaVencida(p, agora) && travaLivre(p, agora) && (p.pub_tentativas || 0) < MAX_TENTATIVAS)
    .sort((x, y) => instanteNoFuso(x.data, x.horario) - instanteNoFuso(y.data, y.horario))
    .slice(0, limite)
}

// Separa a mídia da peça (bucket mkt-midia) no que cada formato usa.
export function separarMidia(midia) {
  const lista = Array.isArray(midia) ? midia.filter((m) => m && m.path) : []
  return {
    video: lista.find((m) => m.tipo === 'video')?.path || null,
    capa: lista.find((m) => m.tipo === 'capa')?.path || null,
    imagens: lista.filter((m) => m.tipo === 'imagem').map((m) => m.path),
  }
}

// O que publicar, por formato. Devolve { tipo, video?, capa?, imagens? } ou { erro }.
//   tipo: 'reel' | 'carrossel' | 'imagem' | 'story_video' | 'story_imagem'
export function planoDaPeca(peca) {
  const { video, capa, imagens } = separarMidia(peca?.midia)
  switch (peca?.formato) {
    case 'reel':
      if (!video) return { erro: 'reel sem vídeo na mídia' }
      return { tipo: 'reel', video, capa }
    case 'carrossel':
    case 'tirinha':
      if (!imagens.length) return { erro: `${peca.formato} sem imagens na mídia` }
      if (imagens.length === 1) return { tipo: 'imagem', imagens }
      if (imagens.length > 10) return { erro: `${peca.formato} com ${imagens.length} imagens (máximo 10)` }
      return { tipo: 'carrossel', imagens }
    case 'estatico':
      if (!imagens.length) return { erro: 'estático sem imagem na mídia' }
      return { tipo: 'imagem', imagens: imagens.slice(0, 1) }
    case 'story':
      if (video) return { tipo: 'story_video', video }
      if (imagens.length) return { tipo: 'story_imagem', imagens: imagens.slice(0, 1) }
      return { erro: 'story sem mídia' }
    default:
      return { erro: `formato desconhecido: ${peca?.formato}` }
  }
}

// Campos a gravar quando a tentativa falha.
export function camposFalha(peca, mensagem) {
  const tentativas = (peca?.pub_tentativas || 0) + 1
  return {
    pub_tentativas: tentativas,
    pub_erro: String(mensagem || 'erro desconhecido').slice(0, 300),
    status: tentativas >= MAX_TENTATIVAS ? 'atrasado' : 'agendado',
  }
}

// Mensagem curta a partir da resposta de erro da Graph API, sem vazar o token.
export function mensagemErroMeta(corpo, token = '') {
  const e = corpo?.error || corpo || {}
  let msg = e.error_user_msg || e.message || (typeof corpo === 'string' ? corpo : JSON.stringify(corpo))
  if (e.code) msg = `[${e.code}${e.error_subcode ? '/' + e.error_subcode : ''}] ${msg}`
  msg = String(msg)
  if (token) msg = msg.split(token).join('***')
  return msg.replace(/access_token=[^&\s"]+/g, 'access_token=***').slice(0, 300)
}
