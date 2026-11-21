// Foto de perfil: corte quadrado central + redimensiona para um data URL leve (fica em usuarios.foto_url).
// Usado em Configurações e na Minha conta.
export function redimensionar(file, max = 160) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()
    reader.onload = () => { img.src = reader.result }
    reader.onerror = reject
    img.onload = () => {
      const lado = Math.min(img.width, img.height)
      const sx = (img.width - lado) / 2, sy = (img.height - lado) / 2
      const canvas = document.createElement('canvas')
      canvas.width = max; canvas.height = max
      canvas.getContext('2d').drawImage(img, sx, sy, lado, lado, 0, 0, max, max)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = reject
    reader.readAsDataURL(file)
  })
}
