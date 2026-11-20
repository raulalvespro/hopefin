// "Foi de outra pessoa" (A3.3, 19/11/2026): as pessoas mais usadas em botões (um toque) e
// "Nova pessoa" ali mesmo — já fica cadastrada e escolhida.
import { useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { copy } from '../copy/pt-BR'
import { pessoasParecidas } from '../lib/pessoas'

const t = copy.pessoas

const estiloChip = (marcado) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', minHeight: 36,
  borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  border: `1.5px solid ${marcado ? 'var(--accent)' : 'var(--border2)'}`,
  background: marcado ? 'var(--accent-dim)' : 'transparent',
  color: marcado ? 'var(--accent-text)' : 'var(--text2)',
})

// `marcados` (opcional): várias pessoas marcadas (dividir conta, A8.6). `titulo` troca o "Quem?".
export default function EscolherPessoa({ pessoas, valor, onEscolher, onCriar, marcados = null, titulo = null }) {
  const [nova, setNova] = useState(false)
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmouOutra, setConfirmouOutra] = useState(false)
  const atual = String(valor || '').trim().toLowerCase()
  // A8.5: nome parecido com alguém que já existe (Jak × Jack) → pergunta antes de criar outra pessoa
  const parecidas = nova ? pessoasParecidas(nome, pessoas) : []

  async function adicionar() {
    const n = nome.trim()
    if (!n) return
    if (parecidas.length && !confirmouOutra) { setConfirmouOutra(true); return }
    setSalvando(true); setErro('')
    const id = await onCriar(n)
    setSalvando(false)
    if (!id) { setErro(t.erroSalvar); return }
    onEscolher(n); setNome(''); setNova(false); setConfirmouOutra(false)
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 8px' }}>{titulo || t.quem}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {pessoas.map((p) => {
          const marcado = marcados ? marcados.some((n) => n.toLowerCase() === p.nome.toLowerCase()) : p.nome.toLowerCase() === atual
          return (
            <button key={p.id} type="button" aria-pressed={marcado} onClick={() => onEscolher(marcado && !marcados ? '' : p.nome)} style={estiloChip(marcado)}>
              {marcado && <Check size={13} aria-hidden="true" />}{p.nome}
            </button>
          )
        })}
        <button type="button" aria-expanded={nova} onClick={() => { setNova((v) => !v); setErro('') }} style={estiloChip(false)}>
          <Plus size={13} aria-hidden="true" />{t.nova}
        </button>
      </div>
      {nova && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input autoFocus value={nome} maxLength={60} placeholder={t.phNova} aria-label={t.nova}
            onChange={(e) => { setNome(e.target.value); setConfirmouOutra(false) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }} />
          <button type="button" className="btn-primary" disabled={salvando || !nome.trim()} onClick={adicionar}
            style={{ padding: '0 16px', whiteSpace: 'nowrap', opacity: salvando || !nome.trim() ? 0.6 : 1 }}>
            {salvando ? '…' : t.adicionar}
          </button>
        </div>
      )}
      {nova && parecidas.length > 0 && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 'var(--radius-sm)', background: 'var(--amber-dim)', border: '1px solid var(--amber)', fontSize: 12.5, lineHeight: 1.4 }}>
          {t.parecida(parecidas.map((p) => p.nome).join(', '))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {parecidas.slice(0, 3).map((p) => (
              <button key={p.id} type="button" style={estiloChip(true)} onClick={() => { onEscolher(p.nome); setNome(''); setNova(false); setConfirmouOutra(false) }}>{t.usar(p.nome)}</button>
            ))}
            {confirmouOutra && <span style={{ alignSelf: 'center', color: 'var(--text2)' }}>{t.outra}? Toque em {t.adicionar} de novo.</span>}
          </div>
        </div>
      )}
      {erro && <p style={{ color: 'var(--red-text)', fontSize: 12, margin: '6px 0 0' }}>{erro}</p>}
    </div>
  )
}
