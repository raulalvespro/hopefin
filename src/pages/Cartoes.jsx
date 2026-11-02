import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { addMonths, subMonths, getDaysInMonth, format } from 'date-fns'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { fmt, parseDataLocal } from '../lib/format'

const bandeiras = { Visa: '💙', Mastercard: '🔴', Elo: '🟡', Amex: '🟢', Hipercard: '🔵' }
const novoForm = () => ({ nome: '', bandeira: 'Visa', dia_fechamento: '', dia_vencimento: '', limite: '', alerta_dias: 3 })

// Calcula fatura atual e próxima de um cartão a partir de gastos e parcelas
function calcularFaturas(card, gastos, parcelas, hoje) {
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
  const sumGastos = (abre, fecha) => gastos
    .filter(g => g.cartao_id === card.id && inCycle(parseDataLocal(g.data), abre, fecha))
    .reduce((s, g) => s + Number(g.valor), 0)
  const sumParcelas = venc => parcelas
    .filter(p => p.cartao_id === card.id && sameMonth(parseDataLocal(p.data_vencimento), venc))
    .reduce((s, p) => s + Number(p.valor), 0)

  return {
    atual: sumGastos(abreAtual, fechaAtual) + sumParcelas(vencAtual),
    vencAtual,
    prox: sumGastos(abreProx, fechaProx) + sumParcelas(vencProx),
    vencProx,
  }
}

export default function Cartoes() {
  const { perfil } = useAuth()
  const run = useDb()
  const { toast } = useToast()
  const [cartoes, setCartoes] = useState([])
  const [gastos, setGastos] = useState([])
  const [parcelas, setParcelas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(novoForm())
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    setLoading(true)
    const gid = perfil.grupo_id
    const [{ data: cs }, { data: gs }, { data: ps }] = await Promise.all([
      supabase.from('cartoes').select('*').eq('grupo_id', gid).order('nome'),
      supabase.from('gastos').select('valor, data, cartao_id').eq('grupo_id', gid).not('cartao_id', 'is', null),
      supabase.from('parcelas').select('valor, data_vencimento, parcelamentos!inner(cartao_id)').eq('grupo_id', gid).eq('paga', false),
    ])
    setCartoes(cs || [])
    setGastos(gs || [])
    setParcelas((ps || []).map(p => ({ valor: p.valor, data_vencimento: p.data_vencimento, cartao_id: p.parcelamentos?.cartao_id })))
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
          const f = calcularFaturas(c, gastos, parcelas, hoje)
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

              {/* Fatura atual */}
              <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>Fatura atual · vence {format(f.vencAtual, 'dd/MM')}</span>
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
              </div>

              {/* Próxima fatura */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text2)', padding: '0 2px' }}>
                <span>Próxima fatura · vence {format(f.vencProx, 'dd/MM')}</span>
                <strong style={{ color: 'var(--text)' }}>{fmt(f.prox)}</strong>
              </div>
            </div>
          )
        })}

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
