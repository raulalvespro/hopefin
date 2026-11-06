import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Check, Sparkles, Users, Infinity as InfinityIcon, LineChart, PiggyBank, Smartphone, ShieldCheck, Tag } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/format'
import { PRECOS_PADRAO, precosVigentes, economiaPct, porMesReais } from '../lib/precos'

const BENEFICIOS = [
  { icon: Users, texto: 'Família inclusa — até 6 pessoas, sem cobrar por usuário' },
  { icon: InfinityIcon, texto: 'Lançamentos, cartões e contas ilimitados' },
  { icon: LineChart, texto: 'Planejado × praticado e projeção dos próximos meses' },
  { icon: PiggyBank, texto: 'Cofrinhos, metas e orçamento por categoria' },
  { icon: Smartphone, texto: 'App instalável no celular (PWA), funciona offline' },
  { icon: ShieldCheck, texto: 'Seus dados são seus: exportação e exclusão a qualquer hora' },
]

const dataLanc = iso => {
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return '31/12/2026' }
}

export default function Planos() {
  const [cfg, setCfg] = useState(PRECOS_PADRAO)
  const [cupom, setCupom] = useState('')
  const [cupomMsg, setCupomMsg] = useState(null) // { ok, texto }
  const [resgatando, setResgatando] = useState(false)

  useEffect(() => {
    supabase.rpc('planos_publicos').then(({ data, error }) => {
      if (error) { console.error('[planos] planos_publicos:', error.message); return }
      if (data) setCfg(prev => ({ ...prev, ...data }))
    })
  }, [])

  const p = precosVigentes(cfg)

  async function resgatarCupom() {
    const codigo = cupom.trim()
    if (!codigo) return
    setResgatando(true); setCupomMsg(null)
    const { data, error } = await supabase.rpc('resgatar_cupom', { p_codigo: codigo })
    setResgatando(false)
    if (error) {
      const m = (error.message || '').toLowerCase()
      const texto = m.includes('ja_resgatou') ? 'Seu grupo já resgatou um cupom.'
        : m.includes('invalido') ? 'Cupom inválido, expirado ou esgotado.'
        : 'Não foi possível resgatar o cupom. Tente de novo.'
      setCupomMsg({ ok: false, texto }); return
    }
    setCupomMsg({ ok: true, texto: 'Cupom aplicado! Seu grupo está como cortesia — sem cobrança. 💚' })
    setCupom('')
  }

  return (
    <div>
      <Link to="/configuracoes" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text2)', fontSize: 13, marginBottom: 16, textDecoration: 'none' }}>
        <ChevronLeft size={16} /> Configurações
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Sparkles size={20} color="var(--accent)" />
        <h2 style={{ fontSize: 20 }}>HopeFin Família</h2>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.6 }}>
        Um preço para a casa toda. As finanças da família inteira em um lugar — sem cobrar por pessoa.
      </p>

      {/* Trial */}
      <div className="card" style={{ marginBottom: 16, background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🎁</span>
          <div>
            <p style={{ fontWeight: 700, fontFamily: 'Syne', fontSize: 14, color: 'var(--accent2)' }}>
              {p.trialDias} dias grátis, sem cartão
            </p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>Experimente tudo antes de decidir. Você só paga se quiser continuar.</p>
          </div>
        </div>
      </div>

      {/* Card anual — destaque */}
      <div className="card" style={{ marginBottom: 14, textAlign: 'center', borderColor: 'var(--accent)', position: 'relative', overflow: 'hidden' }}>
        {p.lancamentoAtivo && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 99, background: 'var(--accent-dim)', color: 'var(--accent2)', fontSize: 11.5, fontWeight: 700, marginBottom: 12 }}>
            <Sparkles size={13} /> Preço de lançamento até {dataLanc(p.lancamentoAte)}
          </div>
        )}
        <p style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 4 }}>Plano anual · pagamento à vista no Pix</p>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 2 }}>
          {p.lancamentoAtivo && (
            <span style={{ fontSize: 15, color: 'var(--text3)', textDecoration: 'line-through' }}>{fmt(p.anualPixNormal / 100)}</span>
          )}
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 34, color: 'var(--text)' }}>{fmt(p.anualPix / 100)}</span>
          <span style={{ fontSize: 15, color: 'var(--text2)' }}>/ano</span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--accent2)', fontWeight: 600, marginBottom: 2 }}>
          menos de {fmt(Math.ceil(porMesReais(p.anualPix) * 100) / 100)} por mês para a casa toda
        </p>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
          economize {economiaPct(p.anualPix, p.mensal)}% frente ao mensal
        </p>

        <div style={{ textAlign: 'left', marginBottom: 18 }}><ListaBeneficios /></div>

        <Link to="/checkout?ciclo=anual&metodo=pix" className="btn-primary"
          style={{ display: 'block', width: '100%', padding: '13px', textAlign: 'center', textDecoration: 'none', fontFamily: 'Syne', fontSize: 14, marginBottom: 10 }}>
          Assinar com Pix
        </Link>
        <Link to="/checkout?ciclo=anual&metodo=cartao"
          style={{ display: 'block', width: '100%', padding: '12px', textAlign: 'center', textDecoration: 'none', fontSize: 13.5, fontWeight: 600, color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)' }}>
          Pagar com cartão — 12x de {fmt(p.anualCartaoParcela / 100)}
        </Link>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
          No cartão o total é {fmt(p.anualCartao / 100)} — um pouco maior por causa das taxas do parcelamento.
        </p>
      </div>

      {/* Mensal — opção menor */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ textAlign: 'left' }}>
          <p style={{ fontWeight: 600, fontSize: 13.5 }}>Prefere mensal?</p>
          <p style={{ fontSize: 12, color: 'var(--text2)' }}>
            {fmt(p.mensal / 100)}/mês, no Pix ou cartão · sem fidelidade
          </p>
        </div>
        <Link to="/checkout?ciclo=mensal&metodo=pix"
          style={{ flexShrink: 0, padding: '10px 14px', textDecoration: 'none', fontSize: 13, fontWeight: 600, color: 'var(--accent2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)' }}>
          Assinar mensal
        </Link>
      </div>

      {/* Cupom */}
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>
          <Tag size={15} color="var(--accent)" /> Tenho um cupom
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={cupom}
            onChange={e => setCupom(e.target.value.toUpperCase())}
            placeholder="Código do cupom"
            style={{ flex: 1, padding: '11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, textTransform: 'uppercase' }}
          />
          <button onClick={resgatarCupom} disabled={resgatando || !cupom.trim()}
            className="btn-primary" style={{ padding: '11px 16px', fontSize: 13, opacity: resgatando || !cupom.trim() ? 0.6 : 1 }}>
            {resgatando ? '...' : 'Resgatar'}
          </button>
        </div>
        {cupomMsg && (
          <p style={{ fontSize: 12.5, marginTop: 8, color: cupomMsg.ok ? 'var(--accent2)' : 'var(--red)', lineHeight: 1.5 }}>
            {cupomMsg.texto}
          </p>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.6 }}>
        Preços em reais (BRL). Cancele quando quiser em Configurações — o acesso segue até o fim do período já pago.
        Teste sem cartão; depois do pagamento, você tem 7 dias de arrependimento (art. 49 do CDC).
      </p>
    </div>
  )
}

function ListaBeneficios() {
  return (
    <div style={{ marginBottom: 0 }}>
      {BENEFICIOS.map(({ icon: Icon, texto }) => (
        <div key={texto} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
            <Check size={13} color="var(--accent)" strokeWidth={3} />
          </span>
          <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{texto}</span>
        </div>
      ))}
    </div>
  )
}
