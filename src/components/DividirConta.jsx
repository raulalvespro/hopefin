// Dividir uma conta com outras pessoas (A8.6). Escolhe as pessoas (com o aviso de nome parecido
// do A8.5), põe quanto é de cada uma no TOTAL e mostra a sua parte. Parcelado: cada parcela é
// dividida na mesma proporção, a partir da parcela escolhida.
import EscolherPessoa from './EscolherPessoa'
import { fmt } from '../lib/format'
import { partesIguais, resumoPartes } from '../lib/dividir'
import { copy } from '../copy/pt-BR'

const t = copy.dividir

export default function DividirConta({ total, partes, onChange, pessoas, onCriar, parcelado = false, numParcelas = 0, aPartirDe = 1, onAPartirDe }) {
  const nomes = partes.map((p) => p.nome)
  const alternar = (nome) => {
    const n = String(nome || '').trim()
    if (!n) return
    const existe = partes.find((p) => p.nome.toLowerCase() === n.toLowerCase())
    onChange(existe ? partes.filter((p) => p !== existe) : [...partes, { nome: n, valor: '' }])
  }
  const iguais = () => {
    const v = partesIguais(total, partes.length)
    onChange(partes.map((p, i) => ({ ...p, valor: v[i] != null ? v[i].toFixed(2) : p.valor })))
  }
  const { minha, excede } = resumoPartes(total, partes)

  return (
    <div style={{ marginTop: 10 }}>
      <EscolherPessoa pessoas={pessoas} marcados={nomes} valor="" titulo={t.comQuem} onCriar={onCriar} onEscolher={alternar} />
      {partes.map((p, i) => (
        <div key={p.nome} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.parteDe(p.nome)}</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={p.valor} placeholder="0,00" aria-label={t.parteDe(p.nome)}
            onChange={(e) => onChange(partes.map((x, k) => (k === i ? { ...x, valor: e.target.value } : x)))}
            style={{ width: 120, marginBottom: 0 }} />
        </div>
      ))}
      {partes.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={iguais} disabled={!(total > 0)}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-text)', padding: '6px 0' }}>{t.iguais(partes.length + 1)}</button>
          <span style={{ fontSize: 13, color: excede ? 'var(--red-text)' : 'var(--text2)' }}>
            {excede ? t.passou : t.suaParte(fmt(Math.max(0, minha)))}
          </span>
        </div>
      )}
      {parcelado && partes.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.45 }}>{t.parceladoExplica}</p>
          {numParcelas > 1 && onAPartirDe && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text2)', marginTop: 6 }}>
              {t.aPartirDe}
              <input type="number" inputMode="numeric" min="1" max={numParcelas} value={aPartirDe}
                onChange={(e) => onAPartirDe(Math.min(numParcelas, Math.max(1, parseInt(e.target.value) || 1)))}
                style={{ width: 80, marginBottom: 0 }} />
              {t.deN(numParcelas)}
            </label>
          )}
        </div>
      )}
      <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 6, lineHeight: 1.45 }}>{t.explica}</p>
    </div>
  )
}
