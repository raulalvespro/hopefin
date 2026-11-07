// Painel escuro de marca das telas de entrada (login e cadastro). No desktop fica
// à esquerda em altura cheia; no celular vira uma faixa no topo. Traz o logo com o
// H que se desenha, um título/subtítulo e uma "arte" embaixo. Por padrão a arte são
// as barras que sobem + o card de saldo (login); o cadastro passa a sua própria arte
// (avatares da família + selo de preço). Dados de exemplo ficam rotulados no pt-BR.js.
import { copy } from '../copy/pt-BR'

function LogoMarca({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect x="8" y="8" width="496" height="496" rx="108" fill="#ffffff" stroke="#10b981" strokeWidth="16" />
      <g fill="#10b981"><rect x="150" y="146" width="58" height="220" rx="18" /><rect x="304" y="146" width="58" height="220" rx="18" /></g>
      <path className="hf-stroke" d="M190 300 L322 222" fill="none" stroke="#10b981" strokeWidth="54" strokeLinecap="round" />
    </svg>
  )
}

// Arte padrão (login): barras que sobem + card flutuante de saldo (só no desktop).
function ArteBarras() {
  const mes = new Date().toLocaleDateString('pt-BR', { month: 'long' })
  return (
    <div className="entrada-arte">
      <svg className="entrada-barras" viewBox="0 0 512 200" aria-hidden="true" style={{ width: 'min(512px, 92%)', height: 'auto' }}>
        <rect className="hf-bar" x="0" y="120" width="44" height="80" rx="22" fill="#1b253b" />
        <rect className="hf-bar" x="64" y="96" width="44" height="104" rx="22" fill="#1b253b" style={{ animationDelay: '.2s' }} />
        <rect className="hf-bar" x="128" y="70" width="44" height="130" rx="22" fill="#0ea371" style={{ animationDelay: '.4s' }} />
        <rect className="hf-bar" x="192" y="44" width="44" height="156" rx="22" fill="#10b981" style={{ animationDelay: '.6s' }} />
        <rect className="hf-bar" x="256" y="14" width="44" height="186" rx="22" fill="#10b981" style={{ animationDelay: '.8s' }} />
      </svg>
      <div className="entrada-saldo hf-float" style={{ position: 'absolute', right: 0, top: 0, width: 240, background: '#111a2e', border: '1px solid rgba(255,255,255,.15)', borderRadius: 16, padding: '18px 20px', boxSizing: 'border-box', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>{copy.entrada.saldoLabel} em {mes}</span>
        <span style={{ fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 26, color: '#ffffff' }}>{copy.entrada.saldoValor}</span>
        <span style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: 'rgba(16,185,129,.2)', color: '#34d399' }}>{copy.entrada.saldoTag}</span>
      </div>
    </div>
  )
}

export default function PainelMarca({ titulo, subtitulo, arte }) {
  return (
    <section className="entrada-painel" aria-label="HopeFin">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LogoMarca />
        <span style={{ fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em', color: '#e2e8f0' }}>
          hope<span style={{ color: '#10b981' }}>fin</span>
        </span>
      </div>

      <div className="hf-in" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460, position: 'relative', zIndex: 1 }}>
        <h1 style={{ margin: 0, fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 'clamp(28px, 4.5vw, 44px)', lineHeight: 1.08, color: '#ffffff' }}>
          {titulo || copy.entrada.pitchTitulo}
        </h1>
        <p className="entrada-pitch-sub" style={{ margin: 0, fontSize: 17, lineHeight: '26px', color: '#94a3b8' }}>
          {subtitulo || copy.entrada.pitchTexto}
        </p>
      </div>

      {arte || <ArteBarras />}
    </section>
  )
}
