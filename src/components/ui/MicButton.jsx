// MicButton — botão redondo verde do lançamento por voz. Quando `ouvindo`, mostra
// um anel pulsando (hf-ring). Liga na lógica do prompt 11.
import { Mic } from 'lucide-react'
export default function MicButton({ ouvindo = false, onClick, size = 60, style, ...rest }) {
  return (
    <button onClick={onClick} aria-label={rest['aria-label'] || 'Lançar por voz'}
      style={{
        position: 'relative', width: size, height: size, borderRadius: size / 2,
        background: 'var(--accent)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(16,185,129,.35)', cursor: 'pointer', ...style,
      }} {...rest}>
      {ouvindo && (
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'var(--accent)', animation: 'hf-ring 2.4s ease-out infinite' }} />
      )}
      <Mic size={Math.round(size * 0.43)} color="var(--on-accent)" strokeWidth={2} style={{ position: 'relative' }} />
    </button>
  )
}
