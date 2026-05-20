import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Plus, Trash2, PiggyBank, TrendingUp, Shield } from 'lucide-react'

const fmt = v => Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const tipos = { cofrinho: { label: 'Cofrinho', icon: '🐷', cor: 'var(--accent)' }, investimento: { label: 'Investimento', icon: '📈', cor: 'var(--blue)' }, reserva: { label: 'Reserva', icon: '🛡️', cor: 'var(--amber)' } }

export default function Cofrinhos() {
  const { perfil } = useAuth()
  const [cofrinhos, setCofrinhos] = useState([])
  const [modalCofrinho, setModalCofrinho] = useState(false)
  const [modalTransf, setModalTransf] = useState(null)
  const [form, setForm] = useState({ nome: '', descricao: '', meta: '', tipo: 'cofrinho' })
  const [formTransf, setFormTransf] = useState({ valor: '', descricao: '', data: format(new Date(), 'yyyy-MM-dd') })

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    const { data } = await supabase.from('cofrinhos').select('*, transferencias(valor)').eq('grupo_id', perfil.grupo_id).order('criado_em')
    // Calcula saldo atual somando transferências
    const com_saldo = (data || []).map(c => ({
      ...c,
      saldo_atual: (c.transferencias || []).reduce((s, t) => s + Number(t.valor), 0)
    }))
    setCofrinhos(com_saldo)
  }

  async function salvarCofrinho() {
    if (!form.nome) return
    await supabase.from('cofrinhos').insert({ ...form, meta: form.meta ? parseFloat(form.meta) : null, grupo_id: perfil.grupo_id })
    setModalCofrinho(false); setForm({ nome: '', descricao: '', meta: '', tipo: 'cofrinho' })
    carregar()
  }

  async function salvarTransferencia() {
    if (!formTransf.valor || !modalTransf) return
    const valor = parseFloat(formTransf.valor)
    await supabase.from('transferencias').insert({ ...formTransf, valor, cofrinho_id: modalTransf.id, grupo_id: perfil.grupo_id, usuario_id: perfil.id })
    // Atualiza saldo
    await supabase.from('cofrinhos').update({ saldo_atual: modalTransf.saldo_atual + valor }).eq('id', modalTransf.id)
    setModalTransf(null); setFormTransf({ valor: '', descricao: '', data: format(new Date(), 'yyyy-MM-dd') })
    carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir este cofre?')) return
    await supabase.from('cofrinhos').delete().eq('id', id)
    carregar()
  }

  const totalCofrinhos = cofrinhos.reduce((s, c) => s + c.saldo_atual, 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20 }}>Cofres & Investimentos</h2>
        <button onClick={() => setModalCofrinho(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#0f0f0f', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> Novo
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>Total guardado</span>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20, color: 'var(--accent)' }}>{fmt(totalCofrinhos)}</span>
      </div>

      {cofrinhos.length === 0 ? <div className="empty-state">Nenhum cofre criado ainda</div>
        : cofrinhos.map(c => {
          const t = tipos[c.tipo] || tipos.cofrinho
          const progresso = c.meta ? Math.min(100, Math.round((c.saldo_atual / c.meta) * 100)) : null
          return (
            <div key={c.id} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 28 }}>{t.icon}</span>
                  <div>
                    <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16 }}>{c.nome}</p>
                    <span style={{ fontSize: 11, background: 'var(--bg3)', color: 'var(--text2)', padding: '2px 8px', borderRadius: 10 }}>{t.label}</span>
                  </div>
                </div>
                <button onClick={() => excluir(c.id)}><Trash2 size={15} color="var(--text3)" /></button>
              </div>

              <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 24, color: t.cor, marginBottom: 8 }}>{fmt(c.saldo_atual)}</p>

              {c.meta && (
                <>
                  <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ width: `${progresso}%`, height: '100%', background: t.cor, borderRadius: 4, transition: 'width 0.3s' }} />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
                    {progresso}% da meta de {fmt(c.meta)}
                  </p>
                </>
              )}

              {c.descricao && <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>{c.descricao}</p>}

              <button onClick={() => setModalTransf(c)}
                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: `1px solid ${t.cor}`, background: 'transparent', color: t.cor, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                + Adicionar dinheiro
              </button>
            </div>
          )
        })}

      {/* Modal novo cofre */}
      {modalCofrinho && (
        <div className="modal-overlay" onClick={() => setModalCofrinho(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>Novo cofre</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 16 }}>
              {Object.entries(tipos).map(([v, t]) => (
                <button key={v} onClick={() => setForm(p => ({ ...p, tipo: v }))}
                  style={{ padding: '10px 4px', borderRadius: 'var(--radius-sm)', border: `1px solid ${form.tipo === v ? 'var(--accent)' : 'var(--border)'}`, background: form.tipo === v ? 'var(--accent-dim)' : 'transparent', color: form.tipo === v ? 'var(--accent)' : 'var(--text2)', fontSize: 12, fontWeight: 500 }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            <div className="form-group"><label>Nome</label><input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Viagem Europa, FGTS..." /></div>
            <div className="form-group"><label>Descrição (opcional)</label><input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Para que serve este cofre?" /></div>
            <div className="form-group"><label>Meta (opcional)</label><input type="number" value={form.meta} onChange={e => setForm(p => ({ ...p, meta: e.target.value }))} placeholder="0,00" /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setModalCofrinho(false)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={salvarCofrinho}>Criar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal transferência */}
      {modalTransf && (
        <div className="modal-overlay" onClick={() => setModalTransf(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Adicionar ao {modalTransf.nome}</h2>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Saldo atual: {fmt(modalTransf.saldo_atual)}</p>
            <div className="form-group"><label>Valor</label><input type="number" value={formTransf.valor} onChange={e => setFormTransf(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" autoFocus /></div>
            <div className="form-group"><label>Descrição (opcional)</label><input value={formTransf.descricao} onChange={e => setFormTransf(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Guardar do salário de maio" /></div>
            <div className="form-group"><label>Data</label><input type="date" value={formTransf.data} onChange={e => setFormTransf(p => ({ ...p, data: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setModalTransf(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={salvarTransferencia}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
