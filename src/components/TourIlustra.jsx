// Ilustrações do tour: mini-amostras de cada recurso, montadas com os componentes do próprio
// app (Tag, Meter, Money, ListItem) para a pessoa reconhecer a tela quando chegar nela.
// Todos os números são EXEMPLO (não são dados do grupo).
import { Mic, Wallet, CreditCard, FileText, PiggyBank, Share2, Repeat, ShoppingCart, Home } from 'lucide-react'
import { Tag, Meter, Money, ListItem } from './ui'

const cx = { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 300, padding: '0 8px', boxSizing: 'border-box' }
const bloco = { background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '4px 14px', boxShadow: 'var(--shadow-sm)' }

function Inicio() {
  return (
    <div style={cx}>
      <div style={{ background: 'var(--panel-ink)', color: '#fff', borderRadius: 'var(--radius-lg)', padding: 16 }}>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Saldo em caixa</p>
        <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 28, color: '#34d399' }}>R$ 1.240,00</p>
        <p style={{ fontSize: 12, color: '#e2e8f0' }}>projeção fim do mês R$ 2.100,00</p>
        <svg width="100%" height="34" viewBox="0 0 200 34" aria-hidden="true" style={{ marginTop: 8 }}>
          {[10, 16, 12, 22, 18, 28, 32].map((h, i) => <rect key={i} x={i * 28 + 4} y={34 - h} width="16" height={h} rx="5" fill="#10b981" opacity=".7" />)}
        </svg>
      </div>
      <div style={{ ...bloco, padding: '12px 14px' }}>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>O mês até agora</p>
        <Meter valor={62} />
        <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>Entrou R$ 8.000 de R$ 12.900</p>
      </div>
    </div>
  )
}

function Voz() {
  return (
    <div style={{ ...cx, alignItems: 'center', gap: 18 }}>
      <div style={{ position: 'relative', width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="hf-ring" aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--accent)' }} />
        <span style={{ position: 'relative', width: 80, height: 80, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mic size={34} color="var(--on-accent)" strokeWidth={2} />
        </span>
      </div>
      <span style={{ background: 'var(--bg2)', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', fontSize: 14, boxShadow: 'var(--shadow-sm)' }}>“mercado 87 no Nubank”</span>
      <Tag cor="vermelho">Gasto · R$ 87,00 · Mercado</Tag>
    </div>
  )
}

function GastosEntradas() {
  return (
    <div style={{ ...cx, ...bloco, padding: '2px 14px' }}>
      <ListItem icone={<ShoppingCart size={20} strokeWidth={1.75} />} titulo="Mercado" subtitulo="Ana · hoje" valor={<Money valor={87} tipo="gasto" />} />
      <ListItem icone={<Wallet size={20} strokeWidth={1.75} />} titulo="Salário" subtitulo="Pedro · dia 5" valor={<Money valor={4200} tipo="entrada" />} divisoria={false} />
    </div>
  )
}

function Cartoes() {
  return (
    <div style={cx}>
      <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e3a5f)', color: '#fff', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <CreditCard size={22} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 13 }}>Fatura atual</span>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20 }}>R$ 1.320,00</span>
        </div>
      </div>
      <div style={{ ...bloco, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}>
        <span style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}><Repeat size={16} /> Geladeira 3/12</span>
        <Tag cor="amber">vence dia 10</Tag>
      </div>
    </div>
  )
}

function Contas() {
  return (
    <div style={{ ...cx, ...bloco, padding: '2px 14px' }}>
      <ListItem icone={<Home size={20} strokeWidth={1.75} />} titulo="Aluguel" subtitulo="vence 10/11" valor={<Money valor={1800} />} tag={<Tag cor="amber">Em 3 dias</Tag>} />
      <ListItem icone={<FileText size={20} strokeWidth={1.75} />} titulo="Internet" subtitulo="Pago em 05/11" valor={<Money valor={112.5} />} tag={<Tag cor="verde">Pago</Tag>} divisoria={false} />
    </div>
  )
}

function Orcamento() {
  return (
    <div style={{ ...cx, ...bloco, padding: '14px' }}>
      {[['Mercado', 79, 'var(--accent)'], ['Lazer', 100, 'var(--red)']].map(([n, p, c]) => (
        <div key={n} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span>{n}</span><span style={{ color: 'var(--text2)' }}>{n === 'Lazer' ? '159%' : '79%'}</span></div>
          <Meter valor={p} cor={c} />
        </div>
      ))}
      <p style={{ fontSize: 12, color: 'var(--text2)' }}>Projeção: dezembro termina no azul</p>
    </div>
  )
}

function Cofrinhos() {
  return (
    <div style={{ ...cx, ...bloco, flexDirection: 'row', alignItems: 'center', gap: 16, padding: '14px' }}>
      <svg width="84" height="84" viewBox="0 0 92 92" aria-hidden="true">
        <circle cx="46" cy="46" r="40" fill="none" stroke="var(--bg3)" strokeWidth="10" />
        <circle className="hf-arc" cx="46" cy="46" r="40" fill="none" stroke="#8b5cf6" strokeWidth="10" strokeLinecap="round" transform="rotate(-90 46 46)" style={{ strokeDashoffset: 75 }} />
        <text x="46" y="52" textAnchor="middle" fontFamily="Syne, sans-serif" fontWeight="700" fontSize="18" fill="var(--text)">70%</text>
      </svg>
      <div><p style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}><PiggyBank size={14} /> Viagem</p><p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16 }}>R$ 2.100 de R$ 3.000</p></div>
    </div>
  )
}

function Fechamento() {
  return (
    <div style={cx}>
      <div style={{ background: 'var(--panel-ink)', color: '#fff', borderRadius: 'var(--radius-lg)', padding: 16 }}>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Novembro · Sua casa</p>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>Sobrou no mês</p>
        <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 30, color: '#34d399' }}>R$ 1.240</p>
        <p style={{ fontSize: 12, color: '#e2e8f0' }}>R$ 380 a mais que outubro</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}><Tag cor="verde"><Share2 size={13} /> Compartilhar resumo</Tag></div>
    </div>
  )
}

// Ordem = ordem dos passos em copy.tour.passos (o último, o convite, usa o componente real).
export const ILUSTRAS = [Inicio, Voz, GastosEntradas, Cartoes, Contas, Orcamento, Cofrinhos, Fechamento]
