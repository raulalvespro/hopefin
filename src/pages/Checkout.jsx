import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { ChevronLeft, Copy, Check, QrCode, Barcode, CreditCard, ShieldCheck, Sparkles, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmt } from '../lib/format'
import { track } from '../lib/analytics'
import { precosVigentes } from '../lib/precos'

const METODOS = [
  { id: 'pix', label: 'Pix', icon: QrCode },
  { id: 'cartao', label: 'Cartão', icon: CreditCard },
  { id: 'boleto', label: 'Boleto', icon: Barcode },
]

// Logo de bandeira num chip branco (os SVGs têm proporção de cartão; o fundo
// branco garante leitura no tema escuro do checkout).
function Selo({ src, nome }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 6px', borderRadius: 5, background: '#fff' }}>
      <img src={src} alt={nome} title={nome} style={{ height: 16, display: 'block' }} />
    </span>
  )
}

export default function Checkout() {
  const { perfil } = useAuth()
  const [params] = useSearchParams()
  const ciclo = params.get('ciclo') === 'mensal' ? 'mensal' : 'anual'
  const metodoInicial = ['pix', 'cartao', 'boleto'].includes(params.get('metodo')) ? params.get('metodo') : 'pix'

  const [planos, setPlanos] = useState(null)
  const [metodo, setMetodo] = useState(metodoInicial)
  const [form, setForm] = useState({ nome: '', email: '', cpf: '', telefone: '', cartaoNome: '', numero: '', validade: '', ccv: '', cep: '', numeroEnd: '' })
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [etapa, setEtapa] = useState('dados') // dados | pix | boleto | sucesso
  const [pix, setPix] = useState(null)
  const [boleto, setBoleto] = useState(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => { supabase.rpc('planos_publicos').then(({ data }) => data && setPlanos(data)) }, [])
  useEffect(() => {
    if (!perfil) return
    setForm(f => ({
      ...f,
      nome: f.nome || perfil.nome || '',
      email: f.email || perfil.email || '',
      telefone: f.telefone || perfil.telefone || '',
    }))
  }, [perfil])

  // Confirmação em tempo real: o webhook ativa a assinatura; aqui só observamos.
  useEffect(() => {
    if (etapa !== 'pix' && etapa !== 'boleto') return
    const id = setInterval(async () => {
      const { data } = await supabase.from('subscriptions').select('status').maybeSingle()
      if (data?.status === 'active') { clearInterval(id); setEtapa('sucesso') }
    }, 4000)
    return () => clearInterval(id)
  }, [etapa])

  // Fim do funil: assinatura ativada (Pix/boleto confirmados pelo webhook ou cartão).
  useEffect(() => {
    if (etapa === 'sucesso') track('assinatura_ativada', { ciclo, metodo })
  }, [etapa])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const pv = precosVigentes(planos)
  // Preço conforme ciclo e método: anual no cartão é parcelado em 12x (total
  // maior por causa das taxas); Pix/boleto no anual é o valor à vista.
  const anualCartao = ciclo === 'anual' && metodo === 'cartao'
  const centavos = ciclo === 'mensal' ? pv.mensal : (anualCartao ? pv.anualCartao : pv.anualPix)
  const parcelas = 12 // anual no cartão é sempre 12x
  const parcelaCartao = anualCartao ? pv.anualCartaoParcela : null
  const temLancamento = ciclo === 'anual' && pv.lancamentoAtivo

  async function pagar() {
    setErro('')
    if (form.nome.trim().length < 3 || !form.nome.trim().includes(' ')) { setErro('Informe seu nome completo.'); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) { setErro('Informe um e-mail válido.'); return }
    const cpf = form.cpf.replace(/\D/g, '')
    if (cpf.length < 11) { setErro('Informe um CPF válido.'); return }
    if ((form.telefone || '').replace(/\D/g, '').length < 10) { setErro('Informe um WhatsApp com DDD.'); return }
    const body = { ciclo, metodo, cpfCnpj: cpf, telefone: form.telefone, nome: form.nome.trim(), email: form.email.trim() }
    if (metodo === 'cartao') {
      if (!form.numero || !form.validade || !form.ccv || !form.cartaoNome) { setErro('Preencha os dados do cartão.'); return }
      const [mes, ano] = form.validade.split('/')
      const anoFull = (ano || '').trim().length === 2 ? `20${ano.trim()}` : (ano || '').trim()
      body.cartao = { holderName: form.cartaoNome, number: form.numero, expiryMonth: (mes || '').trim(), expiryYear: anoFull, ccv: form.ccv }
      body.titular = { cep: form.cep, numero: form.numeroEnd }
    }
    setEnviando(true)
    track('checkout_submetido', { metodo, ciclo })
    const { data, error } = await supabase.functions.invoke('asaas-assinar', { body })
    setEnviando(false)
    if (error || data?.error) { setErro(data?.error || 'Não foi possível processar o pagamento. Tente de novo.'); return }
    if (data.metodo === 'pix') { setPix(data.pix); setEtapa('pix'); track('checkout_cobranca_gerada', { metodo: 'pix', ciclo }) }
    else if (data.metodo === 'boleto') { setBoleto(data.boleto); setEtapa('boleto'); track('checkout_cobranca_gerada', { metodo: 'boleto', ciclo }) }
    else if (['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(data.status)) setEtapa('sucesso')
    else setErro('O pagamento no cartão não foi aprovado. Tente outro cartão ou escolha Pix.')
  }

  function copiar(texto) {
    navigator.clipboard?.writeText(texto || '').then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000) })
  }

  // ---------- Sucesso ----------
  if (etapa === 'sucesso') {
    return (
      <div style={{ textAlign: 'center', paddingTop: 40 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <Check size={30} color="var(--accent)" strokeWidth={3} />
        </div>
        <h2 style={{ fontSize: 22, marginBottom: 8 }}>Assinatura ativa! 🎉</h2>
        <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24, lineHeight: 1.6 }}>
          Pagamento confirmado. O HopeFin Família está liberado pra toda a casa.
        </p>
        <Link to="/" className="btn-primary" style={{ display: 'inline-block', textDecoration: 'none', padding: '13px 28px' }}>Ir para o início</Link>
      </div>
    )
  }

  // ---------- Pix ----------
  if (etapa === 'pix') {
    return (
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, marginBottom: 6 }}>Pague com Pix</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Escaneie o QR Code ou use o copia-e-cola. A liberação é na hora.</p>
        {pix?.imagem && <img src={pix.imagem} alt="QR Code Pix" style={{ width: 220, height: 220, margin: '0 auto 16px', borderRadius: 'var(--radius-sm)', background: '#fff', padding: 8 }} />}
        <button onClick={() => copiar(pix?.copiaECola)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
          {copiado ? <><Check size={15} color="var(--accent)" /> Copiado!</> : <><Copy size={15} /> Copiar código Pix</>}
        </button>
        <p style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span className="spin" style={{ width: 13, height: 13, border: '2px solid var(--border2)', borderTopColor: 'var(--accent)', borderRadius: '50%', display: 'inline-block' }} />
          Aguardando o pagamento…
        </p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin .8s linear infinite}`}</style>
      </div>
    )
  }

  // ---------- Boleto ----------
  if (etapa === 'boleto') {
    return (
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, marginBottom: 6 }}>Boleto gerado</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Pague no seu banco. A confirmação leva 1–2 dias úteis.</p>
        {boleto?.linhaDigitavel && (
          <div style={{ padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--bg3)', fontSize: 13, wordBreak: 'break-all', marginBottom: 12 }}>{boleto.linhaDigitavel}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => copiar(boleto?.linhaDigitavel)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
            {copiado ? <><Check size={15} color="var(--accent)" /> Copiado!</> : <><Copy size={15} /> Copiar linha</>}
          </button>
          {boleto?.url && <a href={boleto.url} target="_blank" rel="noreferrer" className="btn-primary" style={{ textDecoration: 'none', padding: '11px 16px', fontSize: 13 }}>Abrir boleto</a>}
        </div>
      </div>
    )
  }

  // ---------- Formulário (dados) ----------
  const inputStyle = { width: '100%', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: 15 }

  return (
    <div>
      <Link to="/planos" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text2)', fontSize: 13, marginBottom: 16, textDecoration: 'none' }}>
        <ChevronLeft size={16} /> Planos
      </Link>

      {/* Resumo */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>HopeFin Família</p>
            <p style={{ fontSize: 12.5, color: 'var(--text2)' }}>Cobrança {ciclo === 'anual' ? 'anual' : 'mensal'}</p>
            {temLancamento && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent2)', fontWeight: 600, marginTop: 4 }}>
                <Sparkles size={11} /> preço de lançamento
              </span>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            {anualCartao ? (
              <>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20 }}>{parcelas}x {fmt(parcelaCartao / 100)}</p>
                <p style={{ fontSize: 11.5, color: 'var(--text3)' }}>total {fmt(centavos / 100)}/ano</p>
              </>
            ) : (
              <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20 }}>
                {fmt(centavos / 100)}<span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 400 }}>{ciclo === 'anual' ? '/ano' : '/mês'}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Método */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {METODOS.map(({ id, label, icon: Icon }) => {
          const ativo = metodo === id
          return (
            <button key={id} onClick={() => setMetodo(id)}
              style={{ flex: 1, padding: '12px 6px', borderRadius: 'var(--radius-sm)', border: `1.5px solid ${ativo ? 'var(--accent)' : 'var(--border2)'}`, background: ativo ? 'var(--accent-dim)' : 'transparent', color: ativo ? 'var(--accent)' : 'var(--text2)', fontSize: 12.5, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <Icon size={18} /> {label}
            </button>
          )
        })}
      </div>

      {/* Dados comuns */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        <input placeholder="Nome completo" value={form.nome} onChange={e => set('nome', e.target.value)} autoComplete="name" style={inputStyle} />
        <input placeholder="E-mail" type="email" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" style={inputStyle} />
        <input placeholder="CPF (só números)" inputMode="numeric" value={form.cpf} onChange={e => set('cpf', e.target.value.replace(/\D/g, ''))} style={inputStyle} />
        <input placeholder="WhatsApp com DDD" inputMode="numeric" value={form.telefone} onChange={e => set('telefone', e.target.value)} style={inputStyle} />
      </div>

      {/* Cartão */}
      {metodo === 'cartao' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          <input placeholder="Nome impresso no cartão" value={form.cartaoNome} onChange={e => set('cartaoNome', e.target.value)} style={inputStyle} />
          <input placeholder="Número do cartão" inputMode="numeric" value={form.numero} onChange={e => set('numero', e.target.value)} style={inputStyle} />
          <div style={{ display: 'flex', gap: 10 }}>
            <input placeholder="Validade MM/AA" value={form.validade} onChange={e => set('validade', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <input placeholder="CVV" inputMode="numeric" value={form.ccv} onChange={e => set('ccv', e.target.value.replace(/\D/g, ''))} style={{ ...inputStyle, flex: 1 }} />
          </div>
          {anualCartao && (
            <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.45 }}>
              12x de {fmt(parcelaCartao / 100)} no cartão (total de {fmt(centavos / 100)}). Daqui a um ano o plano renova no mesmo cartão — avisamos 7 dias antes e você cancela quando quiser.
            </p>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <input placeholder="CEP" inputMode="numeric" value={form.cep} onChange={e => set('cep', e.target.value.replace(/\D/g, ''))} style={{ ...inputStyle, flex: 1 }} />
            <input placeholder="Nº" inputMode="numeric" value={form.numeroEnd} onChange={e => set('numeroEnd', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          </div>
        </div>
      )}

      {erro && <p style={{ color: 'var(--red-text)', fontSize: 13, marginBottom: 12 }}>{erro}</p>}

      {/* Reforço de segurança */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '11px 13px', borderRadius: 'var(--radius-sm)', background: 'var(--bg2)', border: '1px solid var(--border)', marginBottom: 12 }}>
        <ShieldCheck size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 }}>
          <strong style={{ color: 'var(--text)' }}>Pagamento 100% seguro.</strong> Ambiente criptografado — seus dados de cartão vão direto pro processador e a gente não guarda nada.
        </p>
      </div>

      <button onClick={pagar} disabled={enviando}
        className="btn-primary" style={{ width: '100%', padding: '14px', opacity: enviando ? 0.6 : 1 }}>
        {enviando ? 'Processando…' : 'Assinar'}
      </button>

      {/* Selos */}
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text3)', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={12} /> Conexão segura (SSL)</span>
          <span>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Processado por
            <span className="selo-asaas" style={{ display: 'inline-flex' }} title="Asaas">
              <svg height="11" viewBox="0 0 100 17" fill="currentColor" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Asaas" style={{ display: 'block' }}>
                <path d="M67.0144 10.2322L71.1732 2.8531L75.291 10.2116C74.1232 9.6817 72.6687 9.41646 71.0912 9.41646C69.6159 9.41646 68.2023 9.68169 67.0144 10.2316M45.6871 10.2322L49.8459 2.8531L53.9638 10.2116C52.796 9.6817 51.3414 9.41646 49.764 9.41646C48.2887 9.41646 46.8751 9.68169 45.6871 10.2316M5.98205 10.2322L10.1409 2.69007L14.2997 10.2122C13.1319 9.68231 11.6566 9.41707 10.0791 9.41707C8.60379 9.41707 7.17003 9.6823 5.98144 10.2322M99.9988 12.067C99.9988 15.1653 97.1508 17 92.0498 17C88.4034 17 85.3096 16.3272 82.1339 14.3294L83.1788 12.4746C86.1497 14.3501 88.6901 15.0022 92.0296 15.0022C95.7378 15.0022 97.684 13.9218 97.684 12.0262C97.684 10.4975 96.2704 9.86542 93.4842 9.5801L88.5672 9.091C84.9819 8.74425 82.7081 7.37853 82.7081 4.87157C82.7081 1.89558 85.9247 0 91.0257 0C94.2014 0 96.721 0.61138 99.2412 2.18089L98.2171 4.11723C96.2092 2.79227 93.8535 2.07869 90.7597 2.07869C87.1542 2.07869 85.0235 3.21993 85.0235 4.79005C85.0235 6.27805 86.56 6.84867 88.7934 7.07314L93.8131 7.56225C97.8491 7.94976 100 9.397 100 12.067M81.3758 16.6332L72.2181 0.386904H70.1491L61.0115 16.6332H63.47L64.4739 14.7784C65.6417 12.6175 67.6698 11.4763 71.0912 11.4763C74.5127 11.4763 76.6637 12.5975 77.8522 14.799L78.8354 16.6338H81.3758V16.6332ZM60.0486 16.6332L50.8908 0.386904H48.8218L39.6843 16.6332H42.1428L43.1467 14.7784C44.3145 12.6175 46.3425 11.4763 49.764 11.4763C53.1854 11.4763 55.3364 12.5975 56.525 14.799L57.5081 16.6338H60.0486V16.6332ZM38.9873 12.067C38.9873 15.1653 36.1393 17 31.0383 17C27.3918 17 24.2981 16.3272 21.1224 14.3294L22.1673 12.4746C25.1382 14.3501 27.6786 15.0022 31.0181 15.0022C34.7263 15.0022 36.6725 13.9218 36.6725 12.0262C36.6725 10.4975 35.2589 9.86542 32.4727 9.5801L27.5557 9.091C23.9704 8.74425 21.6966 7.37853 21.6966 4.87157C21.6966 1.89558 24.9132 0 30.0142 0C33.1898 0 35.7095 0.61138 38.2297 2.18089L37.2056 4.11723C35.1977 2.79227 32.842 2.07869 29.7482 2.07869C26.1427 2.07869 24.012 3.21993 24.012 4.79005C24.012 6.27805 25.5484 6.84867 27.7819 7.07314L32.8016 7.56225C36.8375 7.94976 38.9885 9.397 38.9885 12.067M8.05167 2.30256L0 16.6326H2.45848L3.46243 14.7777C4.63023 12.6376 6.6381 11.4757 10.0797 11.4757C13.5214 11.4757 15.6729 12.6376 16.8407 14.7984L17.8239 16.6332H20.3643L11.8009 1.42655C11.3912 0.692898 10.8177 0.386904 9.87491 0.386904H2.97085L4.02493 1.45879C4.66691 2.09755 5.1707 2.30256 6.0652 2.30256H8.05167Z" />
              </svg>
            </span>
          </span>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <img src="/selos/pix.svg" alt="Pix" title="Pix" style={{ height: 18, display: 'block' }} />
          <Selo src="/selos/visa.svg" nome="Visa" />
          <Selo src="/selos/mastercard.svg" nome="Mastercard" />
          <Selo src="/selos/elo.svg" nome="Elo" />
          <span title="Boleto bancário" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 8px', borderRadius: 5, background: '#fff', color: '#1a1a1a' }}>
            <Barcode size={15} strokeWidth={2.2} />
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '-0.01em' }}>Boleto</span>
          </span>
        </div>
      </div>
    </div>
  )
}
