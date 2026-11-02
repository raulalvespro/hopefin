import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'

const ToastContext = createContext({ toast: () => {} })

let idSeq = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remover = useCallback(id => setToasts(ts => ts.filter(t => t.id !== id)), [])

  // tipo: 'ok' | 'erro'
  const toast = useCallback((mensagem, tipo = 'ok', ms = 3500) => {
    const id = ++idSeq
    setToasts(ts => [...ts, { id, mensagem, tipo }])
    if (ms) setTimeout(() => remover(id), ms)
    return id
  }, [remover])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 12px calc(12px + env(safe-area-inset-top))', zIndex: 9999, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} onClick={() => remover(t.id)}
            style={{ pointerEvents: 'auto', cursor: 'pointer', maxWidth: 440, width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg2)', border: `1px solid ${t.tipo === 'erro' ? 'var(--red)' : 'var(--accent)'}`, boxShadow: 'var(--shadow-sm)', animation: 'toastIn 0.2s ease' }}>
            {t.tipo === 'erro' ? <AlertCircle size={18} color="var(--red)" style={{ flexShrink: 0 }} /> : <CheckCircle2 size={18} color="var(--accent)" style={{ flexShrink: 0 }} />}
            <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{t.mensagem}</span>
            <X size={15} color="var(--text3)" style={{ flexShrink: 0 }} />
          </div>
        ))}
      </div>
      <style>{`@keyframes toastIn { from { transform: translateY(-12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
