// Busca enquanto digita + filtros (A3.1, 19/11/2026). Aparece só pra quem tem a chave de
// recurso "busca_filtros" (no começo, só o dono). Usado em Gastos, Parcelamentos e Assinaturas.
// A lógica (ignorar acento, pedaço da palavra, filtros) fica em src/lib/busca.js.
import { useState } from 'react'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import { copy } from '../copy/pt-BR'
import { qtdFiltros, temFiltro, filtroVazio, periodoAtalho } from '../lib/busca'
import { hojeISO } from '../lib/format'

const t = copy.busca

const estiloChip = (on) => ({
  padding: '6px 11px', minHeight: 32, borderRadius: 'var(--radius-pill)', fontSize: 12.5, fontWeight: 600,
  border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border2)'}`,
  background: on ? 'var(--accent-dim)' : 'transparent', color: on ? 'var(--accent-text)' : 'var(--text2)',
  textTransform: 'none', cursor: 'pointer',
})

function Grupo({ titulo, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 6px' }}>{titulo}</p>
      {children}
    </div>
  )
}

function Chips({ titulo, opcoes, marcados, onTroca }) {
  if (!opcoes?.length) return null
  return (
    <Grupo titulo={titulo}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {opcoes.map((o) => {
          const on = marcados.includes(o.valor)
          return (
            <button key={o.valor} type="button" aria-pressed={on} style={estiloChip(on)}
              onClick={() => onTroca(on ? marcados.filter((x) => x !== o.valor) : [...marcados, o.valor])}>
              {o.rotulo}
            </button>
          )
        })}
      </div>
    </Grupo>
  )
}

// opcoes: { categorias, origens, pessoas, tipos } — cada uma [{ valor, rotulo }]; periodo: mostra o filtro de datas.
export default function BuscaFiltros({ filtro, onChange, opcoes = {}, periodo = false, resumo, placeholder }) {
  const [aberto, setAberto] = useState(false)
  // A8.8: o que se mexe no painel de Filtros é um rascunho — só vale ao tocar em "Aplicar".
  // A busca por texto (fora do painel) continua valendo enquanto digita.
  const [rascunho, setRascunho] = useState(filtro)
  const n = qtdFiltros(filtro)
  const set = (k, v) => onChange({ ...filtro, [k]: v })
  const setR = (k, v) => setRascunho((r) => ({ ...r, [k]: v }))
  const atalho = (tipo) => setRascunho((r) => ({ ...r, ...periodoAtalho(tipo, hojeISO()) }))
  const abrirFechar = () => { if (!aberto) setRascunho(filtro); setAberto(!aberto) }
  const aplicar = () => { onChange({ ...rascunho, texto: filtro.texto }); setAberto(false) }
  const limparFiltros = () => { const vazio = { ...filtroVazio(), texto: filtro.texto }; setRascunho(vazio); onChange(vazio); setAberto(false) }
  const limparTudo = () => { setRascunho(filtroVazio()); onChange(filtroVazio()) }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} color="var(--text3)" aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input type="text" inputMode="search" enterKeyHint="search" value={filtro.texto} onChange={(e) => set('texto', e.target.value)} placeholder={placeholder || t.buscar}
            aria-label={placeholder || t.buscar} style={{ paddingLeft: 36, paddingRight: filtro.texto ? 36 : 12, marginBottom: 0 }} />
          {filtro.texto && (
            <button type="button" aria-label={t.limparBusca} onClick={() => set('texto', '')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', padding: 4, color: 'var(--text3)' }}>
              <X size={15} />
            </button>
          )}
        </div>
        <button type="button" aria-expanded={aberto} onClick={abrirFechar}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600,
            border: `1.5px solid ${n ? 'var(--accent)' : 'var(--border2)'}`, background: n ? 'var(--accent-dim)' : 'transparent', color: n ? 'var(--accent-text)' : 'var(--text2)' }}>
          <SlidersHorizontal size={15} aria-hidden="true" /> {t.filtros}{n ? ` (${n})` : ''}
        </button>
      </div>

      {aberto && (
        <div className="card" style={{ marginTop: 10, marginBottom: 0 }}>
          {periodo && (
            <Grupo titulo={t.periodo}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {[['mes', t.esteMes], ['3m', t.tresMeses], ['12m', t.dozeMeses]].map(([tipo, rotulo]) => {
                  const p = periodoAtalho(tipo, hojeISO())
                  const on = rascunho.de === p.de && rascunho.ate === p.ate
                  return <button key={tipo} type="button" aria-pressed={on} style={estiloChip(on)} onClick={() => atalho(tipo)}>{rotulo}</button>
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--text3)' }}>{t.de}
                  <input type="date" value={rascunho.de} onChange={(e) => setR('de', e.target.value)} style={{ marginTop: 4 }} />
                </label>
                <label style={{ fontSize: 11, color: 'var(--text3)' }}>{t.ate}
                  <input type="date" value={rascunho.ate} onChange={(e) => setR('ate', e.target.value)} style={{ marginTop: 4 }} />
                </label>
              </div>
            </Grupo>
          )}
          <Chips titulo={t.categoria} opcoes={opcoes.categorias} marcados={rascunho.categorias} onTroca={(v) => setR('categorias', v)} />
          <Chips titulo={t.origem} opcoes={opcoes.origens} marcados={rascunho.origens} onTroca={(v) => setR('origens', v)} />
          <Chips titulo={t.pessoa} opcoes={opcoes.pessoas} marcados={rascunho.pessoas} onTroca={(v) => setR('pessoas', v)} />
          <Chips titulo={t.tipo} opcoes={opcoes.tipos} marcados={rascunho.tipos} onTroca={(v) => setR('tipos', v)} />
          <Grupo titulo={t.valor}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="number" inputMode="decimal" min="0" value={rascunho.min} placeholder={t.min} aria-label={`${t.valor} ${t.min}`} onChange={(e) => setR('min', e.target.value)} />
              <input type="number" inputMode="decimal" min="0" value={rascunho.max} placeholder={t.max} aria-label={`${t.valor} ${t.max}`} onChange={(e) => setR('max', e.target.value)} />
            </div>
          </Grupo>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={limparFiltros}>{t.limparFiltros}</button>
            <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={aplicar}>{t.aplicar}</button>
          </div>
        </div>
      )}

      {temFiltro(filtro) && resumo && (
        <p role="status" style={{ fontSize: 13, margin: '10px 0 0', color: 'var(--text2)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span>{resumo}</span>
          <button type="button" onClick={limparTudo} style={{ fontSize: 13, color: 'var(--accent-text)', fontWeight: 600 }}>{t.limpar}</button>
        </p>
      )}
    </div>
  )
}
