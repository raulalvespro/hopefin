import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'
import { VERSAO_LEGAL } from '../lib/legal'
import { precosVigentes } from '../lib/precos'
import PainelMarca from '../components/PainelMarca'
import { Button } from '../components/ui'
import { copy } from '../copy/pt-BR'

const t = copy.cadastro
const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Arte do painel do cadastro: a família ligada ao saldo único + selo do preço de
// lançamento (lido da config). Fica no painel escuro, nos dois temas.
function ArteCadastro({ preco }) {
  const AV = [
    { cx: 70, cy: 70, bg: 'rgba(16,185,129,.22)', fg: '#34d399', txt: t.avVoce, delay: '.1s' },
    { cx: 70, cy: 190, bg: 'rgba(96,165,250,.22)', fg: '#93c5fd', txt: t.avMais, delay: '.25s' },
    { cx: 430, cy: 70, bg: 'rgba(167,139,250,.22)', fg: '#c4b5fd', txt: t.avMais, delay: '.4s' },
  ]
  const dataFmt = preco.lancamentoAte ? new Date(preco.lancamentoAte).toLocaleDateString('pt-BR') : ''
  return (
    <div className="entrada-arte" style={{ height: 240 }}>
      <svg className="entrada-barras" viewBox="0 0 520 240" aria-hidden="true" style={{ width: 'min(520px, 96%)', height: 'auto' }}>
        <path className="hf-line" d="M70 70 C 150 70, 170 150, 250 150" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: '.5s' }} />
        <path className="hf-line" d="M70 190 C 150 190, 170 150, 250 150" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: '.7s' }} />
        <path className="hf-line" d="M430 70 C 350 70, 330 150, 270 150" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: '.9s' }} />
        {AV.map((a, i) => (
          <g key={i} className="hf-pop" style={{ animationDelay: a.delay }}>
            <circle cx={a.cx} cy={a.cy} r="34" fill={a.bg} />
            <text x={a.cx} y={a.cy + 7} textAnchor="middle" fontFamily="Syne, sans-serif" fontWeight="700" fontSize="20" fill={a.fg}>{a.txt}</text>
          </g>
        ))}
        <g className="hf-pulse">
          <rect x="200" y="110" width="120" height="80" rx="16" fill="#10b981" />
          <text x="260" y="146" textAnchor="middle" fontFamily="DM Sans, sans-serif" fontSize="13" fill="#06281e">{t.saldoCasaLabel}</text>
          <text x="260" y="170" textAnchor="middle" fontFamily="Syne, sans-serif" fontWeight="700" fontSize="18" fill="#06281e">{t.saldoCasaValor}</text>
        </g>
      </svg>
      {preco.lancamentoAtivo && (
        <div className="entrada-saldo" style={{ position: 'absolute', right: 0, bottom: 8, flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: 'rgba(251,191,36,.18)', color: '#fcd34d' }}>{t.seloLabel}</span>
          <span style={{ fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 22, color: '#ffffff' }}>
            {brl(preco.anualPix)}<span style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 400, fontSize: 13, color: '#94a3b8' }}> {t.seloAno}</span>
          </span>
          {dataFmt && <span style={{ fontSize: 12, color: '#94a3b8' }}>{t.seloAte(dataFmt)}</span>}
        </div>
      )}
    </div>
  )
}

export default function Cadastro() {
  const { cadastrar } = useAuth()
  const navigate = useNavigate()
  const [tipo, setTipo] = useState('novo') // 'novo' (cria família) ou 'existente' (entra por código)
  const [form, setForm] = useState({ nome: '', email: '', senha: '', senha2: '', telefone: '', nomeGrupo: '', codigoGrupo: '', cupom: '', optin: true, aceite: false })
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [preco, setPreco] = useState(() => precosVigentes(null))

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Preço vigente lido da config (prompt 2.1); fallback do precos.js se a RPC falhar.
  useEffect(() => {
    let vivo = true
    supabase.rpc('planos_publicos').then(({ data, error }) => {
      if (vivo && !error && data) setPreco(precosVigentes(data))
    })
    return () => { vivo = false }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    if (form.senha.length < 6) { setErro(t.erroSenhaCurta); return }
    if (form.senha !== form.senha2) { setErro(t.erroSenhaDif); return }
    if (tipo === 'existente' && !form.codigoGrupo.trim()) { setErro(t.erroCodigo); return }
    const telefone = form.telefone.replace(/\D/g, '')
    if (telefone.length < 10) { setErro(t.erroWhats); return }
    if (!form.aceite) { setErro(t.erroAceite); return }

    const extra = { telefone, marketingOptin: form.optin, aceiteVersao: VERSAO_LEGAL }
    setLoading(true)
    if (tipo === 'novo') {
      const { error } = await cadastrar(form.nome, form.email, form.senha, null, form.nomeGrupo || `Família ${form.nome.split(' ')[0]}`, extra)
      if (error) { setErro(traduzErro(error)); setLoading(false); return }
    } else {
      const { error } = await cadastrar(form.nome, form.email, form.senha, form.codigoGrupo.trim(), null, extra)
      if (error) { setErro(traduzErro(error)); setLoading(false); return }
    }
    track('cadastro_concluido', { tipo, marketing_optin: form.optin })

    // Cupom (opcional): a conta e o grupo já existem, então dá para resgatar
    // agora. Best-effort — se o código estiver errado, mandamos para Planos.
    const cupom = form.cupom.trim()
    if (cupom) {
      const { error } = await supabase.rpc('resgatar_cupom', { p_codigo: cupom })
      setLoading(false)
      navigate(error ? '/planos' : '/')
      return
    }
    setLoading(false)
    navigate('/')
  }

  function traduzErro(error) {
    const m = (error?.message || '').toLowerCase()
    if (m.includes('already registered') || m.includes('already been')) return t.erroEmailUsado
    if (m.includes('codigo_invalido') || m.includes('invalid')) return t.erroCodigoInvalido
    return t.erroGenerico
  }

  return (
    <div className="entrada">
      <PainelMarca titulo={t.painelTitulo} subtitulo={t.painelTexto} arte={<ArteCadastro preco={preco} />} />
      <section className="entrada-form">
        <div className="entrada-card hf-in">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 26, lineHeight: '32px' }}>{t.titulo}</h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: '22px', color: 'var(--text2)' }}>{t.subtitulo(preco.trialDias)}</p>
          </div>

          {/* Tipo de conta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
            {[['novo', t.tipoNovo], ['existente', t.tipoExistente]].map(([val, label]) => (
              <button key={val} type="button" onClick={() => { setTipo(val); setErro('') }}
                style={{ padding: '12px 8px', borderRadius: 'var(--radius-sm)', border: `1.5px solid ${tipo === val ? 'var(--accent)' : 'var(--border2)'}`, background: tipo === val ? 'var(--accent-dim)' : 'transparent', color: tipo === val ? 'var(--accent-text)' : 'var(--text2)', fontSize: 13, fontWeight: 600, transition: 'all 0.15s' }}>
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>{t.labelNome}</label>
              <input placeholder={t.phNome} value={form.nome} onChange={e => set('nome', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t.labelEmail}</label>
              <input type="email" placeholder="voce@email.com" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" required />
            </div>
            <div className="form-group">
              <label>{t.labelWhats}</label>
              <input type="tel" inputMode="numeric" placeholder={t.phWhats} value={form.telefone} onChange={e => set('telefone', e.target.value)} autoComplete="tel" required />
            </div>
            <div className="form-group">
              <label>{t.labelSenha}</label>
              <input type="password" placeholder={t.phSenha} value={form.senha} onChange={e => set('senha', e.target.value)} minLength={6} autoComplete="new-password" required />
            </div>
            <div className="form-group">
              <label>{t.labelSenha2}</label>
              <input type="password" placeholder={t.phSenha2} value={form.senha2} onChange={e => set('senha2', e.target.value)} minLength={6} autoComplete="new-password" required />
            </div>

            {tipo === 'novo' && (
              <div className="form-group">
                <label>{t.labelGrupo}</label>
                <input placeholder={`Família ${form.nome ? form.nome.split(' ')[0] : '...'}`} value={form.nomeGrupo} onChange={e => set('nomeGrupo', e.target.value)} />
                <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>{t.ajudaGrupo}</p>
              </div>
            )}

            <div className="form-group">
              <label>{t.labelCupom}</label>
              <input placeholder={t.phCupom} value={form.cupom} onChange={e => set('cupom', e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
            </div>

            {tipo === 'existente' && (
              <div className="form-group">
                <label>{t.labelCodigo}</label>
                <input placeholder={t.phCodigo} value={form.codigoGrupo} onChange={e => set('codigoGrupo', e.target.value)} required />
                <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>{t.ajudaCodigo}</p>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text2)', marginBottom: 12, cursor: 'pointer', lineHeight: 1.45 }}>
              <input type="checkbox" checked={form.aceite} onChange={e => set('aceite', e.target.checked)} style={{ marginTop: 2, flexShrink: 0, width: 'auto' }} />
              <span>{t.aceite}{' '}
                <Link to="/termos" target="_blank" style={{ color: 'var(--accent-text)', fontWeight: 600 }}>{t.aceiteTermos}</Link> {t.aceiteE}{' '}
                <Link to="/privacidade" target="_blank" style={{ color: 'var(--accent-text)', fontWeight: 600 }}>{t.aceitePrivacidade}</Link>.
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text2)', marginBottom: 14, cursor: 'pointer', lineHeight: 1.45 }}>
              <input type="checkbox" checked={form.optin} onChange={e => set('optin', e.target.checked)} style={{ marginTop: 2, flexShrink: 0, width: 'auto' }} />
              {t.optin}
            </label>

            {erro && <p style={{ color: 'var(--red-text)', fontSize: 13, marginBottom: 14 }}>{erro}</p>}

            <Button type="submit" loading={loading} style={{ width: '100%' }}>
              {loading ? t.enviando : t.enviar}
            </Button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text2)' }}>
            {t.jaTemConta}{' '}
            <Link to="/login" style={{ color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>{t.entrar}</Link>
          </p>
        </div>
      </section>
    </div>
  )
}
