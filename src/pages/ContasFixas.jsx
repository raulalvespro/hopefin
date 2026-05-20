import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Trash2 } from 'lucide-react'

const categorias = ['moradia','transporte','saude','educacao','lazer','assinatura','outros']
const catEmoji = { moradia: '🏠', transporte: '🚗', saude: '💊', educacao: '📚', lazer: '🎉', assinatura: '📱', outros: '📋' }
const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ContasFixas() {
  const { perfil } = useAuth()
  const [contas, setContas] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ nome: '', valor: '', dia_vencimento: '', categoria: 'outros', alerta_dias: 3 })

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    const { data } = await supabase.from('contas_fixas').select('*').eq('grupo_id', perfil.grupo_id).eq('ativo', true).order('dia_vencimento')
    setContas(data || [])
  }

  async function salvar() {
    if (!form.nome || !form.valor || !form.dia_vencimento) return
    await supabase.from('contas_fixas').insert({ ...form, valor: parseFloat(form.valor), dia_vencimento: parseInt(form.dia_vencimento), alerta_dias: parseInt(form.alerta_dias), grupo_id: perfil.grupo_id })
    setModal(false); setForm({ nome: '', valor: '', dia_vencimento: '', categoria: 'outros', alerta_dias: 3 })
    carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir esta conta fixa?')) return
    await supabase.from('contas_fixas').update({ ativo: false }).eq('id', id)
    carregar()
  }

  const total = contas.reduce((s, c) => s + c.valor, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20 }}>Contas fixas</h2>
        <button onClick={() => setModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#0f0f0f', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> Nova
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>Total mensal fixo</span>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: 'var(--blue)' }}>{fmt(total)}</span>
      </div>

      {contas.length === 0 ? <div className="empty-state">Nenhuma conta fixa cadastrada</div>
        : contas.map(c => (
          <div key={c.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>{catEmoji[c.categoria] || '📋'}</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{c.nome}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>Vence dia {c.dia_vencimento} · alerta {c.alerta_dias} dias antes</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--blue)', fontWeight: 700, fontFamily: 'Syne' }}>{fmt(c.valor)}</span>
              <button onClick={() => excluir(c.id)}><Trash2 size={15} color="var(--text3)" /></button>
            </div>
          </div>
        ))}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>Nova conta fixa</h2>
            <div className="form-group"><label>Nome</label><input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Aluguel, Netflix..." /></div>
            <div className="form-row">
              <div className="form-group"><label>Valor</label><input type="number" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>Dia de vencimento</label><input type="number" min="1" max="31" value={form.dia_vencimento} onChange={e => setForm(p => ({ ...p, dia_vencimento: e.target.value }))} placeholder="Ex: 10" /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Categoria</label>
                <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                  {categorias.map(c => <option key={c} value={c}>{catEmoji[c]} {c}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Alertar X dias antes</label><input type="number" min="1" max="30" value={form.alerta_dias} onChange={e => setForm(p => ({ ...p, alerta_dias: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={salvar}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
