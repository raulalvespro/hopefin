import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { ChevronLeft, Copy, Check, QrCode, Barcode, CreditCard, ShieldCheck, Crown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmt } from '../lib/format'

const METODOS = [
  { id: 'pix', label: 'Pix', icon: QrCode },
  { id: 'cartao', label: 'Cartão', icon: CreditCard },
  { id: 'boleto', label: 'Boleto', icon: Barcode },
]

export default function Checkout() {
  const { perfil } = useAuth()
  const [params] = useSearchParams()
  const ciclo = params.get('ciclo') === 'mensal' ? 'mensal' : 'anual'

  const [planos, setPlanos] = useState(null)
  const [metodo, setMetodo] = useState('pix')
  const [form, setForm] = useState({ cpf: '', telefone: '', cartaoNome: '', numero: '', validade: '', ccv: '', cep: '', numeroEnd: '' })
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [etapa, setEtapa] = useState('dados') // dados | pix | boleto | sucesso
  const [pix, setPix] = useState(null)
  const [boleto, setBoleto] = useState(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => { supabase.rpc('planos_publicos').then(({ data }) => data && setPlanos(data)) }, [])
  useEffect(() => { if (perfil?.telefone) setForm(f => ({ ...f, telefone: perfil.telefone })) }, [perfil])

  // Confirmação em tempo real: o webhook ativa a assinatura; aqui só observamos.
  useEffect(() => {
    if (etapa !== 'pix' && etapa !== 'boleto') return
    const id = setInterval(async () => {
      const { data } = await supabase.from('subscriptions').select('status').maybeSingle()
      if (data?.status === 'active') { clearInterval(id); setEtapa('sucesso') }
    }, 4000)
    return () => clearInterval(id)
  }, [etapa])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const temVaga = (planos?.fundador_vagas ?? 0) > 0
  const centavos = !planos ? null : ciclo === 'anual'
    ? (temVaga ? planos.fundador_anual_centavos : planos.familia_anual_centavos)
    : (temVaga ? planos.fundador_mensal_centavos : planos.familia_mensal_centavos)

  async function pagar() {
    setErro('')
    const cpf = form.cpf.replace(/\D/g, '')
    if (cpf.length < 11) { setErro('Informe um CPF válido.'); return }
    if ((form.telefone || '').replace(/\D/g, '').length < 10) { setErro('Informe um WhatsApp com DDD.'); return }
    const body = { ciclo, metodo, cpfCnpj: cpf, telefone: form.telefone, nome: perfil?.nome }
    if (metodo === 'cartao') {
      if (!form.numero || !form.validade || !form.ccv || !form.cartaoNome) { setErro('Preencha os dados do cartão.'); return }
      const [mes, ano] = form.validade.split('/')
      const anoFull = (ano || '').trim().length === 2 ? `20${ano.trim()}` : (ano || '').trim()
      body.cartao = { holderName: form.cartaoNome, number: form.numero, expiryMonth: (mes || '').trim(), expiryYear: anoFull, ccv: form.ccv }
      body.titular = { cep: form.cep, numero: form.numeroEnd }
    }
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('asaas-assinar', { body })
    setEnviando(false)
    if (error || data?.error) { setErro(data?.error || 'Não foi possível processar o pagamento. Tente de novo.'); return }
    if (data.metodo === 'pix') { setPix(data.pix); setEtapa('pix') }
    else if (data.metodo === 'boleto') { setBoleto(data.boleto); setEtapa('boleto') }
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>HopeFin Família</p>
            <p style={{ fontSize: 12.5, color: 'var(--text2)' }}>Cobrança {ciclo === 'anual' ? 'anual' : 'mensal'}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20 }}>{centavos != null ? fmt(centavos / 100) : '—'}</p>
            {temVaga && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent2)', fontWeight: 600 }}><Crown size={11} /> preço de fundador</span>}
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
          <div style={{ display: 'flex', gap: 10 }}>
            <input placeholder="CEP" inputMode="numeric" value={form.cep} onChange={e => set('cep', e.target.value.replace(/\D/g, ''))} style={{ ...inputStyle, flex: 1 }} />
            <input placeholder="Nº" inputMode="numeric" value={form.numeroEnd} onChange={e => set('numeroEnd', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          </div>
        </div>
      )}

      {erro && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{erro}</p>}

      <button onClick={pagar} disabled={enviando}
        className="btn-primary" style={{ width: '100%', padding: '14px', opacity: enviando ? 0.6 : 1 }}>
        {enviando ? 'Processando…' : centavos != null ? `Pagar ${fmt(centavos / 100)}` : 'Pagar'}
      </button>

      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.5 }}>
        <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Pagamento processado pelo Asaas. Seu CPF e os dados do cartão vão direto pra ele — a gente não guarda nada disso.
      </p>
    </div>
  )
}
