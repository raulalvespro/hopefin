import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Pencil, Landmark, Wallet, PiggyBank, TrendingUp } from 'lucide-react'

const TIPOS = {
  corrente:     { label: 'Conta corrente', icon: '🏦' },
  poupanca:     { label: 'Poupança',       icon: '🐷' },
  carteira:     { label: 'Carteira',       icon: '👛' },
  investimento: { label: 'Investimento',   icon: '📈' },
}
const fmt = v => Number(v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })

export default function Contas() {
  const { perfil } = useAuth()
  const [contas, setContas] = useState([])
  const [totalCofrinhos, setTotalCofrinhos] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { id?, nome, tipo, saldo }

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    setLoading(true)
    const gid = perfil.grupo_id
    const [{ data: c }, { data: cof }] = await Promise.all([
      supabase.from('contas').select('*').eq('grupo_id', gid).eq('ativo', true).order('saldo', { ascending:false }),
      supabase.from('cofrinhos').select('saldo_atual').eq('grupo_id', gid),
    ])
    setContas(c || [])
    setTotalCofrinhos((cof||[]).reduce((s,x) => s + Number(x.saldo_atual||0), 0))
    setLoading(false)
  }

  async function salvar() {
    if (!modal?.nome || modal.saldo === '') return
    const payload = { nome: modal.nome, tipo: modal.tipo, saldo: parseFloat(modal.saldo) }
    if (modal.id) await supabase.from('contas').update(payload).eq('id', modal.id)
    else await supabase.from('contas').insert({ ...payload, grupo_id: perfil.grupo_id })
    setModal(null); carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir esta conta?')) return
    await supabase.from('contas').update({ ativo:false }).eq('id', id)
    carregar()
  }

  const totalContas = contas.reduce((s,c) => s + Number(c.saldo), 0)
  const patrimonio = totalContas + totalCofrinhos

  if (loading) return <div className="empty-state">Carregando...</div>

  return (
    <div>
      {/* Patrimônio */}
      <div className="card" style={{ marginBottom:16, background:'var(--accent-dim)', borderColor:'var(--accent)' }}>
        <p style={{ fontSize:12, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Patrimônio da família</p>
        <p style={{ fontSize:32, fontFamily:'Syne', fontWeight:700, color:'var(--accent2)' }}>{fmt(patrimonio)}</p>
        <div style={{ display:'flex', gap:16, marginTop:10, fontSize:12, color:'var(--text2)' }}>
          <span>🏦 Contas: <strong style={{ color:'var(--text)' }}>{fmt(totalContas)}</strong></span>
          <span>🐷 Cofrinhos: <strong style={{ color:'var(--text)' }}>{fmt(totalCofrinhos)}</strong></span>
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:18 }}>Minhas contas</h2>
        <button onClick={() => setModal({ nome:'', tipo:'corrente', saldo:'' })}
          style={{ display:'flex', alignItems:'center', gap:6, background:'var(--accent)', color:'var(--on-accent)', padding:'8px 14px', borderRadius:'var(--radius-sm)', fontSize:13, fontWeight:700, fontFamily:'Syne' }}>
          <Plus size={16} /> Nova
        </button>
      </div>

      {contas.length === 0 ? <div className="empty-state">Nenhuma conta cadastrada</div>
        : contas.map(c => (
          <div key={c.id} className="card" style={{ marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:26 }}>{TIPOS[c.tipo]?.icon || '🏦'}</span>
              <div>
                <p style={{ fontWeight:600, fontFamily:'Syne', fontSize:15 }}>{c.nome}</p>
                <p style={{ fontSize:12, color:'var(--text2)' }}>{TIPOS[c.tipo]?.label || c.tipo}</p>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontWeight:700, fontFamily:'Syne', fontSize:16, color: c.saldo<0?'var(--red)':'var(--text)' }}>{fmt(c.saldo)}</span>
              <button onClick={() => setModal({ id:c.id, nome:c.nome, tipo:c.tipo, saldo:String(c.saldo) })}><Pencil size={15} color="var(--text3)" /></button>
              <button onClick={() => excluir(c.id)}><Trash2 size={15} color="var(--text3)" /></button>
            </div>
          </div>
        ))}

      {/* Modal conta */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize:18, marginBottom:20 }}>{modal.id ? 'Editar conta' : 'Nova conta'}</h2>
            <div className="form-group"><label>Nome</label><input autoFocus value={modal.nome} onChange={e => setModal(m => ({ ...m, nome:e.target.value }))} placeholder="Ex: Conta Nubank" /></div>
            <div className="form-row">
              <div className="form-group">
                <label>Tipo</label>
                <select value={modal.tipo} onChange={e => setModal(m => ({ ...m, tipo:e.target.value }))}>
                  {Object.entries(TIPOS).map(([v,t]) => <option key={v} value={v}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Saldo atual</label><input type="number" value={modal.saldo} onChange={e => setModal(m => ({ ...m, saldo:e.target.value }))} placeholder="0,00" /></div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn-ghost" style={{ flex:1 }} onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex:1 }} onClick={salvar}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
