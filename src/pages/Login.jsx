import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import PainelMarca from '../components/PainelMarca'
import { Button } from '../components/ui'
import { Eye, EyeOff } from 'lucide-react'
import { copy } from '../copy/pt-BR'
import { reenviarConfirmacao, enviarRecuperacao, ESPERA_REENVIO_SEG } from '../lib/acesso'

const t = copy.login
const ta = copy.acesso

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [form, setForm] = useState({ email: '', senha: '' })
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  // 'login' | 'recuperar' — /login?recuperar=1 (vem do "Pedir um novo link") já abre o "Esqueci minha senha"
  const [modo, setModo] = useState(() => (params.get('recuperar') ? 'recuperar' : 'login'))
  const [enviado, setEnviado] = useState(false)
  const [espera, setEspera] = useState(0)             // segundos até poder reenviar o link (A6.4)
  const [reenvioLink, setReenvioLink] = useState(null) // { ok, texto } do último reenvio
  const [verSenha, setVerSenha] = useState(false)
  const [naoConfirmado, setNaoConfirmado] = useState(false) // conta criada, e-mail ainda não confirmado (L40)
  const [reenvio, setReenvio] = useState(null)
  const [reenviando, setReenviando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(''); setReenvio(null); setNaoConfirmado(false); setLoading(true)
    const { error } = await login(form.email, form.senha)
    setLoading(false)
    if (!error) { navigate('/'); return }
    const semConfirmar = error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message || '')
    setNaoConfirmado(semConfirmar)
    setErro(semConfirmar ? t.erroNaoConfirmado : t.erroCredenciais)
  }

  async function reenviar() {
    setReenviando(true); setReenvio(null)
    setReenvio(await reenviarConfirmacao(form.email))
    setReenviando(false)
  }

  // Contagem até liberar o "Reenviar e-mail" (o Supabase segura novo envio por 1 minuto).
  useEffect(() => {
    if (espera <= 0) return
    const id = setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [espera])

  async function handleRecuperar(e) {
    e.preventDefault()
    if (!form.email.trim()) { setErro(t.recErroEmail); return }
    setErro(''); setReenvioLink(null); setLoading(true)
    const r = await enviarRecuperacao(form.email)
    setLoading(false)
    if (!r.ok) { setErro(r.espera ? ta.reenviarEspere : t.recErroEnvio); return }
    setEnviado(true); setEspera(ESPERA_REENVIO_SEG)
  }

  async function reenviarLink() {
    setLoading(true); setReenvioLink(null)
    const r = await enviarRecuperacao(form.email)
    setLoading(false)
    setReenvioLink(r)
    if (r.ok || r.espera) setEspera(ESPERA_REENVIO_SEG)
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
                <div style={{ position: 'relative' }}>
                  <input type={verSenha ? 'text' : 'password'} placeholder="Sua senha" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} autoComplete="current-password" required style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setVerSenha(v => !v)} aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', color: 'var(--text2)' }}>
                    {verSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {erro && <p style={{ color: 'var(--red-text)', fontSize: 13, margin: 0 }}>{erro}</p>}
              {naoConfirmado && (
                <>
                  <Button variant="secondary" loading={reenviando} onClick={reenviar} style={{ width: '100%' }}>{t.reenviarConfirmacao}</Button>
                  {reenvio && <p style={{ margin: 0, fontSize: 13, color: reenvio.ok ? 'var(--accent-text)' : 'var(--red-text)' }}>{reenvio.texto}</p>}
                </>
              )}

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
                <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>{ta.naoChegou}</p>
                <Button variant="secondary" loading={loading} disabled={espera > 0} onClick={reenviarLink} style={{ width: '100%', marginTop: 6 }}>
                  {espera > 0 ? ta.reenviarEm(espera) : ta.reenviarLink}
                </Button>
                {reenvioLink && (
                  <p role="status" style={{ margin: 0, fontSize: 13, color: reenvioLink.ok ? 'var(--accent-text)' : 'var(--red-text)' }}>{reenvioLink.texto}</p>
                )}
                <button onClick={() => { setModo('login'); setEnviado(false); setReenvioLink(null) }} style={{ marginTop: 10, fontSize: 14, color: 'var(--accent-text)', fontWeight: 600 }}>
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
                  style={{ fontSize: 13, color: 'var(--text2)', margin: '0 auto' }}>
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
