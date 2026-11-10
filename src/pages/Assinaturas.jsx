import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Pencil, Repeat } from 'lucide-react'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { fmt } from '../lib/format'

const novoForm = () => ({ nome: '', valor: '', dia_cobranca: '', cartao_id: '' })

export default function Assinaturas() {
  const { perfil } = useAuth()
  const run = useDb()
  const { toast } = useToast()
  const [itens, setItens] = useState([])
  const [cartoes, setCartoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(novoForm())
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    setLoading(true)
    const [{ data }, { data: cs }] = await Promise.all([
      supabase.from('assinaturas').select('*, cartoes(nome)').eq('grupo_id', perfil.grupo_id).eq('ativo', true).order('dia_cobranca'),
      supabase.from('cartoes').select('id, nome').eq('grupo_id', perfil.grupo_id).eq('ativo', true).order('nome'),
    ])
    setItens(data || [])
    setCartoes(cs || [])
    setLoading(false)
  }

  function abrirNovo() { setEditando(null); setForm(novoForm()); setModal(true) }
  function editar(a) {
    setEditando(a.id)
    setForm({ nome: a.nome, valor: String(a.valor), dia_cobranca: String(a.dia_cobranca ?? ''), cartao_id: a.cartao_id || '' })
    setModal(true)
  }
  function fecharModal() { setModal(false); setEditando(null); setForm(novoForm()) }

  async function salvar() {
    if (!form.nome || !form.valor) { toast('Preencha nome e valor.', 'erro'); return }
    const payload = {
      nome: form.nome,
      valor: parseFloat(form.valor),
      dia_cobranca: form.dia_cobranca ? parseInt(form.dia_cobranca) : null,
      cartao_id: form.cartao_id || null,
    }
    setSalvando(true)
    const op = editando
      ? run(supabase.from('assinaturas').update(payload).eq('id', editando), { ok: 'Assinatura atualizada' })
      : run(supabase.from('assinaturas').insert({ ...payload, grupo_id: perfil.grupo_id }), { ok: 'Assinatura criada' })
    const { error } = await op
    setSalvando(false)
    if (error) return
    fecharModal(); carregar()
  }

  async function excluir(id) {
    if (!confirm('Remover esta assinatura?')) return
    const { error } = await run(supabase.from('assinaturas').update({ ativo: false }).eq('id', id), { ok: 'Assinatura removida' })
    if (!error) carregar()
  }

  const total = itens.reduce((s, a) => s + Number(a.valor), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Repeat size={20} color="var(--accent)" />
          <h2 style={{ fontSize: 20 }}>Assinaturas</h2>
        </div>
        <button onClick={abrirNovo} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--on-accent)', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> Nova
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>Total mensal em assinaturas</span>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: 'var(--purple-text)' }}>{fmt(total)}</span>
      </div>

      {loading ? <div className="empty-state">Carregando...</div>
        : itens.length === 0 ? <div className="empty-state">Nenhuma assinatura cadastrada</div>
        : itens.map(a => (
          <div key={a.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>📺</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{a.nome}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {a.dia_cobranca ? `Cobra dia ${a.dia_cobranca}` : 'Sem dia definido'}
                  {a.cartoes?.nome && ` · ${a.cartoes.nome}`}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--purple-text)', fontWeight: 700, fontFamily: 'Syne' }}>{fmt(a.valor)}</span>
              <button onClick={() => editar(a)}><Pencil size={14} color="var(--text3)" /></button>
              <button onClick={() => excluir(a.id)}><Trash2 size={15} color="var(--text3)" /></button>
            </div>
          </div>
        ))}

      {modal && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>{editando ? 'Editar assinatura' : 'Nova assinatura'}</h2>
            <div className="form-group"><label>Nome</label><input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Netflix, Spotify..." /></div>
            <div className="form-row">
              <div className="form-group"><label>Valor mensal</label><input type="number" inputMode="decimal" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>Dia da cobrança</label><input type="number" inputMode="decimal" min="1" max="31" value={form.dia_cobranca} onChange={e => setForm(p => ({ ...p, dia_cobranca: e.target.value }))} placeholder="Opcional" /></div>
            </div>
            <div className="form-group">
              <label>Cobrada no cartão (opcional)</label>
              <select value={form.cartao_id} onChange={e => setForm(p => ({ ...p, cartao_id: e.target.value }))}>
                <option value="">Não vinculado a cartão</option>
                {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Se vincular, ela entra automaticamente na fatura do cartão — não precisa lançar como gasto.</p>
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
