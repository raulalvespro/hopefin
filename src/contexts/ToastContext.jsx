import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

const ToastContext = createContext({ toast: () => {} })

let idSeq = 0

const ICONE = {
  ok: <CheckCircle2 size={18} color="var(--accent)" style={{ flexShrink: 0 }} />,
  erro: <AlertCircle size={18} color="var(--red)" style={{ flexShrink: 0 }} />,
  info: <Info size={18} color="var(--blue)" style={{ flexShrink: 0 }} />,
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remover = useCallback(id => setToasts(ts => ts.filter(t => t.id !== id)), [])

  // toast(mensagem, tipo='ok'|'erro'|'info', opts)
  //   opts: número (ms, legado) ou { ms, acao: { label, onClick } }  (ex.: "Desfazer")
  const toast = useCallback((mensagem, tipo = 'ok', opts = {}) => {
    const o = typeof opts === 'number' ? { ms: opts } : (opts || {})
    const ms = o.ms != null ? o.ms : (o.acao ? 6000 : 3500)
    const id = ++idSeq
    setToasts(ts => [...ts, { id, mensagem, tipo, acao: o.acao }])
    if (ms) setTimeout(() => remover(id), ms)
    return id
  }, [remover])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 12px calc(12px + env(safe-area-inset-top))', zIndex: 9999, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} role={t.tipo === 'erro' ? 'alert' : 'status'}
            style={{ pointerEvents: 'auto', maxWidth: 440, width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 'var(--radius)', background: 'var(--panel-ink)', color: '#ffffff', boxShadow: 'var(--shadow-sm)', animation: 'hf-toast-in var(--dur-2) var(--ease)' }}>
            {ICONE[t.tipo] || ICONE.ok}
            <span style={{ fontSize: 14, color: '#ffffff', flex: 1 }}>{t.mensagem}</span>
            {t.acao ? (
              <button onClick={() => { t.acao.onClick?.(); remover(t.id) }}
                style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0 }}>
                {t.acao.label || 'Desfazer'}
              </button>
            ) : (
              <button onClick={() => remover(t.id)} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', padding: 0 }}>
                <X size={15} color="#94a3b8" />
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
