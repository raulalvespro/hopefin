import { useState } from 'react'
import { ShieldCheck, Loader, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ehPrevia } from './host'
import { Turnstile, ehErroCaptcha } from '../lib/turnstile'
import { copy } from '../copy/pt-BR'

// Login DEDICADO do painel do dono — nada a ver com o onboarding/login do app.
// A verificação em 2 etapas (2FA) acontece depois, no Guard2FA (já com sessão).
export default function AdminLogin() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro(''); setCarregando(true)
    const { error } = await login(email.trim(), senha)
    setCarregando(false)
    if (error) setErro(ehErroCaptcha(error) ? copy.login.erroCaptcha : copy.login.erroCredenciais)
    // Em caso de sucesso, o AuthContext atualiza a sessão e o AdminApp segue pro 2FA/painel.
  }

  return (
    <div className="adm-auth">
      <Turnstile />
      <form className="adm-auth-card" onSubmit={entrar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0 }}>Painel do dono</h1>
            <p className="sub" style={{ margin: 0 }}>HopeFin · acesso restrito</p>
          </div>
        </div>

        <div className="form-group">
          <label>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="username" autoFocus required />
        </div>
        <div className="form-group">
          <label>Senha</label>
          <div style={{ position: 'relative' }}>
            <input type={ver ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} placeholder="Sua senha" autoComplete="current-password" required style={{ paddingRight: 40 }} />
            <button type="button" onClick={() => setVer(v => !v)} aria-label="Mostrar senha" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text2)' }}>
              {ver ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {erro && <p style={{ color: 'var(--red-text)', fontSize: 13, margin: '0 0 12px' }}>{erro}</p>}

        <button className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} disabled={carregando}>
          {carregando ? <><Loader size={18} className="spin" /> Entrando…</> : 'Entrar'}
        </button>

        <p className="sub" style={{ textAlign: 'center', marginTop: 16, marginBottom: 0 }}>
          Este painel só abre para administradores{ehPrevia() ? ' · ambiente de prévia' : ''}.
        </p>
      </form>
    </div>
  )
}
