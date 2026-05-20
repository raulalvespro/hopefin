import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Cadastro() {
  const { cadastrar } = useAuth()
  const navigate = useNavigate()
  const [tipo, setTipo] = useState('novo') // 'novo' ou 'existente'
  const [form, setForm] = useState({ nome: '', email: '', senha: '', nomeGrupo: '', codigoGrupo: '' })
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(''); setLoading(true)

    if (tipo === 'novo') {
      const { error } = await cadastrar(form.nome, form.email, form.senha, null, form.nomeGrupo || form.nome)
      if (error) { setErro(error.message); setLoading(false); return }
    } else {
      const { error } = await cadastrar(form.nome, form.email, form.senha, form.codigoGrupo, null)
      if (error) { setErro('Código de grupo inválido ou erro ao cadastrar'); setLoading(false); return }
    }

    setLoading(false)
    navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, color: 'var(--accent)', letterSpacing: '-0.03em' }}>HopeFin</h1>
          <p style={{ color: 'var(--text2)', marginTop: 8, fontSize: 14 }}>Crie sua conta</p>
        </div>

        {/* Tipo de conta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
          {[['novo', 'Nova família'], ['existente', 'Entrar em família']].map(([val, label]) => (
            <button key={val} onClick={() => setTipo(val)}
              style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: `1px solid ${tipo === val ? 'var(--accent)' : 'var(--border)'}`, background: tipo === val ? 'var(--accent-dim)' : 'transparent', color: tipo === val ? 'var(--accent)' : 'var(--text2)', fontSize: 13, fontWeight: 500, transition: 'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nome</label>
            <input placeholder="Seu nome" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>E-mail</label>
            <input type="email" placeholder="seu@email.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Senha</label>
            <input type="password" placeholder="mínimo 6 caracteres" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} minLength={6} required />
          </div>

          {tipo === 'novo' && (
            <div className="form-group">
              <label>Nome da família (opcional)</label>
              <input placeholder={`Família ${form.nome || '...'}`} value={form.nomeGrupo} onChange={e => setForm(p => ({ ...p, nomeGrupo: e.target.value }))} />
            </div>
          )}

          {tipo === 'existente' && (
            <div className="form-group">
              <label>Código do grupo</label>
              <input placeholder="Cole o código que seu familiar enviou" value={form.codigoGrupo} onChange={e => setForm(p => ({ ...p, codigoGrupo: e.target.value }))} required />
              <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Peça o código do grupo para quem criou a conta familiar (disponível nas configurações)</p>
            </div>
          )}

          {erro && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 14 }}>{erro}</p>}

          <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text2)' }}>
          Já tem conta?{' '}
          <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Entrar</Link>
        </p>
      </div>
    </div>
  )
}
