import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import Logo from '../components/Logo'

// Página de destino do link de recuperação de senha enviado por e-mail.
// O supabase-js estabelece a sessão de recuperação automaticamente ao abrir a URL.
export default function RedefinirSenha() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [form, setForm] = useState({ senha: '', senha2: '' })
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [temSessao, setTemSessao] = useState(null) // null = checando

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setTemSessao(!!data.session))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    if (form.senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return }
    if (form.senha !== form.senha2) { setErro('As senhas não coincidem.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: form.senha })
    setLoading(false)
    if (error) { setErro('Não foi possível salvar. O link pode ter expirado — peça um novo.'); return }
    toast('Senha atualizada!', 'ok')
    navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Logo size={40} style={{ display: 'flex', justifyContent: 'center' }} />
          <p style={{ color: 'var(--text2)', marginTop: 8, fontSize: 14 }}>Criar uma nova senha</p>
        </div>

        {temSessao === false ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>⚠️</p>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.5 }}>
              Este link é inválido ou expirou. Volte ao login e peça um novo link de redefinição.
            </p>
            <button onClick={() => navigate('/login')} style={{ marginTop: 24, fontSize: 14, color: 'var(--accent-text)', fontWeight: 600 }}>
              Ir para o login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nova senha</label>
              <input type="password" placeholder="mínimo 6 caracteres" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} minLength={6} autoComplete="new-password" required />
            </div>
            <div className="form-group">
              <label>Repita a nova senha</label>
              <input type="password" placeholder="digite de novo" value={form.senha2} onChange={e => setForm(p => ({ ...p, senha2: e.target.value }))} minLength={6} autoComplete="new-password" required />
            </div>
            {erro && <p style={{ color: 'var(--red-text)', fontSize: 13, marginBottom: 14 }}>{erro}</p>}
            <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={loading || temSessao === null}>
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
