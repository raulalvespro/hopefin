import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Trash2, Layers } from 'lucide-react'

const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const cats = { mercado: '🛒', transporte: '⛽', saude: '💊', alimentacao: '🍔', vestuario: '👕', lazer: '🎉', eletronico: '📱', moveis: '🛋️', outros: '📦' }

export default function Parcelamentos() {
  const { perfil } = useAuth()
  const [parcelamentos, setParcelamentos] = useState([])
  const [cartoes, setCartoes] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ descricao: '', valor_total: '', num_parcelas: '', cartao_id: '', categoria: 'outros', data_primeira_parcela: format(new Date(), 'yyyy-MM-dd') })

  useEffect(() => { if (perfil?.grupo_id) { carregar(); carregarCartoes() } }, [perfil])

  async function carregar() {
    const { data } = await supabase.from('parcelamentos').select('*, cartoes(nome), parcelas(id, paga)').eq('grupo_id', perfil.grupo_id).order('criado_em', { ascending: false })
    setParcelamentos(data || [])
  }

  async function carregarCartoes() {
    const { data } = await supabase.from('cartoes').select('id, nome').eq('grupo_id', perfil.grupo_id).eq('ativo', true)
    setCartoes(data || [])
  }

  async function salvar() {
    if (!form.descricao || !form.valor_total || !form.num_parcelas) return
    const vTotal = parseFloat(form.valor_total)
    const nParcelas = parseInt(form.num_parcelas)
    const vParcela = parseFloat((vTotal / nParcelas).toFixed(2))
    await supabase.from('parcelamentos').insert({ ...form, valor_total: vTotal, num_parcelas: nParcelas, valor_parcela: vParcela, cartao_id: form.cartao_id || null, grupo_id: perfil.grupo_id, usuario_id: perfil.id })
    setModal(false); setForm({ descricao: '', valor_total: '', num_parcelas: '', cartao_id: '', categoria: 'outros', data_primeira_parcela: format(new Date(), 'yyyy-MM-dd') })
    carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir este parcelamento?')) return
    await supabase.from('parcelamentos').delete().eq('id', id)
    carregar()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20 }}>Parcelamentos</h2>
        <button onClick={() => setModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#0f0f0f', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> Novo
        </button>
      </div>

      {parcelamentos.length === 0 ? <div className="empty-state">Nenhuma compra parcelada</div>
        : parcelamentos.map(p => {
          const pagas = p.parcelas?.filter(x => x.paga).length || 0
          const total = p.parcelas?.length || p.num_parcelas
          const progresso = Math.round((pagas / total) * 100)
          return (
            <div key={p.id} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{cats[p.categoria] || '📦'}</span>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 15 }}>{p.descricao}</p>
                    <p style={{ fontSize: 12, color: 'var(--text2)' }}>{p.cartoes?.nome || 'Sem cartão'}</p>
                  </div>
                </div>
                <button onClick={() => excluir(p.id)}><Trash2 size={15} color="var(--text3)" /></button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12, marginBottom: 12 }}>
                <div><span style={{ color: 'var(--text2)' }}>Total</span><br /><strong>{fmt(p.valor_total)}</strong></div>
                <div><span style={{ color: 'var(--text2)' }}>Parcela</span><br /><strong>{fmt(p.valor_parcela)}</strong></div>
                <div><span style={{ color: 'var(--text2)' }}>Progresso</span><br /><strong>{pagas}/{total}x</strong></div>
              </div>

              <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ width: `${progresso}%`, height: '100%', background: progresso === 100 ? 'var(--accent)' : 'var(--blue)', borderRadius: 4, transition: 'width 0.3s' }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
                1ª parcela: {format(new Date(p.data_primeira_parcela + 'T12:00:00'), "MMM/yyyy", { locale: ptBR })} · última: {format(addMonths(new Date(p.data_primeira_parcela + 'T12:00:00'), p.num_parcelas - 1), "MMM/yyyy", { locale: ptBR })}
              </p>
            </div>
          )
        })}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>Nova compra parcelada</h2>
            <div className="form-group"><label>Descrição</label><input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Geladeira Samsung" /></div>
            <div className="form-row">
              <div className="form-group"><label>Valor total</label><input type="number" value={form.valor_total} onChange={e => setForm(p => ({ ...p, valor_total: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>Nº de parcelas</label><input type="number" min="2" value={form.num_parcelas} onChange={e => setForm(p => ({ ...p, num_parcelas: e.target.value }))} placeholder="Ex: 12" /></div>
            </div>
            {form.valor_total && form.num_parcelas && (
              <p style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 12 }}>
                Parcela: {fmt(parseFloat(form.valor_total) / parseInt(form.num_parcelas))}
              </p>
            )}
            <div className="form-row">
              <div className="form-group">
                <label>Categoria</label>
                <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                  {Object.entries(cats).map(([v, e]) => <option key={v} value={v}>{e} {v}</option>)}
                </select>
              </div>
              <div className="form-group"><label>1ª parcela em</label><input type="date" value={form.data_primeira_parcela} onChange={e => setForm(p => ({ ...p, data_primeira_parcela: e.target.value }))} /></div>
            </div>
            <div className="form-group">
              <label>Cartão</label>
              <select value={form.cartao_id} onChange={e => setForm(p => ({ ...p, cartao_id: e.target.value }))}>
                <option value="">Sem cartão</option>
                {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
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
