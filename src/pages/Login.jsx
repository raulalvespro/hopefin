import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', senha: '' })
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(''); setLoading(true)
    const { error } = await login(form.email, form.senha)
    setLoading(false)
    if (error) setErro('E-mail ou senha incorretos')
    else navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 32, color: 'var(--accent)', letterSpacing: '-0.03em' }}>HopeFin</h1>
          <p style={{ color: 'var(--text2)', marginTop: 8, fontSize: 14 }}>Suas finanças, organizadas.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>E-mail</label>
            <input type="email" placeholder="seu@email.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Senha</label>
            <input type="password" placeholder="••••••••" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} required />
          </div>

          {erro && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 14 }}>{erro}</p>}

          <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text2)' }}>
          Não tem conta?{' '}
          <Link to="/cadastro" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Cadastre-se</Link>
        </p>
      </div>
    </div>
  )
}
