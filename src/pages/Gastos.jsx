import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Trash2, Layers, Pencil, CalendarCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BotaoVoz from '../components/BotaoVoz'
import { useCategorias } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { fmt, fmtData, hojeISO } from '../lib/format'
import { EmptyState } from '../components/ui'
import Joca from '../components/Joca'
import { copy } from '../copy/pt-BR'

const novoForm = () => ({ descricao: '', valor: '', categoria: 'outros', tipo_pagamento: 'cartao', cartao_id: '', parcelado: false, num_parcelas: '', parcelas_pagas: '', data: hojeISO() })

export default function Gastos() {
  const { perfil } = useAuth()
  const { categorias, emojiDe } = useCategorias()
  const run = useDb()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [mes, setMes] = useState(new Date())
  const [itens, setItens] = useState([])
  const [verTodos, setVerTodos] = useState(false)
  const [cartoes, setCartoes] = useState([])
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(novoForm())
  const [salvando, setSalvando] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (perfil?.grupo_id) { carregar(); carregarCartoes() } }, [perfil, mes])

  async function carregar() {
    setLoading(true)
    setVerTodos(false)
    const gid = perfil.grupo_id
    const inicio = format(startOfMonth(mes), 'yyyy-MM-dd')
    const fim = format(endOfMonth(mes), 'yyyy-MM-dd')

    const [{ data: gastos }, { data: parcelas }] = await Promise.all([
      supabase.from('gastos').select('*, cartoes(nome), usuarios(nome)').eq('grupo_id', gid).gte('data', inicio).lte('data', fim),
      supabase.from('parcelas').select('*, parcelamentos(descricao, categoria, num_parcelas, cartoes(nome), usuarios(nome))').eq('grupo_id', gid).gte('data_vencimento', inicio).lte('data_vencimento', fim),
    ])

    const gastosItens = (gastos || []).map(g => ({
      id: 'g-' + g.id, rawId: g.id, tipo: 'gasto',
      descricao: g.descricao, valor: Number(g.valor), categoria: g.categoria, data: g.data, criado: g.criado_em || '',
      tipo_pagamento: g.tipo_pagamento, cartao_id: g.cartao_id,
      origem: g.cartoes?.nome || g.tipo_pagamento, pessoa: g.usuarios?.nome?.split(' ')[0],
    }))
    const parcelasItens = (parcelas || []).map(p => ({
      id: 'p-' + p.id, tipo: 'parcela',
      descricao: p.parcelamentos?.descricao, valor: Number(p.valor), categoria: p.parcelamentos?.categoria, data: p.data_vencimento,
      origem: p.parcelamentos?.cartoes?.nome || 'Parcelado', pessoa: p.parcelamentos?.usuarios?.nome?.split(' ')[0],
      numero: p.numero, totalParcelas: p.parcelamentos?.num_parcelas, criado: p.criado_em || '',
    }))

    // Os ÚLTIMOS LANÇADOS aparecem primeiro (pelo momento em que foram lançados). A data do gasto continua
    // aparecendo em cada linha; em caso de empate, vale a data mais recente.
    setItens([...gastosItens, ...parcelasItens].sort((a, b) => (b.criado || '').localeCompare(a.criado || '') || b.data.localeCompare(a.data)))
    setLoading(false)
  }

  async function carregarCartoes() {
    const { data } = await supabase.from('cartoes').select('id, nome').eq('grupo_id', perfil.grupo_id).eq('ativo', true)
    setCartoes(data || [])
  }

  function abrirNovo() {
    setEditando(null); setForm(novoForm()); setModal(true)
  }

  function editarGasto(it) {
    setEditando(it.rawId)
    setForm({
      descricao: it.descricao, valor: String(it.valor), categoria: it.categoria,
      tipo_pagamento: it.tipo_pagamento || 'cartao', cartao_id: it.cartao_id || '',
      parcelado: false, num_parcelas: '', data: it.data,
    })
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

    // Edição: só gastos à vista
    if (editando) {
      const { error } = await run(
        supabase.from('gastos').update({
          descricao: form.descricao, valor, categoria: form.categoria,
          tipo_pagamento: form.tipo_pagamento, cartao_id: form.cartao_id || null, data: form.data,
        }).eq('id', editando),
        { ok: 'Gasto atualizado' }
      )
      setSalvando(false)
      if (error) return
      fecharModal(); carregar(); return
    }

    if (form.parcelado) {
      const n = parseInt(form.num_parcelas)
      if (!n || n < 2) { setSalvando(false); toast('Para parcelar, informe 2 ou mais parcelas.', 'erro'); return }
      let pagas = parseInt(form.parcelas_pagas) || 0
      if (pagas < 0) pagas = 0
      if (pagas > n - 1) pagas = n - 1 // deixa ao menos 1 parcela em aberto
      const vParcela = parseFloat((valor / n).toFixed(2))
      // Quando já há parcelas pagas, a data informada é a da PRÓXIMA parcela (nº pagas+1).
      // Retrocede `pagas` meses pra achar a data da 1ª parcela, que o trigger usa como base.
      let dataPrimeira = form.data
      if (pagas > 0) {
        const [yy, mm, dd] = form.data.split('-').map(Number)
        const prim = subMonths(new Date(yy, mm - 1, dd), pagas)
        dataPrimeira = `${prim.getFullYear()}-${String(prim.getMonth() + 1).padStart(2, '0')}-${String(prim.getDate()).padStart(2, '0')}`
      }
      const { error } = await run(
        supabase.from('parcelamentos').insert({
          descricao: form.descricao, valor_total: valor, num_parcelas: n, valor_parcela: vParcela,
          cartao_id: form.cartao_id || null, categoria: form.categoria,
          data_primeira_parcela: dataPrimeira, parcelas_pagas: pagas,
          grupo_id: perfil.grupo_id, usuario_id: perfil.id,
        }),
        { ok: `Parcelamento criado (${n}x)` }
      )
      setSalvando(false)
      if (error) return
    } else {
      const { error } = await run(
        supabase.from('gastos').insert({
          descricao: form.descricao, valor, categoria: form.categoria,
          tipo_pagamento: form.tipo_pagamento, cartao_id: form.cartao_id || null,
          data: form.data, grupo_id: perfil.grupo_id, usuario_id: perfil.id,
        }),
        { ok: 'Gasto adicionado' }
      )
      setSalvando(false)
      if (error) return
    }
    fecharModal(); carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir este gasto?')) return
    const { error } = await run(supabase.from('gastos').delete().eq('id', id), { ok: 'Gasto excluído' })
    if (!error) carregar()
  }

  const total = itens.reduce((s, it) => s + it.valor, 0)
  const nParcelas = parseInt(form.num_parcelas)
  const ehCartao = form.tipo_pagamento === 'cartao'

  return (
    <div>
      {/* Navegação de mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={() => setMes(m => subMonths(m, 1))}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h2 style={{ fontSize: 16 }}>{format(mes, 'MMMM yyyy', { locale: ptBR })}</h2>
        <button onClick={() => setMes(m => addMonths(m, 1))}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      {/* Total — clica para ver tudo que vence no mês */}
      <button onClick={() => navigate('/contas-do-mes')} className="card" style={{ width: '100%', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', background: 'var(--bg2)', color: 'var(--text)' }}>
        <span style={{ color: 'var(--text2)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <CalendarCheck size={15} color="var(--accent)" /> Gastos + parcelas do mês
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20, color: 'var(--red-text)' }}>{fmt(total)}</span>
          <ChevronRight size={16} color="var(--text3)" />
        </span>
      </button>

      {/* Lista */}
      {loading ? <div className="empty-state">Carregando...</div> : itens.length === 0 ? (
        <EmptyState ilustracao={<Joca pose="anotando" tamanho={150} />} titulo={copy.mascote.vazios.gastosTitulo} texto={copy.mascote.vazios.gastosTexto} />
      ) : (verTodos ? itens : itens.slice(0, 10)).map(it => (
        <div key={it.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{emojiDe(it.categoria)}</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                {it.descricao}
                {it.tipo === 'parcela' && (
                  <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg3)', color: 'var(--blue-text)', padding: '1px 7px', borderRadius: 10 }}>
                    {it.numero}/{it.totalParcelas}x
                  </span>
                )}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                {fmtData(it.data, 'dd/MM')} · {it.origem} · {it.pessoa}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--red-text)', fontWeight: 700, fontFamily: 'Syne' }}>{fmt(it.valor)}</span>
            {it.tipo === 'gasto' ? (
              <>
                <button onClick={() => editarGasto(it)}><Pencil size={14} color="var(--text3)" /></button>
                <button onClick={() => excluir(it.rawId)}><Trash2 size={15} color="var(--text3)" /></button>
              </>
            ) : <Layers size={15} color="var(--text3)" />}
          </div>
        </div>
      ))}

      {/* Ver todos / ver menos */}
      {!loading && itens.length > 10 && (
        <button onClick={() => setVerTodos(v => !v)}
          style={{ width: '100%', padding: '10px', marginTop: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 600 }}>
          {verTodos ? 'Ver menos' : `Ver todos (${itens.length})`}
        </button>
      )}

      {/* Botão adicionar manual */}
      <button onClick={abrirNovo} style={{ position: 'fixed', bottom: 88, left: 88, width: 44, height: 44, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <Plus size={22} color="var(--text)" />
      </button>

      <BotaoVoz onSalvo={carregar} />

      {/* Modal novo/editar gasto */}
      {modal && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>{editando ? 'Editar gasto' : 'Novo gasto'}</h2>
            <div className="form-group"><label>Descrição</label><input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Mercado Extra" /></div>
            <div className="form-row">
              <div className="form-group"><label>{form.parcelado ? 'Valor total' : 'Valor'}</label><input type="number" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>{form.parcelado ? ((parseInt(form.parcelas_pagas) || 0) > 0 ? 'Próxima parcela em' : '1ª parcela em') : 'Data'}</label><input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Categoria</label>
                <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                  {categorias.map(c => <option key={c.nome} value={c.nome}>{c.emoji} {c.nome}</option>)}
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

            {ehCartao && (
              <div className="form-group">
                <label>Cartão</label>
                <select value={form.cartao_id} onChange={e => setForm(p => ({ ...p, cartao_id: e.target.value }))}>
                  <option value="">Selecione</option>
                  {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}

            {/* Toggle à vista / parcelado — só ao criar (edição é só de gasto à vista) */}
            {!editando && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['À vista', false], ['Parcelado', true]].map(([label, val]) => (
                    <button key={label} onClick={() => setForm(p => ({ ...p, parcelado: val }))}
                      style={{ flex: 1, padding: '9px', borderRadius: 'var(--radius-sm)', border: `1px solid ${form.parcelado === val ? 'var(--accent)' : 'var(--border)'}`, background: form.parcelado === val ? 'var(--accent-dim)' : 'transparent', color: form.parcelado === val ? 'var(--accent2)' : 'var(--text2)', fontSize: 13, fontWeight: 600 }}>
                      {label}
                    </button>
                  ))}
                </div>
                {form.parcelado && (
                  <div style={{ marginTop: 12 }}>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Nº de parcelas</label>
                        <input type="number" min="2" value={form.num_parcelas} onChange={e => setForm(p => ({ ...p, num_parcelas: e.target.value }))} placeholder="Ex: 12" />
                      </div>
                      <div className="form-group">
                        <label>Já paguei</label>
                        <input type="number" min="0" max={nParcelas >= 2 ? nParcelas - 1 : undefined} value={form.parcelas_pagas} onChange={e => setForm(p => ({ ...p, parcelas_pagas: e.target.value }))} placeholder="0" />
                      </div>
                    </div>
                    {form.valor && nParcelas >= 2 && (
                      <p style={{ fontSize: 13, color: 'var(--accent2)', marginTop: -4 }}>
                        {nParcelas}x de {fmt(parseFloat(form.valor) / nParcelas)}
                        {(parseInt(form.parcelas_pagas) || 0) > 0 && <span style={{ color: 'var(--text3)' }}> · faltam {nParcelas - (parseInt(form.parcelas_pagas) || 0)}</span>}
                        {!ehCartao && <span style={{ color: 'var(--text3)' }}> · via {form.tipo_pagamento}</span>}
                      </p>
                    )}
                    {(parseInt(form.parcelas_pagas) || 0) > 0 && (
                      <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 4, lineHeight: 1.4 }}>
                        Já pagou {parseInt(form.parcelas_pagas) || 0} de {nParcelas || '—'}? Informe acima a data da <strong>próxima</strong> parcela — as já pagas entram marcadas.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

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
