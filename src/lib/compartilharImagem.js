// Transforma um elemento da tela em imagem PNG e compartilha (folha de compartilhar do
// celular, ex.: WhatsApp) ou baixa o arquivo quando o aparelho não compartilha arquivos.
// A biblioteca html-to-image só é carregada na hora de usar.
// Devolve 'compartilhado' | 'baixado' | 'cancelado'; lança erro se a imagem não puder ser gerada.
export async function compartilharImagem(elemento, { nomeArquivo = 'resumo.png', titulo = '', texto = '' } = {}) {
  const { toBlob } = await import('html-to-image')
  // Fontes da marca já carregadas na página (Syne/DM Sans) entram na imagem.
  if (document.fonts?.ready) { try { await document.fonts.ready } catch { /* segue */ } }
  const blob = await toBlob(elemento, { pixelRatio: 2, cacheBust: true })
  if (!blob) throw new Error('imagem_vazia')
  const arquivo = new File([blob], nomeArquivo, { type: 'image/png' })

  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: titulo, text: texto })
      return 'compartilhado'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado' // a pessoa fechou a folha de compartilhar
      throw e
    }
  }

  // Sem compartilhar arquivo (ex.: desktop): baixa a imagem.
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nomeArquivo
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'baixado'
}
