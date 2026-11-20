// Busca enquanto digita + filtros (A3.1, 19/11/2026). Aparece só pra quem tem a chave de
// recurso "busca_filtros" (no começo, só o dono). Usado em Gastos, Parcelamentos e Assinaturas.
// A lógica (ignorar acento, pedaço da palavra, filtros) fica em src/lib/busca.js.
// A8.8 (v2, 19/11 noite): cada filtro é uma lista suspensa com caixinhas de marcar (antes eram
// todas as opções abertas em botões) e o período é uma escolha só.
import { useState } from 'react'
import { Search, X, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { copy } from '../copy/pt-BR'
import { qtdFiltros, temFiltro, filtroVazio, periodoAtalho } from '../lib/busca'
import { hojeISO } from '../lib/format'

const t = copy.busca
const ATALHOS = ['mes', '3m', '12m']

function Grupo({ titulo, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 6px' }}>{titulo}</p>
      {children}
    </div>
  )
}

// Lista suspensa com caixinhas: fechada mostra o que está marcado ("Todas", "Mercado, Farmácia",
// "3 marcadas"); aberta lista as opções pra marcar/desmarcar. Uma aberta por vez.
function ListaMarcar({ id, titulo, nenhum, opcoes, marcados, onTroca, aberta, onAbrir }) {
  if (!opcoes?.length) return null
  const rotulo = (v) => opcoes.find((o) => o.valor === v)?.rotulo
  const nomes = marcados.map(rotulo).filter(Boolean)
  const resumo = !marcados.length ? nenhum : marcados.length <= 2 ? nomes.join(', ') : t.marcadas(marcados.length)
  const trocar = (v) => onTroca(marcados.includes(v) ? marcados.filter((x) => x !== v) : [...marcados, v])
  const ativo = marcados.length > 0
  return (
    <div style={{ marginBottom: 10 }}>
      <button type="button" aria-expanded={aberta} aria-controls={`filtro-${id}`} onClick={onAbrir}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', minHeight: 46, borderRadius: 'var(--radius-sm)', textAlign: 'left',
          border: `1.5px solid ${ativo ? 'var(--accent)' : 'var(--border2)'}`, background: ativo ? 'var(--accent-dim)' : 'var(--bg2)', color: 'var(--text)' }}>
        <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{titulo}</span>
          <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: ativo ? 'var(--accent-text)' : 'var(--text)' }}>{resumo}</span>
        </span>
        <ChevronDown size={17} aria-hidden="true" color="var(--text2)" style={{ flexShrink: 0, transform: aberta ? 'rotate(180deg)' : 'none', transition: 'transform 150ms var(--ease, ease)' }} />
      </button>
      {aberta && (
        <div id={`filtro-${id}`} role="group" aria-label={titulo}
          style={{ marginTop: 6, maxHeight: 248, overflowY: 'auto', border: '1px solid var(--border2)', borderRadius: 'var(--radius-sm)', background: 'var(--bg2)', padding: '4px 6px' }}>
          {ativo && (
            <button type="button" onClick={() => onTroca([])} style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-text)', padding: '8px 6px' }}>{t.desmarcar}</button>
          )}
          {opcoes.map((o) => (
            <label key={o.valor} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', minHeight: 42, cursor: 'pointer', fontSize: 14, color: 'var(--text)', margin: 0 }}>
              <input type="checkbox" checked={marcados.includes(o.valor)} onChange={() => trocar(o.valor)} />
              <span style={{ minWidth: 0 }}>{o.rotulo}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// Qual opção do período está valendo no rascunho ('' = qualquer data).
function modoDoPeriodo(r) {
  if (!r.de && !r.ate) return ''
  const hoje = hojeISO()
  return ATALHOS.find((tipo) => { const p = periodoAtalho(tipo, hoje); return p.de === r.de && p.ate === r.ate }) || 'datas'
}

// opcoes: { categorias, origens, pessoas, tipos } — cada uma [{ valor, rotulo }]; periodo: mostra o filtro de datas.
export default function BuscaFiltros({ filtro, onChange, opcoes = {}, periodo = false, resumo, placeholder }) {
  const [aberto, setAberto] = useState(false)
  // A8.8: o que se mexe no painel de Filtros é um rascunho — só vale ao tocar em "Aplicar".
  // A busca por texto (fora do painel) continua valendo enquanto digita.
  const [rascunho, setRascunho] = useState(filtro)
  const [lista, setLista] = useState(null) // qual lista suspensa está aberta
  const [modo, setModo] = useState('')     // período: '' | mes | 3m | 12m | datas
  const n = qtdFiltros(filtro)
  const set = (k, v) => onChange({ ...filtro, [k]: v })
  const setR = (k, v) => setRascunho((r) => ({ ...r, [k]: v }))
  const abrirFechar = () => {
    if (!aberto) { setRascunho(filtro); setModo(modoDoPeriodo(filtro)); setLista(null) }
    setAberto(!aberto)
  }
  const aplicar = () => { onChange({ ...rascunho, texto: filtro.texto }); setAberto(false) }
  const limparFiltros = () => { const vazio = { ...filtroVazio(), texto: filtro.texto }; setRascunho(vazio); setModo(''); onChange(vazio); setAberto(false) }
  const limparTudo = () => { setRascunho(filtroVazio()); onChange(filtroVazio()) }
  const escolherPeriodo = (m) => {
    setModo(m)
    if (m === '') setRascunho((r) => ({ ...r, de: '', ate: '' }))
    else if (ATALHOS.includes(m)) setRascunho((r) => ({ ...r, ...periodoAtalho(m, hojeISO()) }))
  }
  const abrirLista = (id) => setLista((l) => (l === id ? null : id))
  const listas = [
    ['categorias', t.categoria, t.todas],
    ['origens', t.origem, t.todos],
    ['pessoas', t.pessoa, t.todas],
    ['tipos', t.tipo, t.todos],
  ]

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
              <select value={modo} onChange={(e) => escolherPeriodo(e.target.value)} aria-label={t.periodo} style={{ marginBottom: modo === 'datas' ? 8 : 0 }}>
                <option value="">{t.qualquerData}</option>
                <option value="mes">{t.esteMes}</option>
                <option value="3m">{t.tresMeses}</option>
                <option value="12m">{t.dozeMeses}</option>
                <option value="datas">{t.escolherDatas}</option>
              </select>
              {modo === 'datas' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label style={{ fontSize: 11, color: 'var(--text3)' }}>{t.de}
                    <input type="date" value={rascunho.de} onChange={(e) => setR('de', e.target.value)} style={{ marginTop: 4 }} />
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--text3)' }}>{t.ate}
                    <input type="date" value={rascunho.ate} onChange={(e) => setR('ate', e.target.value)} style={{ marginTop: 4 }} />
                  </label>
                </div>
              )}
            </Grupo>
          )}
          {listas.map(([k, titulo, nenhum]) => (
            <ListaMarcar key={k} id={k} titulo={titulo} nenhum={nenhum} opcoes={opcoes[k]} marcados={rascunho[k]}
              onTroca={(v) => setR(k, v)} aberta={lista === k} onAbrir={() => abrirLista(k)} />
          ))}
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
