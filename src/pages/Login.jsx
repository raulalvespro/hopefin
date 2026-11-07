import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', senha: '' })
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [modo, setModo] = useState('login') // 'login' | 'recuperar'
  const [enviado, setEnviado] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(''); setLoading(true)
    const { error } = await login(form.email, form.senha)
    setLoading(false)
    if (error) setErro('E-mail ou senha incorretos')
    else navigate('/')
  }

  async function handleRecuperar(e) {
    e.preventDefault()
    if (!form.email) { setErro('Informe seu e-mail'); return }
    setErro(''); setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(form.email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    setLoading(false)
    if (error) setErro('Não foi possível enviar o e-mail. Tente de novo.')
    else setEnviado(true)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <Logo size={44} style={{ display: 'flex', justifyContent: 'center' }} />
          <p style={{ color: 'var(--text2)', marginTop: 8, fontSize: 14 }}>As finanças da sua família, no mesmo lugar.</p>
        </div>

        {modo === 'login' && (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>E-mail</label>
              <input type="email" placeholder="seu@email.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} autoComplete="email" required />
            </div>
            <div className="form-group">
              <label>Senha</label>
              <input type="password" placeholder="••••••••" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} autoComplete="current-password" required />
            </div>

            {erro && <p style={{ color: 'var(--red-text)', fontSize: 13, marginBottom: 14 }}>{erro}</p>}

            <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

            <button type="button" onClick={() => { setModo('recuperar'); setErro('') }}
              style={{ display: 'block', margin: '16px auto 0', fontSize: 13, color: 'var(--text3)' }}>
              Esqueci minha senha
            </button>

            <p style={{ textAlign: 'center', marginTop: 28, fontSize: 14, color: 'var(--text2)' }}>
              Primeiro acesso?{' '}
              <Link to="/cadastro" style={{ color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>Criar minha conta</Link>
            </p>
          </form>
        )}

        {modo === 'recuperar' && (
          enviado ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 40, marginBottom: 12 }}>📬</p>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Verifique seu e-mail</p>
              <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                Se houver uma conta para <strong>{form.email}</strong>, enviamos um link para você criar uma nova senha.
              </p>
              <button onClick={() => { setModo('login'); setEnviado(false) }} style={{ marginTop: 24, fontSize: 14, color: 'var(--accent-text)', fontWeight: 600 }}>
                Voltar para o login
              </button>
            </div>
          ) : (
            <form onSubmit={handleRecuperar}>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.5 }}>
                Informe seu e-mail e enviaremos um link para você redefinir a senha.
              </p>
              <div className="form-group">
                <label>E-mail</label>
                <input type="email" placeholder="seu@email.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} autoComplete="email" required />
              </div>
              {erro && <p style={{ color: 'var(--red-text)', fontSize: 13, marginBottom: 14 }}>{erro}</p>}
              <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar link'}
              </button>
              <button type="button" onClick={() => { setModo('login'); setErro('') }}
                style={{ display: 'block', margin: '16px auto 0', fontSize: 13, color: 'var(--text3)' }}>
                ← Voltar
              </button>
            </form>
          )
        )}
      </div>
    </div>
  )
}
