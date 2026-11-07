import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { useCategorias } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { fmt } from '../lib/format'

const novoForm = () => ({ nome: '', valor: '', dia_vencimento: '', categoria: 'outros', alerta_dias: 3 })

export default function ContasFixas() {
  const { perfil } = useAuth()
  const { categorias, emojiDe } = useCategorias()
  const run = useDb()
  const { toast } = useToast()
  const [contas, setContas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(novoForm())
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase.from('contas_fixas').select('*').eq('grupo_id', perfil.grupo_id).eq('ativo', true).order('dia_vencimento')
    setContas(data || [])
    setLoading(false)
  }

  function abrirNovo() {
    setEditando(null); setForm(novoForm()); setModal(true)
  }

  function editar(c) {
    setEditando(c.id)
    setForm({ nome: c.nome, valor: String(c.valor), dia_vencimento: String(c.dia_vencimento ?? ''), categoria: c.categoria || 'outros', alerta_dias: c.alerta_dias ?? 3 })
    setModal(true)
  }

  function fecharModal() {
    setModal(false); setEditando(null); setForm(novoForm())
  }

  async function salvar() {
    if (!form.nome || !form.valor || !form.dia_vencimento) { toast('Preencha nome, valor e dia.', 'erro'); return }
    const payload = {
      nome: form.nome, valor: parseFloat(form.valor), dia_vencimento: parseInt(form.dia_vencimento),
      categoria: form.categoria, alerta_dias: parseInt(form.alerta_dias),
    }
    setSalvando(true)
    const op = editando
      ? run(supabase.from('contas_fixas').update(payload).eq('id', editando), { ok: 'Conta atualizada' })
      : run(supabase.from('contas_fixas').insert({ ...payload, grupo_id: perfil.grupo_id }), { ok: 'Conta fixa criada' })
    const { error } = await op
    setSalvando(false)
    if (error) return
    fecharModal(); carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir esta conta fixa?')) return
    const { error } = await run(supabase.from('contas_fixas').update({ ativo: false }).eq('id', id), { ok: 'Conta removida' })
    if (!error) carregar()
  }

  const total = contas.reduce((s, c) => s + c.valor, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20 }}>Contas fixas</h2>
        <button onClick={abrirNovo} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--on-accent)', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> Nova
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>Total mensal fixo</span>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: 'var(--blue-text)' }}>{fmt(total)}</span>
      </div>

      {loading ? <div className="empty-state">Carregando...</div>
        : contas.length === 0 ? <div className="empty-state">Nenhuma conta fixa cadastrada</div>
        : contas.map(c => (
          <div key={c.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>{emojiDe(c.categoria)}</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{c.nome}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>Vence dia {c.dia_vencimento} · alerta {c.alerta_dias} dias antes</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--blue-text)', fontWeight: 700, fontFamily: 'Syne' }}>{fmt(c.valor)}</span>
              <button onClick={() => editar(c)}><Pencil size={14} color="var(--text3)" /></button>
              <button onClick={() => excluir(c.id)}><Trash2 size={15} color="var(--text3)" /></button>
            </div>
          </div>
        ))}

      {modal && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>{editando ? 'Editar conta fixa' : 'Nova conta fixa'}</h2>
            <div className="form-group"><label>Nome</label><input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Aluguel, Netflix..." /></div>
            <div className="form-row">
              <div className="form-group"><label>Valor</label><input type="number" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>Dia de vencimento</label><input type="number" min="1" max="31" value={form.dia_vencimento} onChange={e => setForm(p => ({ ...p, dia_vencimento: e.target.value }))} placeholder="Ex: 10" /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Categoria</label>
                <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                  {categorias.map(c => <option key={c.nome} value={c.nome}>{c.emoji} {c.nome}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Alertar X dias antes</label><input type="number" min="1" max="30" value={form.alerta_dias} onChange={e => setForm(p => ({ ...p, alerta_dias: e.target.value }))} /></div>
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
