// Ícone de categoria (traço 1.75, Lucide) para os slugs conhecidos; cai no emoji
// do grupo (sistema atual do app) quando a categoria é custom. Assim o visual novo
// usa Lucide onde dá, sem arrancar as categorias com emoji que o usuário edita.
import {
  ShoppingCart, Bus, Fuel, UtensilsCrossed, Home, HeartPulse, GraduationCap,
  Receipt, Shirt, Gamepad2, Dog, Baby, Plane, Package,
} from 'lucide-react'

const MAPA = {
  mercado: ShoppingCart, transporte: Bus, combustivel: Fuel, alimentacao: UtensilsCrossed,
  moradia: Home, saude: HeartPulse, educacao: GraduationCap, contas: Receipt,
  vestuario: Shirt, lazer: Gamepad2, pet: Dog, filhos: Baby, viagem: Plane, outros: Package,
}

export function temIconeLucide(slug) {
  return !!MAPA[slug]
}

export default function IconeCategoria({ slug, emoji, size = 22 }) {
  const Ico = MAPA[slug]
  if (Ico) return <Ico size={size} strokeWidth={1.75} aria-hidden="true" />
  if (emoji) return <span style={{ fontSize: Math.round(size * 0.9) }} aria-hidden="true">{emoji}</span>
  return <Package size={size} strokeWidth={1.75} aria-hidden="true" />
}
