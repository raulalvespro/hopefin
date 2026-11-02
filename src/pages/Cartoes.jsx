import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Pencil, X } from 'lucide-react'
import { addMonths, subMonths, getDaysInMonth, format } from 'date-fns'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { useCategorias } from '../hooks/useCategorias'
import { fmt, fmtData, parseDataLocal } from '../lib/format'

const bandeiras = { Visa: '💙', Mastercard: '🔴', Elo: '🟡', Amex: '🟢', Hipercard: '🔵' }
const novoForm = () => ({ nome: '', bandeira: 'Visa', dia_fechamento: '', dia_vencimento: '', limite: '', alerta_dias: 3 })

// Calcula fatura atual e próxima de um cartão a partir de gastos, parcelas e assinaturas
function calcularFaturas(card, gastos, parcelas, assinaturas, hoje) {
  const diaF = card.dia_fechamento || 1
  const diaV = card.dia_vencimento || 10
  const clampDay = (y, m, d) => Math.min(d, getDaysInMonth(new Date(y, m, 1)))
  const fechamento = ref => { const y = ref.getFullYear(), m = ref.getMonth(); return new Date(y, m, clampDay(y, m, diaF)) }

  let fechaAtual = fechamento(hoje)
  let abreAtual
  if (hoje <= fechaAtual) { abreAtual = fechamento(subMonths(hoje, 1)) }
  else { abreAtual = fechaAtual; fechaAtual = fechamento(addMonths(hoje, 1)) }

  const vencDe = fecha => {
    const y = fecha.getFullYear(), m = fecha.getMonth()
    let v = new Date(y, m, clampDay(y, m, diaV))
    if (diaV <= diaF) v = addMonths(v, 1)
    return v
  }
  const abreProx = fechaAtual
  const fechaProx = fechamento(addMonths(fechaAtual, 1))
  const vencAtual = vencDe(fechaAtual)
  const vencProx = vencDe(fechaProx)

  const inCycle = (d, abre, fecha) => d > abre && d <= fecha
  const sameMonth = (d, ref) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  // Itens (gastos + parcelas) que compõem a fatura de um ciclo.
  const itensDe = (abre, fecha, venc) => {
    const gs = gastos
      .filter(g => g.cartao_id === card.id && inCycle(parseDataLocal(g.data), abre, fecha))
      .map(g => ({ tipo: 'gasto', descricao: g.descricao, categoria: g.categoria, valor: Number(g.valor), data: g.data }))
    const ps = parcelas
      .filter(p => p.cartao_id === card.id && sameMonth(parseDataLocal(p.data_vencimento), venc))
      .map(p => ({ tipo: 'parcela', descricao: p.descricao, valor: Number(p.valor), data: p.data_vencimento, numero: p.numero, total: p.total }))
    return [...gs, ...ps].sort((a, b) => b.data.localeCompare(a.data))
  }
  // Assinaturas vinculadas ao cartão: cobrança mensal recorrente, entra em todo ciclo.
  const assinItens = assinaturas
    .filter(a => a.cartao_id === card.id)
    .map(a => ({ tipo: 'assinatura', descricao: a.nome, valor: Number(a.valor), diaCobranca: a.dia_cobranca, recorrente: true }))
  const atualItens = [...assinItens, ...itensDe(abreAtual, fechaAtual, vencAtual)]
  const proxItens = [...assinItens, ...itensDe(abreProx, fechaProx, vencProx)]
  const soma = arr => arr.reduce((s, x) => s + x.valor, 0)

  return {
    atual: soma(atualItens), atualItens, vencAtual,
    prox: soma(proxItens), proxItens, vencProx,
  }
}

export default function Cartoes() {
  const { perfil } = useAuth()
  const run = useDb()
  const { toast } = useToast()
  const { emojiDe } = useCategorias()
  const [detalhe, setDetalhe] = useState(null)   // { card, f }
  const [cartoes, setCartoes] = useState([])
  const [gastos, setGastos] = useState([])
  const [parcelas, setParcelas] = useState([])
  const [assinaturas, setAssinaturas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(novoForm())
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    setLoading(true)
    const gid = perfil.grupo_id
    const [{ data: cs }, { data: gs }, { data: ps }, { data: as }] = await Promise.all([
      supabase.from('cartoes').select('*').eq('grupo_id', gid).order('nome'),
      supabase.from('gastos').select('valor, data, cartao_id, descricao, categoria').eq('grupo_id', gid).not('cartao_id', 'is', null),
      supabase.from('parcelas').select('valor, data_vencimento, numero, parcelamentos!inner(cartao_id, descricao, num_parcelas)').eq('grupo_id', gid).eq('paga', false),
      supabase.from('assinaturas').select('nome, valor, dia_cobranca, cartao_id').eq('grupo_id', gid).eq('ativo', true).not('cartao_id', 'is', null),
    ])
    setCartoes(cs || [])
    setGastos(gs || [])
    setAssinaturas(as || [])
    setParcelas((ps || []).map(p => ({ valor: p.valor, data_vencimento: p.data_vencimento, cartao_id: p.parcelamentos?.cartao_id, descricao: p.parcelamentos?.descricao, numero: p.numero, total: p.parcelamentos?.num_parcelas })))
    setLoading(false)
  }

  function abrirNovo() {
    setEditando(null); setForm(novoForm()); setModal(true)
  }

  function editar(c) {
    setEditando(c.id)
    setForm({
      nome: c.nome, bandeira: c.bandeira || 'Visa',
      dia_fechamento: String(c.dia_fechamento ?? ''), dia_vencimento: String(c.dia_vencimento ?? ''),
      limite: c.limite != null ? String(c.limite) : '', alerta_dias: c.alerta_dias ?? 3,
    })
    setModal(true)
  }

  function fecharModal() {
    setModal(false); setEditando(null); setForm(novoForm())
  }

  async function salvar() {
    if (!form.nome || !form.dia_fechamento || !form.dia_vencimento) { toast('Preencha nome, fechamento e vencimento.', 'erro'); return }
    const payload = {
      nome: form.nome, bandeira: form.bandeira,
      dia_fechamento: parseInt(form.dia_fechamento), dia_vencimento: parseInt(form.dia_vencimento),
      limite: form.limite ? parseFloat(form.limite) : null, alerta_dias: parseInt(form.alerta_dias),
    }
    setSalvando(true)
    const op = editando
      ? run(supabase.from('cartoes').update(payload).eq('id', editando), { ok: 'Cartão atualizado' })
      : run(supabase.from('cartoes').insert({ ...payload, grupo_id: perfil.grupo_id }), { ok: 'Cartão criado' })
    const { error } = await op
    setSalvando(false)
    if (error) return
    fecharModal(); carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir este cartão?')) return
    const { error } = await run(supabase.from('cartoes').delete().eq('id', id), { ok: 'Cartão excluído' })
    if (!error) carregar()
  }

  const hoje = new Date()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20 }}>Cartões</h2>
        <button onClick={abrirNovo} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--on-accent)', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> Novo
        </button>
      </div>

      {loading ? <div className="empty-state">Carregando...</div>
        : cartoes.length === 0 ? <div className="empty-state">Nenhum cartão cadastrado</div>
        : cartoes.map(c => {
          const f = calcularFaturas(c, gastos, parcelas, assinaturas, hoje)
          const usoPct = c.limite ? Math.min(100, Math.round((f.atual / Number(c.limite)) * 100)) : null
          return (
            <div key={c.id} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{bandeiras[c.bandeira] || '💳'}</span>
                  <div>
                    <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 16 }}>{c.nome}</p>
                    <p style={{ fontSize: 12, color: 'var(--text2)' }}>{c.bandeira} · fecha dia {c.dia_fechamento} · vence dia {c.dia_vencimento}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => editar(c)}><Pencil size={15} color="var(--text3)" /></button>
                  <button onClick={() => excluir(c.id)}><Trash2 size={16} color="var(--text3)" /></button>
                </div>
              </div>

              {/* Fatura atual — clica para ver a composição */}
              <button onClick={() => setDetalhe({ card: c, f })} style={{ width: '100%', textAlign: 'left', marginTop: 14, padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg3)', color: 'var(--text)', border: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}>Fatura atual · vence {format(f.vencAtual, 'dd/MM')}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Syne', color: 'var(--text)' }}>{fmt(f.atual)}</span>
                </div>
                {c.limite && (
                  <>
                    <div style={{ background: 'var(--border2)', borderRadius: 4, height: 5, overflow: 'hidden', margin: '8px 0 4px' }}>
                      <div style={{ width: `${usoPct}%`, height: '100%', background: usoPct >= 90 ? 'var(--red)' : usoPct >= 70 ? 'var(--amber)' : 'var(--accent)', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{usoPct}% do limite de {fmt(c.limite)}</span>
                  </>
                )}
                <p style={{ fontSize: 11, color: 'var(--accent)', marginTop: 8 }}>Ver o que compõe esta fatura →</p>
              </button>

              {/* Próxima fatura */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text2)', padding: '0 2px' }}>
                <span>Próxima fatura · vence {format(f.vencProx, 'dd/MM')}</span>
                <strong style={{ color: 'var(--text)' }}>{fmt(f.prox)}</strong>
              </div>
            </div>
          )
        })}

      {/* Modal: composição da fatura */}
      {detalhe && (() => {
        const { card, f } = detalhe
        const Secao = ({ titulo, venc, total, itens }) => (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Syne' }}>{titulo} · vence {format(venc, 'dd/MM')}</span>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Syne' }}>{fmt(total)}</span>
            </div>
            {itens.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text3)' }}>Nada lançado neste ciclo.</p>
            ) : itens.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 16 }}>{it.tipo === 'parcela' ? '💳' : it.tipo === 'assinatura' ? '📺' : emojiDe(it.categoria)}</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {it.descricao || 'Sem descrição'}
                      {it.tipo === 'parcela' && <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg3)', color: 'var(--blue)', padding: '1px 6px', borderRadius: 10 }}>{it.numero}/{it.total}x</span>}
                      {it.tipo === 'assinatura' && <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg3)', color: 'var(--purple)', padding: '1px 6px', borderRadius: 10 }}>assinatura</span>}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text3)' }}>{it.tipo === 'assinatura' ? (it.diaCobranca ? `Todo dia ${it.diaCobranca}` : 'Mensal') : fmtData(it.data, 'dd/MM')}</p>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', flexShrink: 0 }}>{fmt(it.valor)}</span>
              </div>
            ))}
          </div>
        )
        return (
          <div className="modal-overlay" onClick={() => setDetalhe(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h2 style={{ fontSize: 18 }}>{bandeiras[card.bandeira] || '💳'} {card.nome}</h2>
                <button onClick={() => setDetalhe(null)}><X size={20} color="var(--text2)" /></button>
              </div>
              <Secao titulo="Fatura atual" venc={f.vencAtual} total={f.atual} itens={f.atualItens} />
              <Secao titulo="Próxima fatura" venc={f.vencProx} total={f.prox} itens={f.proxItens} />
            </div>
          </div>
        )
      })()}

      {modal && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>{editando ? 'Editar cartão' : 'Novo cartão'}</h2>
            <div className="form-group"><label>Nome do cartão</label><input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Nubank, Inter..." /></div>
            <div className="form-group">
              <label>Bandeira</label>
              <select value={form.bandeira} onChange={e => setForm(p => ({ ...p, bandeira: e.target.value }))}>
                {Object.keys(bandeiras).map(b => <option key={b} value={b}>{bandeiras[b]} {b}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Dia de fechamento</label><input type="number" min="1" max="31" value={form.dia_fechamento} onChange={e => setForm(p => ({ ...p, dia_fechamento: e.target.value }))} placeholder="Ex: 20" /></div>
              <div className="form-group"><label>Dia de vencimento</label><input type="number" min="1" max="31" value={form.dia_vencimento} onChange={e => setForm(p => ({ ...p, dia_vencimento: e.target.value }))} placeholder="Ex: 27" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Limite (opcional)</label><input type="number" value={form.limite} onChange={e => setForm(p => ({ ...p, limite: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>Alertar X dias antes</label><input type="number" min="1" max="15" value={form.alerta_dias} onChange={e => setForm(p => ({ ...p, alerta_dias: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={fecharModal}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1, opacity: salvando ? 0.6 : 1 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
