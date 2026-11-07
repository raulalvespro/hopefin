// Button — primário (verde, altura 52) ou secundário (borda, altura 44).
// Estado `loading` mostra spinner e desabilita. Classes .ui-btn* no index.css.
export default function Button({
  children, variant = 'primary', loading = false, disabled = false,
  type = 'button', className = '', style, ...rest
}) {
  const cls = `ui-btn ui-btn--${variant} ${className}`.trim()
  return (
    <button type={type} className={cls} disabled={disabled || loading}
      aria-busy={loading || undefined} style={style} {...rest}>
      {loading && (
        <svg className="hf-spin" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="9" cy="9" r="7" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2.5" />
          <path d="M9 2 a7 7 0 0 1 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  )
}
