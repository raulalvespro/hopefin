// Meter — barra de progresso que anima do zero (hf-meter). valor em % (0–100).
export default function Meter({ valor = 0, cor = 'var(--accent)', altura = 10, style }) {
  const pct = Math.max(0, Math.min(100, Number(valor) || 0))
  return (
    <div style={{ height: altura, borderRadius: 6, background: 'var(--bg3)', overflow: 'hidden', ...style }}>
      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 6, background: cor, animation: 'hf-meter var(--dur-3) var(--ease) both' }} />
    </div>
  )
}
