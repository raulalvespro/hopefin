import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Check, Sparkles, Users, Infinity as InfinityIcon, LineChart, PiggyBank, Smartphone, ShieldCheck } from 'lucide-react'

// Preço do plano único "Família" (ver roadmap). Cobrança ainda não está ativa:
// o gateway de pagamento é uma dependência externa (conta + chaves).
const PRECO = {
  mensal: { valor: 'R$ 14,90', sufixo: '/mês', nota: 'cobrado mensalmente' },
  anual: { valor: 'R$ 119,90', sufixo: '/ano', nota: 'equivale a R$ 9,99/mês · economize 33%' },
}

const BENEFICIOS = [
  { icon: Users, texto: 'Família inclusa — convide quantas pessoas quiser' },
  { icon: InfinityIcon, texto: 'Lançamentos, cartões e contas ilimitados' },
  { icon: LineChart, texto: 'Planejado × praticado e projeção dos próximos meses' },
  { icon: PiggyBank, texto: 'Cofrinhos, metas e orçamento por categoria' },
  { icon: Smartphone, texto: 'App instalável no celular (PWA), funciona offline' },
  { icon: ShieldCheck, texto: 'Seus dados são seus: exportação e exclusão a qualquer hora' },
]

export default function Planos() {
  const [ciclo, setCiclo] = useState('anual')
  const preco = PRECO[ciclo]

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
        Um plano só, tudo incluído. As finanças da família inteira em um lugar.
      </p>

      {/* Beta: tudo liberado, sem cobrança */}
      <div className="card" style={{ marginBottom: 16, background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🎉</span>
          <div>
            <p style={{ fontWeight: 700, fontFamily: 'Syne', fontSize: 14, color: 'var(--accent2)' }}>Você está no período beta</p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>Tudo liberado, sem cobrança. Avisaremos com antecedência antes de qualquer mudança.</p>
          </div>
        </div>
      </div>

      {/* Seletor de ciclo */}
      <div style={{ display: 'flex', gap: 8, background: 'var(--bg3)', padding: 4, borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
        {[['mensal', 'Mensal'], ['anual', 'Anual']].map(([v, label]) => {
          const ativo = ciclo === v
          return (
            <button key={v} onClick={() => setCiclo(v)}
              style={{
                flex: 1, padding: '9px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
                background: ativo ? 'var(--bg2)' : 'transparent',
                color: ativo ? 'var(--text)' : 'var(--text2)',
                boxShadow: ativo ? 'var(--shadow-sm)' : 'none',
              }}>
              {label}{v === 'anual' && <span style={{ color: 'var(--accent)', marginLeft: 6, fontSize: 11 }}>-33%</span>}
            </button>
          )
        })}
      </div>

      {/* Card do plano */}
      <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 34, color: 'var(--text)' }}>{preco.valor}</span>
          <span style={{ fontSize: 15, color: 'var(--text2)' }}>{preco.sufixo}</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>{preco.nota}</p>

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

        <button
          disabled
          title="Pagamentos chegam em breve"
          style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-sm)', background: 'var(--bg3)', color: 'var(--text3)', fontWeight: 700, fontFamily: 'Syne', fontSize: 14, cursor: 'not-allowed' }}
        >
          Assinatura em breve
        </button>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
          Quando ativarmos, você terá <strong>14 dias grátis</strong> e sem precisar de cartão.
        </p>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.6 }}>
        Preços em reais (BRL). O plano Família cobre todas as pessoas do seu grupo —
        não cobramos por usuário.
      </p>
    </div>
  )
}
