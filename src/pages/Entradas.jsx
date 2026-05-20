import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Trash2, RefreshCw } from 'lucide-react'

const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Entradas() {
  const { perfil } = useAuth()
  const [mes, setMes] = useState(new Date())
  const [entradas, setEntradas] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ descricao: '', valor: '', tipo: 'avulso', recorrente: false, data: format(new Date(), 'yyyy-MM-dd') })
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil, mes])

  async function carregar() {
    setLoading(true)
    const inicio = format(startOfMonth(mes), 'yyyy-MM-dd')
    const fim = format(endOfMonth(mes), 'yyyy-MM-dd')
    const { data } = await supabase.from('entradas').select('*, usuarios(nome)').eq('grupo_id', perfil.grupo_id).gte('data', inicio).lte('data', fim).order('data', { ascending: false })
    setEntradas(data || [])
    setLoading(false)
  }

  async function salvar() {
    if (!form.descricao || !form.valor) return
    await supabase.from('entradas').insert({ ...form, valor: parseFloat(form.valor), grupo_id: perfil.grupo_id, usuario_id: perfil.id })
    setModal(false); setForm({ descricao: '', valor: '', tipo: 'avulso', recorrente: false, data: format(new Date(), 'yyyy-MM-dd') })
    carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir esta entrada?')) return
    await supabase.from('entradas').delete().eq('id', id)
    carregar()
  }

  const total = entradas.reduce((s, e) => s + e.valor, 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={() => setMes(m => subMonths(m, 1))}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h2 style={{ fontSize: 16 }}>{format(mes, 'MMMM yyyy', { locale: ptBR })}</h2>
        <button onClick={() => setMes(m => addMonths(m, 1))}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>Total de entradas</span>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20, color: 'var(--accent)' }}>{fmt(total)}</span>
      </div>

      {loading ? <div className="empty-state">Carregando...</div> : entradas.length === 0 ? (
        <div className="empty-state">Nenhuma entrada neste mês</div>
      ) : entradas.map(e => (
        <div key={e.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{e.tipo === 'fixo' ? '💼' : '💰'}</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500 }}>{e.descricao}</p>
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                {format(new Date(e.data + 'T12:00:00'), 'dd/MM')} · {e.tipo === 'fixo' ? 'Fixo' : 'Avulso'} · {e.usuarios?.nome?.split(' ')[0]}
                {e.recorrente && <span style={{ marginLeft: 6 }}><RefreshCw size={10} /></span>}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700, fontFamily: 'Syne' }}>{fmt(e.valor)}</span>
            <button onClick={() => excluir(e.id)}><Trash2 size={15} color="var(--text3)" /></button>
          </div>
        </div>
      ))}

      <button onClick={() => setModal(true)} style={{ position: 'fixed', bottom: 80, right: 20, width: 56, height: 56, borderRadius: '50%', background: 'var(--accent)', color: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 24px rgba(200,245,90,0.3)', zIndex: 50 }}>
        <Plus size={24} />
      </button>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>Nova entrada</h2>
            <div className="form-group"><label>Descrição</label><input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Salário, Freelance..." /></div>
            <div className="form-row">
              <div className="form-group"><label>Valor</label><input type="number" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>Data</label><input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Tipo</label>
                <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                  <option value="fixo">Fixo (salário)</option>
                  <option value="avulso">Avulso</option>
                </select>
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingBottom: 10 }}>
                  <input type="checkbox" checked={form.recorrente} onChange={e => setForm(p => ({ ...p, recorrente: e.target.checked }))} style={{ width: 'auto' }} />
                  Recorrente
                </label>
              </div>
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
