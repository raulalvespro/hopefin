import { useMascote } from '../lib/mascote'
import { copy } from '../copy/pt-BR'

// Joca, o joão-de-barro do HopeFin. Imagens WebP sem fundo em /public/joca (320 e 640 px, srcset),
// carregadas só quando aparecem na tela (lazy). Some sozinho quando o mascote está desligado no /admin.
// Poses: base, anotando, comemorando, preocupado, construindo.
export default function Joca({ pose = 'base', tamanho = 140, alt, eager = false, style }) {
  const { mascote } = useMascote()
  if (!mascote) return null
  const f = p => `/joca/joca-${pose}-${p}.webp`
  return (
    <img
      src={f(320)} srcSet={`${f(320)} 320w, ${f(640)} 640w`} sizes={`${tamanho}px`}
      width={tamanho} height={tamanho} alt={alt ?? copy.mascote.alt[pose]}
      loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false}
      style={{ display: 'block', objectFit: 'contain', userSelect: 'none', ...style }}
    />
  )
}
