// Fontes da marca (Syne e DM Sans) embutidas nas imagens geradas com html-to-image
// (Fechamento e cobrança do A Receber). A folha do Google Fonts é de outra origem: o
// html-to-image não consegue lê-la sozinho (SecurityError no console) e a imagem saía com
// fonte genérica. Aqui baixamos o CSS + os arquivos (só o alfabeto latino, que cobre o
// português) e devolvemos tudo como data URL. Uma vez por sessão.

const FONTES_URL = 'https://fonts.googleapis.com/css2?family=Syne:wght@600;700&family=DM+Sans:wght@400;500&display=swap'
let cache = null

const comoDataUrl = (blob) => new Promise((ok, erro) => {
  const fr = new FileReader()
  fr.onload = () => ok(fr.result)
  fr.onerror = erro
  fr.readAsDataURL(blob)
})

export function cssFontesEmbutidas() {
  if (!cache) {
    cache = (async () => {
      const r = await fetch(FONTES_URL)
      if (!r.ok) throw new Error(`fontes: HTTP ${r.status}`)
      const tudo = await r.text()
      const latinos = tudo.split(/(?=\/\*\s*[\w-]+\s*\*\/)/).filter((b) => /^\/\*\s*latin\s*\*\//.test(b))
      let css = latinos.length ? latinos.join('\n') : tudo
      const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))]
      for (const u of urls) {
        const f = await fetch(u)
        if (!f.ok) throw new Error(`fonte: HTTP ${f.status}`)
        css = css.split(u).join(await comoDataUrl(await f.blob()))
      }
      return css
    })().catch((e) => { cache = null; throw e })
  }
  return cache
}

// Opções do html-to-image com as fontes embutidas (sem elas, pula as fontes em vez de dar erro).
export async function opcoesImagem(extra = {}) {
  let fontEmbedCSS = ''
  try { fontEmbedCSS = await cssFontesEmbutidas() } catch (e) { console.warn('[imagem] fontes da marca indisponíveis:', e?.message) }
  return fontEmbedCSS ? { ...extra, fontEmbedCSS } : { ...extra, skipFonts: true }
}
