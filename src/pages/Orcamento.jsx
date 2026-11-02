import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Target, Pencil, Trash2 } from 'lucide-react'
import { useCategorias } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { fmt } from '../lib/format'

export default function Orcamento() {
  const { perfil } = useAuth()
  const { categorias, emojiDe } = useCategorias()
  const run = useDb()
  const [mes, setMes] = useState(new Date())
  const [orcamentos, setOrcamentos] = useState([])
  const [gastosPorCat, setGastosPorCat] = useState({})
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { categoria, valor }

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil, mes])

  async function carregar() {
    setLoading(true)
    const gid = perfil.grupo_id
    const inicio = format(startOfMonth(mes), 'yyyy-MM-dd')
    const fim = format(endOfMonth(mes), 'yyyy-MM-dd')
    const [{ data: orc }, { data: gastos }] = await Promise.all([
      supabase.from('orcamentos').select('*').eq('grupo_id', gid),
      supabase.from('gastos').select('categoria, valor').eq('grupo_id', gid).gte('data', inicio).lte('data', fim),
    ])
    const porCat = {}
    ;(gastos||[]).forEach(g => { porCat[g.categoria] = (porCat[g.categoria]||0) + Number(g.valor) })
    setOrcamentos(orc || [])
    setGastosPorCat(porCat)
    setLoading(false)
  }

  async function salvar() {
    if (!modal?.categoria || !modal.valor) return
    const { error } = await run(
      supabase.from('orcamentos').upsert(
        { grupo_id: perfil.grupo_id, categoria: modal.categoria, valor: parseFloat(modal.valor) },
        { onConflict: 'grupo_id,categoria' }
      ),
      { ok: 'Teto definido' }
    )
    if (error) return
    setModal(null); carregar()
  }

  async function excluir(categoria) {
    const { error } = await run(
      supabase.from('orcamentos').delete().eq('grupo_id', perfil.grupo_id).eq('categoria', categoria),
      { ok: 'Teto removido' }
    )
    if (!error) carregar()
  }

  const mapOrc = Object.fromEntries(orcamentos.map(o => [o.categoria, Number(o.valor)]))
  const totalOrcado = orcamentos.reduce((s,o) => s + Number(o.valor), 0)
  const totalGasto = Object.values(gastosPorCat).reduce((s,v) => s + v, 0)
  // categorias a exibir: as orçadas + as que tiveram gasto
  const cats = Array.from(new Set([...orcamentos.map(o=>o.categoria), ...Object.keys(gastosPorCat)]))
    .sort((a,b) => (gastosPorCat[b]||0) - (gastosPorCat[a]||0))
  const semOrcamento = categorias.map(c => c.nome).filter(c => !(c in mapOrc))

  function corBarra(pct) {
    if (pct >= 100) return 'var(--red)'
    if (pct >= 80) return 'var(--amber)'
    return 'var(--accent)'
  }

  if (loading) return <div className="empty-state">Carregando...</div>

  return (
    <div>
      {/* Navegação de mês */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <button onClick={() => setMes(m => subMonths(m,1))}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h2 style={{ fontSize:16, textTransform:'capitalize' }}>{format(mes, 'MMMM yyyy', { locale: ptBR })}</h2>
        <button onClick={() => setMes(m => addMonths(m,1))}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      {/* Resumo do orçamento */}
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <Target size={18} color="var(--accent)" />
          <p style={{ fontWeight:600, fontFamily:'Syne', fontSize:15 }}>Orçamento do mês</p>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ fontSize:13, color:'var(--text2)' }}>Gasto {fmt(totalGasto)} de {fmt(totalOrcado)}</span>
          <span style={{ fontSize:13, fontWeight:600, color: totalGasto>totalOrcado?'var(--red)':'var(--accent)' }}>
            {totalOrcado>0 ? Math.round((totalGasto/totalOrcado)*100) : 0}%
          </span>
        </div>
        <div style={{ background:'var(--bg3)', borderRadius:6, height:10, overflow:'hidden' }}>
          <div style={{ width:`${Math.min(100,totalOrcado>0?(totalGasto/totalOrcado)*100:0)}%`, height:'100%', background: corBarra(totalOrcado>0?(totalGasto/totalOrcado)*100:0), borderRadius:6, transition:'width 0.4s' }} />
        </div>
        {totalOrcado>0 && totalGasto<=totalOrcado && (
          <p style={{ fontSize:12, color:'var(--text2)', marginTop:8 }}>Sobra {fmt(totalOrcado-totalGasto)} no orçamento</p>
        )}
        {totalGasto>totalOrcado && totalOrcado>0 && (
          <p style={{ fontSize:12, color:'var(--red)', marginTop:8 }}>Estourou {fmt(totalGasto-totalOrcado)}</p>
        )}
      </div>

      {/* Por categoria */}
      {cats.length === 0 && <div className="empty-state">Defina um teto por categoria para começar</div>}
      {cats.map(cat => {
        const limite = mapOrc[cat]
        const gasto = gastosPorCat[cat] || 0
        const pct = limite ? Math.round((gasto/limite)*100) : null
        return (
          <div key={cat} className="card" style={{ marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: limite?10:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:20 }}>{emojiDe(cat)}</span>
                <div>
                  <p style={{ fontSize:14, fontWeight:500, textTransform:'capitalize' }}>{cat}</p>
                  <p style={{ fontSize:12, color:'var(--text2)' }}>
                    {fmt(gasto)}{limite ? ` de ${fmt(limite)}` : ' · sem teto'}
                  </p>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {limite && <span style={{ fontSize:13, fontWeight:700, fontFamily:'Syne', color: corBarra(pct) }}>{pct}%</span>}
                <button onClick={() => setModal({ categoria:cat, valor: limite ? String(limite) : '' })}><Pencil size={15} color="var(--text3)" /></button>
                {limite && <button onClick={() => excluir(cat)}><Trash2 size={15} color="var(--text3)" /></button>}
              </div>
            </div>
            {limite && (
              <div style={{ background:'var(--bg3)', borderRadius:4, height:7, overflow:'hidden' }}>
                <div style={{ width:`${Math.min(100,pct)}%`, height:'100%', background: corBarra(pct), borderRadius:4, transition:'width 0.4s' }} />
              </div>
            )}
          </div>
        )
      })}

      {/* Adicionar teto para categorias sem orçamento */}
      {semOrcamento.length > 0 && (
        <div style={{ marginTop:16 }}>
          <p style={{ fontSize:13, color:'var(--text2)', marginBottom:10 }}>Definir teto para:</p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {semOrcamento.map(c => (
              <button key={c} onClick={() => setModal({ categoria:c, valor:'' })}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:20, border:'1px solid var(--border2)', background:'var(--bg2)', fontSize:13 }}>
                {emojiDe(c)} {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal definir teto */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize:18, marginBottom:4, textTransform:'capitalize' }}>{emojiDe(modal.categoria)} {modal.categoria}</h2>
            <p style={{ fontSize:13, color:'var(--text2)', marginBottom:20 }}>Teto mensal para esta categoria</p>
            <div className="form-group">
              <label>Limite mensal (R$)</label>
              <input type="number" autoFocus value={modal.valor} onChange={e => setModal(m => ({ ...m, valor:e.target.value }))} placeholder="0,00" />
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
