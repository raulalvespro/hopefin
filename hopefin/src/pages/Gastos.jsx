import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import BotaoVoz from '../components/BotaoVoz'

const categorias = ['mercado','transporte','saude','alimentacao','vestuario','lazer','outros']
const cats = { mercado: '🛒', transporte: '⛽', saude: '💊', alimentacao: '🍔', vestuario: '👕', lazer: '🎉', outros: '📦' }
const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Gastos() {
  const { perfil } = useAuth()
  const [mes, setMes] = useState(new Date())
  const [gastos, setGastos] = useState([])
  const [cartoes, setCartoes] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ descricao: '', valor: '', categoria: 'outros', tipo_pagamento: 'cartao', cartao_id: '', data: format(new Date(), 'yyyy-MM-dd') })
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (perfil?.grupo_id) { carregar(); carregarCartoes() } }, [perfil, mes])

  async function carregar() {
    setLoading(true)
    const inicio = format(startOfMonth(mes), 'yyyy-MM-dd')
    const fim = format(endOfMonth(mes), 'yyyy-MM-dd')
    const { data } = await supabase.from('gastos').select('*, cartoes(nome), usuarios(nome)').eq('grupo_id', perfil.grupo_id).gte('data', inicio).lte('data', fim).order('data', { ascending: false })
    setGastos(data || [])
    setLoading(false)
  }

  async function carregarCartoes() {
    const { data } = await supabase.from('cartoes').select('id, nome').eq('grupo_id', perfil.grupo_id).eq('ativo', true)
    setCartoes(data || [])
  }

  async function salvar() {
    if (!form.descricao || !form.valor) return
    await supabase.from('gastos').insert({ ...form, valor: parseFloat(form.valor), grupo_id: perfil.grupo_id, usuario_id: perfil.id, cartao_id: form.cartao_id || null })
    setModal(false); setForm({ descricao: '', valor: '', categoria: 'outros', tipo_pagamento: 'cartao', cartao_id: '', data: format(new Date(), 'yyyy-MM-dd') })
    carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir este gasto?')) return
    await supabase.from('gastos').delete().eq('id', id)
    carregar()
  }

  const total = gastos.reduce((s, g) => s + g.valor, 0)

  return (
    <div>
      {/* Navegação de mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={() => setMes(m => subMonths(m, 1))}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h2 style={{ fontSize: 16 }}>{format(mes, 'MMMM yyyy', { locale: ptBR })}</h2>
        <button onClick={() => setMes(m => addMonths(m, 1))}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      {/* Total */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text2)', fontSize: 13' }}>Total de gastos</span>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20, color: 'var(--red)' }}>{fmt(total)}</span>
      </div>

      {/* Lista */}
      {loading ? <div className="empty-state">Carregando...</div> : gastos.length === 0 ? (
        <div className="empty-state">Nenhum gasto neste mês</div>
      ) : gastos.map(g => (
        <div key={g.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{cats[g.categoria] || '📦'}</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500 }}>{g.descricao}</p>
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                {format(new Date(g.data + 'T12:00:00'), 'dd/MM')} · {g.cartoes?.nome || g.tipo_pagamento} · {g.usuarios?.nome?.split(' ')[0]}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--red)', fontWeight: 700, fontFamily: 'Syne' }}>{fmt(g.valor)}</span>
            <button onClick={() => excluir(g.id)}><Trash2 size={15} color="var(--text3)" /></button>
          </div>
        </div>
      ))}

      {/* Botão adicionar manual */}
      <button onClick={() => setModal(true)} style={{ position: 'fixed', bottom: 80, left: 20, width: 48, height: 48, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <Plus size={22} color="var(--text)" />
      </button>

      <BotaoVoz onSalvo={carregar} />

      {/* Modal novo gasto */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>Novo gasto</h2>
            <div className="form-group"><label>Descrição</label><input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Mercado Extra" /></div>
            <div className="form-row">
              <div className="form-group"><label>Valor</label><input type="number" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>Data</label><input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Categoria</label>
                <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                  {categorias.map(c => <option key={c} value={c}>{cats[c]} {c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Pagamento</label>
                <select value={form.tipo_pagamento} onChange={e => setForm(p => ({ ...p, tipo_pagamento: e.target.value }))}>
                  <option value="cartao">Cartão</option>
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                </select>
              </div>
            </div>
            {form.tipo_pagamento === 'cartao' && (
              <div className="form-group">
                <label>Cartão</label>
                <select value={form.cartao_id} onChange={e => setForm(p => ({ ...p, cartao_id: e.target.value }))}>
                  <option value="">Selecione</option>
                  {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}
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
