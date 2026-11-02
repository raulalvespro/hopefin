import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, getDaysInMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, RefreshCw, Check } from 'lucide-react'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { fmt, fmtData, hojeISO } from '../lib/format'

const novoForm = () => ({ descricao: '', valor: '', tipo: 'avulso', recorrente: false, data: hojeISO() })

export default function Entradas() {
  const { perfil } = useAuth()
  const run = useDb()
  const { toast } = useToast()
  const [mes, setMes] = useState(new Date())
  const [entradas, setEntradas] = useState([])
  const [pendentes, setPendentes] = useState([])
  const [lancando, setLancando] = useState(false)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(novoForm())
  const [salvando, setSalvando] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil, mes])

  async function carregar() {
    setLoading(true)
    const gid = perfil.grupo_id
    const inicio = format(startOfMonth(mes), 'yyyy-MM-dd')
    const fim = format(endOfMonth(mes), 'yyyy-MM-dd')
    const iniAnt = format(startOfMonth(subMonths(mes, 1)), 'yyyy-MM-dd')
    const fimAnt = format(endOfMonth(subMonths(mes, 1)), 'yyyy-MM-dd')

    const [{ data }, { data: recAnt }] = await Promise.all([
      supabase.from('entradas').select('*, usuarios(nome)').eq('grupo_id', gid).gte('data', inicio).lte('data', fim).order('data', { ascending: false }),
      supabase.from('entradas').select('*').eq('grupo_id', gid).eq('recorrente', true).gte('data', iniAnt).lte('data', fimAnt),
    ])
    setEntradas(data || [])

    const chavesAtuais = new Set((data || []).map(e => `${e.descricao}|${e.usuario_id}`))
    setPendentes((recAnt || []).filter(r => !chavesAtuais.has(`${r.descricao}|${r.usuario_id}`)))
    setLoading(false)
  }

  async function lancarRecorrentes() {
    if (pendentes.length === 0) return
    setLancando(true)
    const diasNoMes = getDaysInMonth(mes)
    const novas = pendentes.map(r => {
      const dia = Math.min(parseInt(r.data.slice(8, 10)), diasNoMes)
      return {
        descricao: r.descricao, valor: r.valor, tipo: r.tipo, recorrente: true,
        data: format(new Date(mes.getFullYear(), mes.getMonth(), dia), 'yyyy-MM-dd'),
        grupo_id: perfil.grupo_id, usuario_id: r.usuario_id,
      }
    })
    const { error } = await run(supabase.from('entradas').insert(novas), { ok: 'Recorrentes lançadas' })
    setLancando(false)
    if (!error) carregar()
  }

  function abrirNovo() {
    setEditando(null); setForm(novoForm()); setModal(true)
  }

  function editar(e) {
    setEditando(e.id)
    setForm({ descricao: e.descricao, valor: String(e.valor), tipo: e.tipo, recorrente: e.recorrente, data: e.data })
    setModal(true)
  }

  function fecharModal() {
    setModal(false); setEditando(null); setForm(novoForm())
  }

  async function salvar() {
    if (!form.descricao || !form.valor) { toast('Preencha descrição e valor.', 'erro'); return }
    const valor = parseFloat(form.valor)
    if (!(valor > 0)) { toast('Informe um valor válido.', 'erro'); return }
    setSalvando(true)

    if (editando) {
      const { error } = await run(
        supabase.from('entradas').update({ descricao: form.descricao, valor, tipo: form.tipo, recorrente: form.recorrente, data: form.data }).eq('id', editando),
        { ok: 'Entrada atualizada' }
      )
      setSalvando(false)
      if (error) return
      fecharModal(); carregar(); return
    }

    const { error } = await run(
      supabase.from('entradas').insert({ descricao: form.descricao, valor, tipo: form.tipo, recorrente: form.recorrente, data: form.data, recebido: form.data <= hojeISO(), grupo_id: perfil.grupo_id, usuario_id: perfil.id }),
      { ok: 'Entrada adicionada' }
    )
    setSalvando(false)
    if (error) return
    fecharModal(); carregar()
  }

  async function toggleRecebido(e) {
    const novo = !e.recebido
    const { error } = await run(
      supabase.from('entradas').update({ recebido: novo, data_recebimento: novo ? hojeISO() : null }).eq('id', e.id),
      { ok: novo ? 'Confirmada como recebida' : 'Recebimento desfeito' }
    )
    if (!error) setEntradas(list => list.map(x => x.id === e.id ? { ...x, recebido: novo } : x))
  }

  async function excluir(id) {
    if (!confirm('Excluir esta entrada?')) return
    const { error } = await run(supabase.from('entradas').delete().eq('id', id), { ok: 'Entrada excluída' })
    if (!error) carregar()
  }

  const total = entradas.reduce((s, e) => s + e.valor, 0)
  const totalRecebido = entradas.filter(e => e.recebido).reduce((s, e) => s + Number(e.valor), 0)
  const aReceber = total - totalRecebido

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={() => setMes(m => subMonths(m, 1))}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h2 style={{ fontSize: 16 }}>{format(mes, 'MMMM yyyy', { locale: ptBR })}</h2>
        <button onClick={() => setMes(m => addMonths(m, 1))}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>Total de entradas</span>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20, color: 'var(--accent)' }}>{fmt(total)}</span>
        </div>
        {aReceber > 0.009 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 12 }}>
            <span style={{ color: 'var(--text2)' }}>Recebido <strong style={{ color: 'var(--accent)' }}>{fmt(totalRecebido)}</strong></span>
            <span style={{ color: 'var(--text2)' }}>A receber <strong style={{ color: 'var(--amber)' }}>{fmt(aReceber)}</strong></span>
          </div>
        )}
      </div>

      {/* Banner de recorrentes pendentes */}
      {pendentes.length > 0 && (
        <div className="card" style={{ marginBottom: 16, background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <RefreshCw size={18} color="var(--accent2)" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                {pendentes.length} {pendentes.length === 1 ? 'entrada recorrente' : 'entradas recorrentes'} para lançar
              </p>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                {pendentes.map(p => p.descricao).join(', ')} — total {fmt(pendentes.reduce((s, p) => s + Number(p.valor), 0))}
              </p>
            </div>
          </div>
          <button onClick={lancarRecorrentes} disabled={lancando}
            style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne', opacity: lancando ? 0.6 : 1 }}>
            {lancando ? 'Lançando...' : `Lançar em ${format(mes, 'MMMM', { locale: ptBR })}`}
          </button>
        </div>
      )}

      {loading ? <div className="empty-state">Carregando...</div> : entradas.length === 0 ? (
        <div className="empty-state">Nenhuma entrada neste mês</div>
      ) : entradas.map(e => (
        <div key={e.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: e.recebido ? 1 : 0.85 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button onClick={() => toggleRecebido(e)} title={e.recebido ? 'Recebido — desfazer' : 'Marcar como recebido'}
              style={{ width: 24, height: 24, borderRadius: '50%', border: `1.5px solid ${e.recebido ? 'var(--accent)' : 'var(--amber)'}`, background: e.recebido ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {e.recebido && <Check size={14} color="var(--on-accent)" />}
            </button>
            <span style={{ fontSize: 22 }}>{e.tipo === 'fixo' ? '💼' : '💰'}</span>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 500 }}>{e.descricao}</p>
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                {fmtData(e.data, 'dd/MM')} · {e.recebido ? 'Recebido' : 'A receber'} · {e.usuarios?.nome?.split(' ')[0]}
                {e.recorrente && <span style={{ marginLeft: 6, verticalAlign: 'middle' }}><RefreshCw size={10} /></span>}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ color: e.recebido ? 'var(--accent)' : 'var(--amber)', fontWeight: 700, fontFamily: 'Syne' }}>{fmt(e.valor)}</span>
            <button onClick={() => editar(e)}><Pencil size={14} color="var(--text3)" /></button>
            <button onClick={() => excluir(e.id)}><Trash2 size={15} color="var(--text3)" /></button>
          </div>
        </div>
      ))}

      <button onClick={abrirNovo} style={{ position: 'fixed', bottom: 80, right: 20, width: 56, height: 56, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px rgba(16,185,129,0.35)', zIndex: 50 }}>
        <Plus size={24} />
      </button>

      {modal && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>{editando ? 'Editar entrada' : 'Nova entrada'}</h2>
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
