import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import PainelMarca from '../components/PainelMarca'
import { Button } from '../components/ui'
import { copy } from '../copy/pt-BR'

const t = copy.login

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
    if (error) setErro(t.erroCredenciais)
    else navigate('/')
  }

  async function handleRecuperar(e) {
    e.preventDefault()
    if (!form.email) { setErro(t.recErroEmail); return }
    setErro(''); setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(form.email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    setLoading(false)
    if (error) setErro(t.recErroEnvio)
    else setEnviado(true)
  }

  return (
    <div className="entrada">
      <PainelMarca />
      <section className="entrada-form">
        <div className="entrada-card hf-in">

          {modo === 'login' && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h2 style={{ margin: 0, fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 26, lineHeight: '32px' }}>{t.titulo}</h2>
                <p style={{ margin: 0, fontSize: 15, lineHeight: '22px', color: 'var(--text2)' }}>{t.subtitulo}</p>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>{t.labelEmail}</label>
                <input type="email" placeholder="voce@email.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} autoComplete="email" required />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <label style={{ margin: 0 }}>{t.labelSenha}</label>
                  <button type="button" onClick={() => { setModo('recuperar'); setErro('') }}
                    style={{ fontSize: 13, color: 'var(--accent-text)' }}>{t.esqueci}</button>
                </div>
                <input type="password" placeholder="Sua senha" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} autoComplete="current-password" required />
              </div>

              {erro && <p style={{ color: 'var(--red-text)', fontSize: 13, margin: 0 }}>{erro}</p>}

              <Button type="submit" loading={loading} style={{ width: '100%', marginTop: 4 }}>
                {loading ? t.entrando : t.entrar}
              </Button>

              <div className="divider" style={{ margin: '4px 0' }} />
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)', textAlign: 'center' }}>
                {t.semConta}{' '}
                <Link to="/cadastro" style={{ color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>{t.criarConta}</Link>
              </p>
            </form>
          )}

          {modo === 'recuperar' && (
            enviado ? (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 40, margin: 0 }}>📬</p>
                <h2 style={{ margin: 0, fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 20 }}>{t.enviadoTitulo}</h2>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>{t.enviadoTexto(form.email)}</p>
                <button onClick={() => { setModo('login'); setEnviado(false) }} style={{ marginTop: 10, fontSize: 14, color: 'var(--accent-text)', fontWeight: 600 }}>
                  {t.enviadoVoltar}
                </button>
              </div>
            ) : (
              <form onSubmit={handleRecuperar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <h2 style={{ margin: 0, fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 24 }}>{t.recTitulo}</h2>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)', lineHeight: 1.5 }}>{t.recTexto}</p>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>{t.labelEmail}</label>
                  <input type="email" placeholder="voce@email.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} autoComplete="email" required />
                </div>
                {erro && <p style={{ color: 'var(--red-text)', fontSize: 13, margin: 0 }}>{erro}</p>}
                <Button type="submit" loading={loading} style={{ width: '100%' }}>
                  {loading ? t.recEnviando : t.recEnviar}
                </Button>
                <button type="button" onClick={() => { setModo('login'); setErro('') }}
                  style={{ fontSize: 13, color: 'var(--text3)', margin: '0 auto' }}>
                  ← {t.recVoltar}
                </button>
              </form>
            )
          )}

        </div>
      </section>
    </div>
  )
}
