import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Cadastro() {
  const { cadastrar } = useAuth()
  const navigate = useNavigate()
  const [tipo, setTipo] = useState('novo') // 'novo' (cria família) ou 'existente' (entra por código)
  const [form, setForm] = useState({ nome: '', email: '', senha: '', senha2: '', telefone: '', nomeGrupo: '', codigoGrupo: '', optin: true })
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    if (form.senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return }
    if (form.senha !== form.senha2) { setErro('As senhas não coincidem.'); return }
    if (tipo === 'existente' && !form.codigoGrupo.trim()) { setErro('Cole o código do convite.'); return }
    const telefone = form.telefone.replace(/\D/g, '')
    if (telefone.length < 10) { setErro('Informe um WhatsApp válido com DDD.'); return }

    const extra = { telefone, marketingOptin: form.optin }
    setLoading(true)
    if (tipo === 'novo') {
      const { error } = await cadastrar(form.nome, form.email, form.senha, null, form.nomeGrupo || `Família ${form.nome.split(' ')[0]}`, extra)
      if (error) { setErro(traduzErro(error)); setLoading(false); return }
    } else {
      const { error } = await cadastrar(form.nome, form.email, form.senha, form.codigoGrupo.trim(), null, extra)
      if (error) { setErro(traduzErro(error)); setLoading(false); return }
    }
    setLoading(false)
    navigate('/')
  }

  function traduzErro(error) {
    const m = (error?.message || '').toLowerCase()
    if (m.includes('already registered') || m.includes('already been')) return 'Já existe uma conta com esse e-mail. Faça login.'
    if (m.includes('codigo_invalido') || m.includes('invalid')) return 'Código do convite inválido. Confira com quem te convidou.'
    return 'Não foi possível criar a conta. Tente de novo.'
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, color: 'var(--accent)', letterSpacing: '-0.03em', fontFamily: 'Syne' }}>HopeFin</h1>
          <p style={{ color: 'var(--text2)', marginTop: 8, fontSize: 14 }}>Primeiro acesso — crie sua conta e sua senha.</p>
        </div>

        {/* Tipo de conta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 22 }}>
          {[['novo', '🏠 Criar família'], ['existente', '🔗 Tenho um convite']].map(([val, label]) => (
            <button key={val} type="button" onClick={() => { setTipo(val); setErro('') }}
              style={{ padding: '12px 8px', borderRadius: 'var(--radius-sm)', border: `1.5px solid ${tipo === val ? 'var(--accent)' : 'var(--border2)'}`, background: tipo === val ? 'var(--accent-dim)' : 'transparent', color: tipo === val ? 'var(--accent)' : 'var(--text2)', fontSize: 13, fontWeight: 600, transition: 'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Seu nome</label>
            <input placeholder="Como quer ser chamado(a)" value={form.nome} onChange={e => set('nome', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>E-mail</label>
            <input type="email" placeholder="seu@email.com" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" required />
          </div>
          <div className="form-group">
            <label>WhatsApp (com DDD)</label>
            <input type="tel" inputMode="numeric" placeholder="(11) 90000-0000" value={form.telefone} onChange={e => set('telefone', e.target.value)} autoComplete="tel" required />
          </div>
          <div className="form-group">
            <label>Crie sua senha</label>
            <input type="password" placeholder="mínimo 6 caracteres" value={form.senha} onChange={e => set('senha', e.target.value)} minLength={6} autoComplete="new-password" required />
          </div>
          <div className="form-group">
            <label>Repita a senha</label>
            <input type="password" placeholder="digite de novo" value={form.senha2} onChange={e => set('senha2', e.target.value)} minLength={6} autoComplete="new-password" required />
          </div>

          {tipo === 'novo' && (
            <div className="form-group">
              <label>Nome da família (opcional)</label>
              <input placeholder={`Família ${form.nome ? form.nome.split(' ')[0] : '...'}`} value={form.nomeGrupo} onChange={e => set('nomeGrupo', e.target.value)} />
              <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Depois você convida sua esposa com o código que aparece nas Configurações.</p>
            </div>
          )}

          {tipo === 'existente' && (
            <div className="form-group">
              <label>Código do convite</label>
              <input placeholder="Cole o código que você recebeu" value={form.codigoGrupo} onChange={e => set('codigoGrupo', e.target.value)} required />
              <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>Peça o código para quem criou a família (fica nas Configurações, em "Convidar para o grupo").</p>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text2)', marginBottom: 14, cursor: 'pointer', lineHeight: 1.45 }}>
            <input type="checkbox" checked={form.optin} onChange={e => set('optin', e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
            Quero receber dicas e novidades do HopeFin por WhatsApp e e-mail. Dá pra cancelar quando quiser.
          </label>

          {erro && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 14 }}>{erro}</p>}

          <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Criando conta...' : 'Criar conta e entrar'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text2)' }}>
          Já tem conta?{' '}
          <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Entrar</Link>
        </p>
      </div>
    </div>
  )
}
