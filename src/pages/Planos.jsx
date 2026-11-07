import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Check, Sparkles, Users, Infinity as InfinityIcon, LineChart, PiggyBank, Smartphone, ShieldCheck, Tag as TagIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/format'
import { PRECOS_PADRAO, precosVigentes, economiaPct, porMesReais } from '../lib/precos'
import { useAssinatura } from '../hooks/useAssinatura'
import { Tag } from '../components/ui'
import { copy } from '../copy/pt-BR'

const t = copy.planos

// Ícones na mesma ordem de copy.planos.beneficios.
const ICONES = [Users, InfinityIcon, LineChart, PiggyBank, Smartphone, ShieldCheck]

const dataLanc = iso => {
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return '31/12/2026' }
}

export default function Planos() {
  const [cfg, setCfg] = useState(PRECOS_PADRAO)
  const [plano, setPlano] = useState('anual') // 'anual' | 'mensal'
  const [cupom, setCupom] = useState('')
  const [cupomMsg, setCupomMsg] = useState(null) // { ok, texto }
  const [resgatando, setResgatando] = useState(false)
  const { emTrial, vencida, status, diasRestantes } = useAssinatura()

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
    const { error } = await supabase.rpc('resgatar_cupom', { p_codigo: codigo })
    setResgatando(false)
    if (error) {
      const m = (error.message || '').toLowerCase()
      const texto = m.includes('ja_resgatou') ? t.cupomJaResgatou
        : m.includes('invalido') ? t.cupomInvalido
        : t.cupomErro
      setCupomMsg({ ok: false, texto }); return
    }
    setCupomMsg({ ok: true, texto: t.cupomOk })
    setCupom('')
  }

  // Selo de situação do teste (dados reais da assinatura do grupo).
  const seloTeste = emTrial && diasRestantes != null
    ? <Tag cor="amber" style={{ alignSelf: 'flex-start' }}>{t.testeTermina(diasRestantes)}</Tag>
    : (vencida && status === 'trial') || status === 'expired'
      ? <Tag cor="vermelho" style={{ alignSelf: 'flex-start' }}>{t.testeAcabou}</Tag>
      : null

  const cartaoBtn = {
    display: 'block', width: '100%', padding: '12px', minHeight: 44, boxSizing: 'border-box', textAlign: 'center', textDecoration: 'none',
    fontSize: 14, fontWeight: 600, color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)',
  }
  const pixBtn = {
    display: 'block', width: '100%', padding: '13px', minHeight: 52, boxSizing: 'border-box', textAlign: 'center', textDecoration: 'none',
    fontFamily: 'Syne', fontSize: 15, letterSpacing: '.02em',
  }

  return (
    <div>
      <Link to="/configuracoes" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text2)', fontSize: 13, marginBottom: 16, textDecoration: 'none' }}>
        <ChevronLeft size={16} /> {t.voltar}
      </Link>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {seloTeste}
        <h2 style={{ fontSize: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={22} color="var(--accent)" /> {t.titulo}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>{t.subtitulo}</p>
      </div>

      {/* Trial */}
      <div className="card" style={{ marginBottom: 16, background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🎁</span>
          <div>
            <p style={{ fontWeight: 700, fontFamily: 'Syne', fontSize: 14, color: 'var(--accent-text)' }}>{t.trialTitulo(p.trialDias)}</p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>{t.trialTexto}</p>
          </div>
        </div>
      </div>

      {/* Escolha do plano */}
      <fieldset style={{ border: 'none', margin: '0 0 18px', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <legend style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>{t.escolhaPlano}</legend>

        <label htmlFor="plano-anual" className={plano === 'anual' ? 'hf-shine' : undefined}
          style={{ position: 'relative', display: 'flex', gap: 12, alignItems: 'flex-start', border: plano === 'anual' ? '2px solid var(--accent)' : '1px solid var(--border2)', borderRadius: 'var(--radius-lg)', padding: plano === 'anual' ? 15 : 16, backgroundColor: plano === 'anual' ? 'var(--accent-dim)' : 'transparent', cursor: 'pointer' }}>
          <input id="plano-anual" type="radio" name="plano" checked={plano === 'anual'} onChange={() => setPlano('anual')}
            style={{ marginTop: 4, width: 20, height: 20, accentColor: 'var(--accent)' }} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 17 }}>{t.anualNome}</span>
              {p.lancamentoAtivo && (
                <span style={{ fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--panel-ink)', color: '#ffffff' }}>
                  {t.seloLancamento(dataLanc(p.lancamentoAte))}
                </span>
              )}
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 26 }}>{fmt(p.anualPix / 100)}</span>
              <span style={{ fontSize: 14, color: 'var(--text2)' }}>{t.anualAo}</span>
              {p.lancamentoAtivo && (
                <span style={{ fontSize: 14, color: 'var(--text2)', textDecoration: 'line-through' }}>{fmt(p.anualPixNormal / 100)}</span>
              )}
            </span>
            <span style={{ fontSize: 13, color: 'var(--accent-text)', fontWeight: 500 }}>
              {t.anualEquivale(fmt(Math.ceil(porMesReais(p.anualPix) * 100) / 100))}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{t.anualEconomia(economiaPct(p.anualPix, p.mensal))}</span>
          </span>
        </label>

        <label htmlFor="plano-mensal"
          style={{ display: 'flex', gap: 12, alignItems: 'flex-start', border: plano === 'mensal' ? '2px solid var(--accent)' : '1px solid var(--border2)', borderRadius: 'var(--radius-lg)', padding: plano === 'mensal' ? 15 : 16, backgroundColor: plano === 'mensal' ? 'var(--accent-dim)' : 'transparent', cursor: 'pointer' }}>
          <input id="plano-mensal" type="radio" name="plano" checked={plano === 'mensal'} onChange={() => setPlano('mensal')}
            style={{ marginTop: 4, width: 20, height: 20, accentColor: 'var(--accent)' }} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 17 }}>{t.mensalNome}</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 22 }}>{fmt(p.mensal / 100)}</span>
              <span style={{ fontSize: 14, color: 'var(--text2)' }}>{t.mensalAo}</span>
            </span>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{t.mensalSub}</span>
          </span>
        </label>
      </fieldset>

      {/* Benefícios */}
      <ul style={{ margin: '0 0 20px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {t.beneficios.map((texto, i) => {
          const Icon = ICONES[i] || Check
          return (
            <li key={texto} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, lineHeight: 1.5 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 0 }}>
                <Icon size={13} color="var(--accent-text)" strokeWidth={2} aria-hidden="true" />
              </span>
              {texto}
            </li>
          )
        })}
      </ul>

      {/* Ações do plano escolhido */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {plano === 'anual' ? (
          <>
            <Link to="/checkout?ciclo=anual&metodo=pix" className="btn-primary" style={pixBtn}>{t.assinarPix}</Link>
            <Link to="/checkout?ciclo=anual&metodo=cartao" style={cartaoBtn}>{t.pagarCartao12x(fmt(p.anualCartaoParcela / 100))}</Link>
            <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, textAlign: 'center' }}>{t.notaCartaoAnual(fmt(p.anualCartao / 100))}</p>
          </>
        ) : (
          <>
            <Link to="/checkout?ciclo=mensal&metodo=pix" className="btn-primary" style={pixBtn}>{t.assinarMensal}</Link>
            <Link to="/checkout?ciclo=mensal&metodo=cartao" style={cartaoBtn}>{t.pagarCartao}</Link>
          </>
        )}
      </div>

      {/* Cupom */}
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>
          <TagIcon size={15} color="var(--accent)" /> {t.cupomTitulo}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={cupom}
            onChange={e => setCupom(e.target.value.toUpperCase())}
            placeholder={t.cupomPh}
            style={{ flex: 1, padding: '11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, textTransform: 'uppercase' }}
          />
          <button onClick={resgatarCupom} disabled={resgatando || !cupom.trim()}
            className="btn-primary" style={{ padding: '11px 16px', fontSize: 13, opacity: resgatando || !cupom.trim() ? 0.6 : 1 }}>
            {resgatando ? '...' : t.cupomResgatar}
          </button>
        </div>
        {cupomMsg && (
          <p style={{ fontSize: 12.5, marginTop: 8, color: cupomMsg.ok ? 'var(--accent-text)' : 'var(--red-text)', lineHeight: 1.5 }}>
            {cupomMsg.texto}
          </p>
        )}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.6 }}>{t.rodape}</p>
    </div>
  )
}
