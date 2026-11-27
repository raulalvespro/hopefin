// Foto de perfil: corte quadrado central + redimensiona para um data URL leve (fica em usuarios.foto_url).
// Usado em Configurações e na Minha conta.
//
// 26/11/2026: a foto da Larissa (iPhone) não salvava e nenhuma mensagem aparecia. A versão antiga lia a foto
// inteira como texto (FileReader → data URL de vários MB) antes de reduzir; no iPhone isso pode travar sem
// nunca terminar. Agora: lê direto do arquivo (createImageBitmap ou URL do arquivo, bem mais leve), com
// tempo-limite — se travar, a pessoa vê o erro em vez de nada.

const TEMPO_LIMITE_MS = 20000

// Aceita arquivo sem "tipo" (acontece com foto vinda do iCloud/Google Fotos) se a extensão for de imagem.
export function pareceImagem(file) {
  if (!file) return false
  if (String(file.type || '').startsWith('image/')) return true
  if (file.type) return false
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(String(file.name || ''))
}

function comTempo(promessa, ms) {
  return Promise.race([
    promessa,
    new Promise((_, rej) => setTimeout(() => rej(new Error('tempo_esgotado')), ms)),
  ])
}

// Abre a imagem do jeito mais leve que o navegador oferecer.
async function abrir(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file)
      return { fonte: bmp, largura: bmp.width, altura: bmp.height, fechar: () => bmp.close?.() }
    } catch { /* cai pro jeito com <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('imagem_invalida'))
      i.src = url
    })
    return { fonte: img, largura: img.naturalWidth || img.width, altura: img.naturalHeight || img.height, fechar: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

export async function redimensionar(file, max = 160) {
  return comTempo((async () => {
    const im = await abrir(file)
    try {
      const lado = Math.min(im.largura, im.altura)
      if (!lado) throw new Error('imagem_invalida')
      const sx = (im.largura - lado) / 2, sy = (im.altura - lado) / 2
      const canvas = document.createElement('canvas')
      canvas.width = max; canvas.height = max
      canvas.getContext('2d').drawImage(im.fonte, sx, sy, lado, lado, 0, 0, max, max)
      return canvas.toDataURL('image/jpeg', 0.82)
    } finally {
      im.fechar()
    }
  })(), TEMPO_LIMITE_MS)
}
