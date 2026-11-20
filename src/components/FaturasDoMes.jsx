import { CreditCard, ChevronRight } from 'lucide-react'
import { copy } from '../copy/pt-BR'
import { fmt, fmtData } from '../lib/format'

const t = copy.faturasMes
// Cor do texto de cada situação (as cores "de texto" do tokens.json: legíveis nos 2 temas)
const COR = { paga: 'var(--accent-text)', aberta: 'var(--blue-text)', fechada: 'var(--amber-text)', atrasada: 'var(--red-text)' }
const ddmm = (iso) => fmtData(iso, 'dd/MM')
const soma = (l) => Math.round(l.reduce((s, f) => s + (Number(f.total) || 0), 0) * 100) / 100

// "Onde vejo a fatura que pago este mês?" (P17): as faturas que VENCEM no mês, uma por cartão,
// com o valor e a situação. Só mostra o que o motor já calcula (faturaDoCartao) — sem regra nova.
// `faturas`: saída de faturaDoCartao (ou r.faturas do resumoMes). `onAbrir(f)`: abre a fatura.
export default function FaturasDoMes({ faturas, nomeMes, hoje, onAbrir, style }) {
  const lista = (faturas || [])
    .filter((f) => Number(f.total) > 0.004)
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)) || String(a.cartaoNome).localeCompare(String(b.cartaoNome)))
  if (!lista.length) return null
  const abertas = lista.filter((f) => !f.paga)

  return (
    <section className="card" aria-label={t.titulo(nomeMes)} style={{ marginBottom: 12, ...style }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontFamily: 'Syne', fontSize: 15 }}>
        <CreditCard size={18} color="var(--accent)" style={{ flexShrink: 0 }} /> {t.titulo(nomeMes)}
      </p>
      <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, marginTop: 6, color: abertas.length ? 'var(--text)' : 'var(--accent-text)' }}>
        {abertas.length ? t.aPagar(fmt(soma(abertas))) : t.tudoPago}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '2px 0 4px' }}>{t.sub}</p>
      {lista.map((f) => {
        const passou = hoje && f.vencimento < hoje
        const situacao = f.status === 'aberta' ? t.status.aberta(ddmm(f.fechamento)) : t.status[f.status]
        return (
          <button key={`${f.cartaoId}-${f.comp}`} type="button" onClick={() => onAbrir?.(f)} aria-label={t.abrir(f.cartaoNome)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', minHeight: 44, borderTop: '1px solid var(--border)', textAlign: 'left', color: 'var(--text)' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.cartaoNome}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)' }}>
                {passou ? t.venceu(ddmm(f.vencimento)) : t.vence(ddmm(f.vencimento))} · <span style={{ color: COR[f.status] || 'var(--text2)', fontWeight: 500 }}>{situacao}</span>
              </span>
            </span>
            <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', textDecoration: f.paga ? 'line-through' : 'none', color: f.paga ? 'var(--text2)' : 'var(--text)' }}>{fmt(f.total)}</span>
            <ChevronRight size={16} color="var(--text3)" style={{ flexShrink: 0 }} />
          </button>
        )
      })}
    </section>
  )
}
