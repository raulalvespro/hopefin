import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, CreditCard } from 'lucide-react'

export default function Cartoes() {
  const { perfil } = useAuth()
  const [cartoes, setCartoes] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ nome: '', bandeira: 'Visa', dia_fechamento: '', dia_vencimento: '', limite: '', alerta_dias: 3 })

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    const { data } = await supabase.from('cartoes').select('*').eq('grupo_id', perfil.grupo_id).order('nome')
    setCartoes(data || [])
  }

  async function salvar() {
    if (!form.nome || !form.dia_fechamento || !form.dia_vencimento) return
    await supabase.from('cartoes').insert({ ...form, dia_fechamento: parseInt(form.dia_fechamento), dia_vencimento: parseInt(form.dia_vencimento), limite: form.limite ? parseFloat(form.limite) : null, alerta_dias: parseInt(form.alerta_dias), grupo_id: perfil.grupo_id })
    setModal(false); setForm({ nome: '', bandeira: 'Visa', dia_fechamento: '', dia_vencimento: '', limite: '', alerta_dias: 3 })
    carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir este cartão?')) return
    await supabase.from('cartoes').delete().eq('id', id)
    carregar()
  }

  const bandeiras = { Visa: '💙', Mastercard: '🔴', Elo: '🟡', Amex: '🟢', Hipercard: '🔵' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20 }}>Cartões</h2>
        <button onClick={() => setModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#0f0f0f', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> Novo
        </button>
      </div>

      {cartoes.length === 0 ? (
        <div className="empty-state">Nenhum cartão cadastrado</div>
      ) : cartoes.map(c => (
        <div key={c.id} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>{bandeiras[c.bandeira] || '💳'}</span>
              <div>
                <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 16 }}>{c.nome}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>{c.bandeira}</p>
              </div>
            </div>
            <button onClick={() => excluir(c.id)}><Trash2 size={16} color="var(--text3)" /></button>
          </div>
          <div className="divider" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
            <div><span style={{ color: 'var(--text2)' }}>Fechamento</span><br /><strong>Dia {c.dia_fechamento}</strong></div>
            <div><span style={{ color: 'var(--text2)' }}>Vencimento</span><br /><strong>Dia {c.dia_vencimento}</strong></div>
            {c.limite && <div><span style={{ color: 'var(--text2)' }}>Limite</span><br /><strong>{c.limite.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>}
            <div><span style={{ color: 'var(--text2)' }}>Alerta</span><br /><strong>{c.alerta_dias} dias antes</strong></div>
          </div>
        </div>
      ))}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>Novo cartão</h2>
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
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={salvar}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
