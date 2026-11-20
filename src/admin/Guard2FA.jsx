import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, Loader, KeyRound, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// Verificação em 2 etapas (TOTP) do painel. Enquanto a sessão não estiver em aal2,
// o painel NÃO abre. Primeiro acesso: cadastra o autenticador (QR). Depois: pede o
// código de 6 dígitos a cada login. Tudo nativo do Supabase Auth (mfa.*).
export default function Guard2FA({ children }) {
  const { logout } = useAuth()
  const [estado, setEstado] = useState('carregando') // carregando | enroll | challenge | ok
  const [factorId, setFactorId] = useState(null)
  const [qr, setQr] = useState(null)
  const [secret, setSecret] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const checar = useCallback(async () => {
    setEstado('carregando'); setErro('')
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') { setEstado('ok'); return }
    const { data: fatores } = await supabase.auth.mfa.listFactors()
    const verificados = fatores?.totp || []
    if (verificados.length > 0) {
      setFactorId(verificados[0].id)
      setEstado('challenge')
    } else {
      // Limpa fatores não verificados de tentativas abandonadas e cria um novo.
      for (const f of (fatores?.all || [])) {
        if (f.status === 'unverified') { try { await supabase.auth.mfa.unenroll({ factorId: f.id }) } catch { /* ignore */ } }
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'HopeFin Admin' })
      if (error) { setErro('Não consegui iniciar o 2FA: ' + error.message); setEstado('challenge'); return }
      setFactorId(data.id); setQr(data.totp?.qr_code); setSecret(data.totp?.secret)
      setEstado('enroll')
    }
  }, [])

  useEffect(() => { checar() }, [checar])

  async function verificar(e) {
    e.preventDefault()
    if (codigo.trim().length < 6) return
    setEnviando(true); setErro('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo.trim() })
    setEnviando(false)
    if (error) { setErro('Código inválido. Tente de novo.'); setCodigo(''); return }
    setCodigo(''); setEstado('ok')
  }

  if (estado === 'ok') return children

  if (estado === 'carregando') {
    return <div className="adm-auth"><Loader size={28} className="spin" color="var(--accent)" /></div>
  }

  const ehEnroll = estado === 'enroll'
  return (
    <div className="adm-auth">
      <form className="adm-auth-card" onSubmit={verificar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <ShieldCheck size={22} color="var(--accent)" />
          <h1 style={{ margin: 0, fontSize: 20 }}>{ehEnroll ? 'Proteger o painel' : 'Verificação em 2 etapas'}</h1>
        </div>
        <p className="sub">
          {ehEnroll
            ? 'Abra seu app autenticador (Google Authenticator, Authy…), leia o QR e digite o código de 6 dígitos.'
            : 'Digite o código de 6 dígitos do seu app autenticador.'}
        </p>

        {ehEnroll && qr && (
          <>
            <img className="adm-qr" src={qr} alt="QR do autenticador" />
            {secret && (
              <p className="sub" style={{ textAlign: 'center', wordBreak: 'break-all' }}>
                Ou digite a chave: <code style={{ color: 'var(--text)' }}>{secret}</code>
              </p>
            )}
          </>
        )}

        <div className="form-group">
          <label>Código do app</label>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo}
            onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))} placeholder="000000"
            autoFocus style={{ letterSpacing: 6, fontSize: 18, textAlign: 'center' }} />
        </div>

        {erro && <p style={{ color: 'var(--red-text)', fontSize: 13, margin: '0 0 12px' }}>{erro}</p>}

        <button className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} disabled={enviando || codigo.length < 6}>
          {enviando ? <><Loader size={18} className="spin" /> Verificando…</> : <><KeyRound size={18} /> {ehEnroll ? 'Ativar e entrar' : 'Entrar'}</>}
        </button>

        <button type="button" onClick={logout} style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text2)', fontSize: 13 }}>
          <LogOut size={15} /> Sair
        </button>
      </form>
    </div>
  )
}
