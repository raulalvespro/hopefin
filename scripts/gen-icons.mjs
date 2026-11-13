// Regera os ícones do PWA a partir dos SVGs da marca (nítidos, sem depender de PNG de origem).
//   node scripts/gen-icons.mjs
// Fonte: public/logo.svg (quadrado arredondado) e public/logo-app.svg (full-bleed, p/ maskable).
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const logo = readFileSync(join(raiz, 'logo.svg'))
const logoApp = readFileSync(join(raiz, 'logo-app.svg'))

// density alto => rasterização nítida antes do resize final.
const alvos = [
  [logo, 64, 'pwa-64x64.png'],
  [logo, 192, 'pwa-192x192.png'],
  [logo, 512, 'pwa-512x512.png'],
  [logo, 180, 'apple-touch-icon-180x180.png'],
  [logoApp, 512, 'maskable-icon-512x512.png'],
]

for (const [svg, size, nome] of alvos) {
  await sharp(svg, { density: 512 })
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toFile(join(raiz, nome))
  console.log('ok', nome, `${size}x${size}`)
}
console.log('Ícones regerados em public/.')
