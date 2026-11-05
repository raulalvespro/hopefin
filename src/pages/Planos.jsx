import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Check, Sparkles, Users, Infinity as InfinityIcon, LineChart, PiggyBank, Smartphone, ShieldCheck, Crown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/format'

// Preços padrão (fallback caso a RPC planos_publicos() não responda).
// A fonte da verdade é a tabela planos_config no banco.
const PADRAO = {
  familia_mensal_centavos: 1990,
  familia_anual_centavos: 14990,
  fundador_mensal_centavos: 1490,
  fundador_anual_centavos: 11990,
  fundador_limite: 100,
  fundador_usados: 0,
  fundador_vagas: 100,
  trial_dias: 14,
}

const BENEFICIOS = [
  { icon: Users, texto: 'Família inclusa — convide quem divide as contas com você' },
  { icon: InfinityIcon, texto: 'Lançamentos, cartões e contas ilimitados' },
  { icon: LineChart, texto: 'Planejado × praticado e projeção dos próximos meses' },
  { icon: PiggyBank, texto: 'Cofrinhos, metas e orçamento por categoria' },
  { icon: Smartphone, texto: 'App instalável no celular (PWA), funciona offline' },
  { icon: ShieldCheck, texto: 'Seus dados são seus: exportação e exclusão a qualquer hora' },
]

// Equivalente mensal de um preço anual + % de economia frente ao mensal.
const porMes = anualCentavos => fmt(anualCentavos / 12 / 100)
const economiaPct = (mensal, anual) => Math.round((1 - anual / (mensal * 12)) * 100)

export default function Planos() {
  const [ciclo, setCiclo] = useState('anual')
  const [p, setP] = useState(PADRAO)

  useEffect(() => {
    supabase.rpc('planos_publicos').then(({ data, error }) => {
      if (error) { console.error('[planos] planos_publicos:', error.message); return }
      if (data) setP(prev => ({ ...prev, ...data }))
    })
  }, [])

  const anual = ciclo === 'anual'
  const familiaCentavos = anual ? p.familia_anual_centavos : p.familia_mensal_centavos
  const fundadorCentavos = anual ? p.fundador_anual_centavos : p.fundador_mensal_centavos
  const sufixo = anual ? '/ano' : '/mês'
  const temVaga = (p.fundador_vagas ?? 0) > 0

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
        Um preço para a casa toda. As finanças da família inteira em um lugar —
        sem cobrar por pessoa.
      </p>

      {/* Trial */}
      <div className="card" style={{ marginBottom: 16, background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🎁</span>
          <div>
            <p style={{ fontWeight: 700, fontFamily: 'Syne', fontSize: 14, color: 'var(--accent2)' }}>
              {p.trial_dias} dias grátis, sem cartão
            </p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>Experimente tudo antes de decidir. Você só paga se quiser continuar.</p>
          </div>
        </div>
      </div>

      {/* Seletor de ciclo */}
      <div style={{ display: 'flex', gap: 8, background: 'var(--bg3)', padding: 4, borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
        {[['mensal', 'Mensal'], ['anual', 'Anual']].map(([v, label]) => {
          const ativo = ciclo === v
          const pct = economiaPct(p.familia_mensal_centavos, p.familia_anual_centavos)
          return (
            <button key={v} onClick={() => setCiclo(v)}
              style={{
                flex: 1, padding: '9px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
                background: ativo ? 'var(--bg2)' : 'transparent',
                color: ativo ? 'var(--text)' : 'var(--text2)',
                boxShadow: ativo ? 'var(--shadow-sm)' : 'none',
              }}>
              {label}{v === 'anual' && <span style={{ color: 'var(--accent)', marginLeft: 6, fontSize: 11 }}>-{pct}%</span>}
            </button>
          )
        })}
      </div>

      {/* Card: preço de fundador (enquanto houver vaga) */}
      {temVaga && (
        <div className="card" style={{ marginBottom: 16, textAlign: 'center', borderColor: 'var(--accent)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 99, background: 'var(--accent-dim)', color: 'var(--accent2)', fontSize: 11.5, fontWeight: 700, marginBottom: 12 }}>
            <Crown size={13} /> Preço de fundador
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginBottom: 2 }}>
            <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 34, color: 'var(--text)' }}>{fmt(fundadorCentavos / 100)}</span>
            <span style={{ fontSize: 15, color: 'var(--text2)' }}>{sufixo}</span>
          </div>
          {anual && (
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>equivale a {porMes(p.fundador_anual_centavos)}/mês</p>
          )}
          <p style={{ fontSize: 12.5, color: 'var(--accent2)', fontWeight: 600, marginBottom: 18 }}>
            Faltam {p.fundador_vagas} de {p.fundador_limite} vagas
          </p>
          <ListaBeneficios />
          <AcaoAssinar ciclo={ciclo} />
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
            Para os <strong>{p.fundador_limite} primeiros que assinarem</strong>. O preço fica travado
            enquanto a assinatura seguir ativa.
          </p>
        </div>
      )}

      {/* Card: preço normal (Família) */}
      <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
        {temVaga && (
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>Preço normal, depois das vagas de fundador</p>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginBottom: 2 }}>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: temVaga ? 26 : 34, color: 'var(--text)' }}>{fmt(familiaCentavos / 100)}</span>
          <span style={{ fontSize: 15, color: 'var(--text2)' }}>{sufixo}</span>
        </div>
        {anual && (
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: temVaga ? 0 : 18 }}>
            equivale a {porMes(p.familia_anual_centavos)}/mês · economize {economiaPct(p.familia_mensal_centavos, p.familia_anual_centavos)}%
          </p>
        )}
        {!temVaga && (
          <>
            <div style={{ marginTop: 18 }}><ListaBeneficios /></div>
            <AcaoAssinar ciclo={ciclo} />
          </>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.6 }}>
        Preços em reais (BRL). O plano Família cobre todas as pessoas do seu grupo —
        não cobramos por usuário.
      </p>
    </div>
  )
}

function ListaBeneficios() {
  return (
    <div style={{ textAlign: 'left', marginBottom: 20 }}>
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

// Leva para o nosso checkout próprio (/checkout), onde a pessoa escolhe
// Pix/boleto/cartão e paga sem sair do app.
function AcaoAssinar({ ciclo }) {
  return (
    <Link to={`/checkout?ciclo=${ciclo}`} className="btn-primary"
      style={{ display: 'block', width: '100%', padding: '13px', textAlign: 'center', textDecoration: 'none', fontFamily: 'Syne', fontSize: 14 }}>
      Assinar
    </Link>
  )
}
