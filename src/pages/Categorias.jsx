import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useCategorias } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { Plus, Pencil, Trash2 } from 'lucide-react'

const EMOJIS_SUGERIDOS = ['🛒','⛽','🍔','💊','🎉','👕','📱','🛋️','📺','🏠','📚','🚗','✈️','🐶','🎁','💇','🧾','💡','📦','❤️','🏥','🍺','☕','🎮']

export default function Categorias() {
  const { perfil } = useAuth()
  const { categorias, recarregar } = useCategorias()
  const run = useDb()
  const [modal, setModal] = useState(null) // { id?, nome, emoji }
  const [salvando, setSalvando] = useState(false)

  function abrir(cat) {
    setModal(cat ? { id: cat.id, nome: cat.nome, emoji: cat.emoji } : { nome: '', emoji: '📦' })
  }

  async function salvar() {
    const nome = modal.nome.trim().toLowerCase()
    if (!nome) return
    setSalvando(true)
    const op = modal.id
      ? run(supabase.from('categorias').update({ nome, emoji: modal.emoji }).eq('id', modal.id), { ok: 'Categoria atualizada', erro: 'Não foi possível salvar (nome já existe?)' })
      : run(supabase.from('categorias').insert({ nome, emoji: modal.emoji, ordem: 50, grupo_id: perfil.grupo_id }), { ok: 'Categoria criada', erro: 'Não foi possível criar (nome já existe?)' })
    const { error } = await op
    setSalvando(false)
    if (error) return
    setModal(null); recarregar()
  }

  async function excluir(cat) {
    if (!confirm(`Excluir a categoria "${cat.nome}"? Lançamentos antigos ficam sem ícone, mas não são apagados.`)) return
    const { error } = await run(supabase.from('categorias').delete().eq('id', cat.id), { ok: 'Categoria excluída' })
    if (!error) recarregar()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ fontSize: 20 }}>Categorias</h2>
        <button onClick={() => abrir(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--on-accent)', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> Nova
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        Usadas em gastos, orçamento, parcelas e contas fixas.
      </p>

      {categorias.map(c => (
        <div key={c.id || c.nome} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>{c.emoji}</span>
            <span style={{ fontSize: 15, fontWeight: 500, textTransform: 'capitalize' }}>{c.nome}</span>
          </div>
          {c.id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => abrir(c)}><Pencil size={15} color="var(--text3)" /></button>
              <button onClick={() => excluir(c)}><Trash2 size={15} color="var(--text3)" /></button>
            </div>
          )}
        </div>
      ))}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>{modal.id ? 'Editar categoria' : 'Nova categoria'}</h2>

            <div className="form-group">
              <label>Nome</label>
              <input autoFocus value={modal.nome} onChange={e => setModal(m => ({ ...m, nome: e.target.value }))} placeholder="Ex: pet, viagem, presentes..." />
            </div>

            <div className="form-group">
              <label>Ícone</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 30, width: 48, height: 48, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)' }}>{modal.emoji}</span>
                <input value={modal.emoji} onChange={e => setModal(m => ({ ...m, emoji: e.target.value.slice(0, 2) }))} style={{ width: 70, textAlign: 'center', fontSize: 18 }} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {EMOJIS_SUGERIDOS.map(e => (
                  <button key={e} onClick={() => setModal(m => ({ ...m, emoji: e }))}
                    style={{ fontSize: 20, width: 38, height: 38, borderRadius: 'var(--radius-sm)', border: `1px solid ${modal.emoji === e ? 'var(--accent)' : 'var(--border)'}`, background: modal.emoji === e ? 'var(--accent-dim)' : 'var(--bg2)' }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={salvar} disabled={salvando || !modal.nome.trim()}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
