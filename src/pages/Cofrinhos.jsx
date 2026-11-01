import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Plus, Trash2, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight } from 'lucide-react'

const fmt = v => Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const tipos = { cofrinho: { label: 'Cofrinho', icon: '🐷', cor: 'var(--accent)' }, investimento: { label: 'Investimento', icon: '📈', cor: 'var(--blue)' }, reserva: { label: 'Reserva', icon: '🛡️', cor: 'var(--amber)' } }

export default function Cofrinhos() {
  const { perfil } = useAuth()
  const [cofrinhos, setCofrinhos] = useState([])
  const [modalCofrinho, setModalCofrinho] = useState(false)
  const [modalTransf, setModalTransf] = useState(null)
  const [form, setForm] = useState({ nome: '', descricao: '', meta: '', tipo: 'cofrinho' })
  const transfInicial = { modo: 'depositar', valor: '', descricao: '', data: format(new Date(), 'yyyy-MM-dd'), destinoId: '' }
  const [formTransf, setFormTransf] = useState(transfInicial)

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

  function abrirTransf(cofre, modo) {
    setFormTransf({ ...transfInicial, modo })
    setModalTransf(cofre)
  }

  async function salvarTransferencia() {
    const valor = parseFloat(formTransf.valor)
    if (!valor || valor <= 0 || !modalTransf) return
    const c = modalTransf
    const { modo, descricao, data } = formTransf

    if ((modo === 'sacar' || modo === 'transferir') && valor > c.saldo_atual) {
      alert('Valor maior que o saldo disponível neste cofre.'); return
    }
    if (modo === 'transferir' && !formTransf.destinoId) {
      alert('Escolha o cofre de destino.'); return
    }

    const base = { descricao, data, grupo_id: perfil.grupo_id, usuario_id: perfil.id }

    if (modo === 'depositar') {
      await supabase.from('transferencias').insert({ ...base, valor, cofrinho_id: c.id })
      await supabase.from('cofrinhos').update({ saldo_atual: c.saldo_atual + valor }).eq('id', c.id)
    } else if (modo === 'sacar') {
      await supabase.from('transferencias').insert({ ...base, valor: -valor, cofrinho_id: c.id, descricao: descricao || 'Saque' })
      await supabase.from('cofrinhos').update({ saldo_atual: c.saldo_atual - valor }).eq('id', c.id)
    } else if (modo === 'transferir') {
      const destino = cofrinhos.find(x => x.id === formTransf.destinoId)
      await supabase.from('transferencias').insert([
        { ...base, valor: -valor, cofrinho_id: c.id, descricao: descricao || `Transferência → ${destino.nome}` },
        { ...base, valor, cofrinho_id: destino.id, descricao: descricao || `Transferência ← ${c.nome}` },
      ])
      await supabase.from('cofrinhos').update({ saldo_atual: c.saldo_atual - valor }).eq('id', c.id)
      await supabase.from('cofrinhos').update({ saldo_atual: destino.saldo_atual + valor }).eq('id', destino.id)
    }

    setModalTransf(null); setFormTransf(transfInicial)
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
        <button onClick={() => setModalCofrinho(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--on-accent)', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
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

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => abrirTransf(c, 'depositar')}
                  style={{ flex: 1.4, padding: '10px', borderRadius: 'var(--radius-sm)', border: 'none', background: t.cor, color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <ArrowDownToLine size={15} /> Guardar
                </button>
                <button onClick={() => abrirTransf(c, 'sacar')} disabled={c.saldo_atual <= 0}
                  style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', background: 'transparent', color: c.saldo_atual <= 0 ? 'var(--text3)' : 'var(--text)', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: c.saldo_atual <= 0 ? 0.5 : 1 }}>
                  <ArrowUpFromLine size={15} /> Sacar
                </button>
                {cofrinhos.length > 1 && (
                  <button onClick={() => abrirTransf(c, 'transferir')} disabled={c.saldo_atual <= 0} title="Transferir para outro cofre"
                    style={{ width: 42, padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', background: 'transparent', color: c.saldo_atual <= 0 ? 'var(--text3)' : 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: c.saldo_atual <= 0 ? 0.5 : 1 }}>
                    <ArrowLeftRight size={15} />
                  </button>
                )}
              </div>
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

      {/* Modal movimentação */}
      {modalTransf && (() => {
        const modos = [
          { v: 'depositar', label: 'Guardar', icon: ArrowDownToLine },
          { v: 'sacar', label: 'Sacar', icon: ArrowUpFromLine },
          ...(cofrinhos.length > 1 ? [{ v: 'transferir', label: 'Transferir', icon: ArrowLeftRight }] : []),
        ]
        const m = formTransf.modo
        const outros = cofrinhos.filter(x => x.id !== modalTransf.id)
        const titulo = m === 'sacar' ? 'Sacar de' : m === 'transferir' ? 'Transferir de' : 'Guardar em'
        const cta = m === 'sacar' ? 'Sacar' : m === 'transferir' ? 'Transferir' : 'Guardar'
        return (
        <div className="modal-overlay" onClick={() => setModalTransf(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>{titulo} {modalTransf.nome}</h2>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Saldo atual: {fmt(modalTransf.saldo_atual)}</p>

            {/* Seletor de modo */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {modos.map(({ v, label, icon: Icon }) => (
                <button key={v} onClick={() => setFormTransf(p => ({ ...p, modo: v }))}
                  style={{ flex: 1, padding: '8px 4px', borderRadius: 'var(--radius-sm)', border: `1px solid ${m === v ? 'var(--accent)' : 'var(--border)'}`, background: m === v ? 'var(--accent-dim)' : 'transparent', color: m === v ? 'var(--accent2)' : 'var(--text2)', fontSize: 12, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>

            {m === 'transferir' && (
              <div className="form-group">
                <label>Cofre de destino</label>
                <select value={formTransf.destinoId} onChange={e => setFormTransf(p => ({ ...p, destinoId: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {outros.map(o => <option key={o.id} value={o.id}>{(tipos[o.tipo] || tipos.cofrinho).icon} {o.nome}</option>)}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>Valor {(m === 'sacar' || m === 'transferir') && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· disp. {fmt(modalTransf.saldo_atual)}</span>}</label>
              <input type="number" value={formTransf.valor} onChange={e => setFormTransf(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" autoFocus />
            </div>
            <div className="form-group"><label>Descrição (opcional)</label><input value={formTransf.descricao} onChange={e => setFormTransf(p => ({ ...p, descricao: e.target.value }))} placeholder={m === 'sacar' ? 'Ex: Emergência do carro' : m === 'transferir' ? 'Motivo da transferência' : 'Ex: Guardar do salário'} /></div>
            <div className="form-group"><label>Data</label><input type="date" value={formTransf.data} onChange={e => setFormTransf(p => ({ ...p, data: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setModalTransf(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={salvarTransferencia}>{cta}</button>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
