import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import Logo from '../components/Logo'
import { SENHA_MIN, mensagemErroSenha } from '../lib/acesso'
import { copy } from '../copy/pt-BR'

const t = copy.acesso

// Página de destino do link de recuperação de senha enviado por e-mail.
// O supabase-js estabelece a sessão de recuperação automaticamente ao abrir a URL.
// Se o link cair em outra página do app, o PortaoRecuperacao (App.jsx) traz a pessoa pra cá.
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
    if (form.senha.length < SENHA_MIN) { setErro(t.senhaCurta); return }
    if (form.senha !== form.senha2) { setErro(t.senhasDiferentes); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: form.senha })
    setLoading(false)
    if (error) { setErro(mensagemErroSenha(error) || t.erroSalvarSenha); return }
    toast(t.senhaAtualizada, 'ok')
    navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Logo size={40} style={{ display: 'flex', justifyContent: 'center' }} />
          <p style={{ color: 'var(--text2)', marginTop: 8, fontSize: 14 }}>{t.novaSenhaTitulo}</p>
        </div>

        {temSessao === false ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>⚠️</p>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.5 }}>{t.linkInvalido}</p>
            <button className="btn-primary" onClick={() => navigate('/login?recuperar=1')} style={{ marginTop: 24, width: '100%' }}>
              {t.pedirNovoLink}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>{t.novaSenha}</label>
              <input type="password" placeholder={t.phSenha} value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} minLength={SENHA_MIN} autoComplete="new-password" required />
            </div>
            <div className="form-group">
              <label>{t.repitaSenha}</label>
              <input type="password" placeholder={t.phRepita} value={form.senha2} onChange={e => setForm(p => ({ ...p, senha2: e.target.value }))} minLength={SENHA_MIN} autoComplete="new-password" required />
            </div>
            {erro && <p style={{ color: 'var(--red-text)', fontSize: 13, marginBottom: 14 }}>{erro}</p>}
            <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={loading || temSessao === null}>
              {loading ? t.salvandoSenha : t.salvarSenha}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
