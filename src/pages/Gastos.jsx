import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Layers, CalendarCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BotaoVoz from '../components/BotaoVoz'
import SwipeRow from '../components/SwipeRow'
import { useCategorias } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { fmt, fmtData, hojeISO } from '../lib/format'
import { EmptyState } from '../components/ui'
import Joca from '../components/Joca'
import { copy } from '../copy/pt-BR'

const novoForm = () => ({ descricao: '', valor: '', categoria: 'outros', tipo_pagamento: 'cartao', cartao_id: '', parcelado: false, num_parcelas: '', parcelas_pagas: '', data: hojeISO(), de_terceiro: false, pessoa_nome: '', reembolso_status: null, observacao: '', assinatura: false })

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
  const [pessoas, setPessoas] = useState([])
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(novoForm())
  const [salvando, setSalvando] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (perfil?.grupo_id) { carregar(); carregarCartoes(); carregarPessoas() } }, [perfil, mes])

  async function carregar() {
    setLoading(true)
    setVerTodos(false)
    const gid = perfil.grupo_id
    const inicio = format(startOfMonth(mes), 'yyyy-MM-dd')
    const fim = format(endOfMonth(mes), 'yyyy-MM-dd')

    const [{ data: gastos }, { data: parcelas }] = await Promise.all([
      supabase.from('gastos').select('*, cartoes(nome), usuarios(nome), pessoas(nome)').eq('grupo_id', gid).gte('data', inicio).lte('data', fim),
      supabase.from('parcelas').select('*, parcelamentos(descricao, categoria, num_parcelas, cartoes(nome), usuarios(nome))').eq('grupo_id', gid).gte('data_vencimento', inicio).lte('data_vencimento', fim),
    ])

    const gastosItens = (gastos || []).map(g => ({
      id: 'g-' + g.id, rawId: g.id, tipo: 'gasto',
      descricao: g.descricao, valor: Number(g.valor), categoria: g.categoria, data: g.data, criado: g.criado_em || '',
      observacao: g.observacao || '',
      tipo_pagamento: g.tipo_pagamento, cartao_id: g.cartao_id,
      origem: g.cartoes?.nome || g.tipo_pagamento, pessoa: g.usuarios?.nome?.split(' ')[0],
      pessoa_id: g.pessoa_id, terceiro: g.pessoa_id ? (g.pessoas?.nome || 'alguém') : null, reembolso_status: g.reembolso_status,
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

  async function carregarPessoas() {
    const { data } = await supabase.from('pessoas').select('id, nome').eq('grupo_id', perfil.grupo_id).order('nome')
    setPessoas(data || [])
  }

  function abrirNovo() {
    setEditando(null); setForm(novoForm()); setModal(true)
  }

  function editarGasto(it) {
    setEditando(it.rawId)
    setForm({
      descricao: it.descricao, valor: String(it.valor), categoria: it.categoria,
      tipo_pagamento: it.tipo_pagamento || 'cartao', cartao_id: it.cartao_id || '',
      parcelado: false, num_parcelas: '', parcelas_pagas: '', data: it.data,
      de_terceiro: !!it.terceiro, pessoa_nome: it.terceiro && it.terceiro !== 'alguém' ? it.terceiro : '',
      reembolso_status: it.reembolso_status || null,
      observacao: it.observacao || '', assinatura: false,
    })
    setModal(true)
  }

  function fecharModal() {
    setModal(false); setEditando(null); setForm(novoForm())
  }

  // Resolve a pessoa do "gasto de terceiro": usa uma já cadastrada (match por nome) ou cria.
  // Retorna o id da pessoa, ou null se não for gasto de terceiro / nome vazio.
  async function resolverPessoaId() {
    const nome = (form.pessoa_nome || '').trim()
    if (!form.de_terceiro || !nome) return null
    const existe = pessoas.find(p => p.nome.toLowerCase() === nome.toLowerCase())
    if (existe) return existe.id
    const { data } = await run(
      supabase.from('pessoas').insert({ grupo_id: perfil.grupo_id, nome }).select('id').single(),
      { erro: 'Não foi possível salvar a pessoa' }
    )
    if (data?.id) carregarPessoas()
    return data?.id || null
  }

  async function salvar() {
    if (!form.descricao || !form.valor) { toast('Preencha descrição e valor.', 'erro'); return }
    const valor = parseFloat(form.valor)
    if (!(valor > 0)) { toast('Informe um valor válido.', 'erro'); return }
    setSalvando(true)

    // Nova assinatura mensal (repete todo mês) — cria em `assinaturas`, não em `gastos`.
    if (!editando && form.assinatura && !form.parcelado) {
      const dia = form.data ? Number(form.data.split('-')[2]) : null
      const { error } = await run(
        supabase.from('assinaturas').insert({
          grupo_id: perfil.grupo_id, nome: form.descricao, valor,
          dia_cobranca: dia || null, cartao_id: form.cartao_id || null, categoria: form.categoria,
        }),
        { ok: 'Assinatura criada' }
      )
      setSalvando(false)
      if (error) return
      fecharModal(); carregar(); return
    }

    // Edição: só gastos à vista
    if (editando) {
      const pessoaId = await resolverPessoaId()
      const patch = {
        descricao: form.descricao, valor, categoria: form.categoria,
        tipo_pagamento: form.tipo_pagamento, cartao_id: form.cartao_id || null, data: form.data,
        pessoa_id: pessoaId, observacao: form.observacao || null,
      }
      if (pessoaId) {
        patch.reembolso_status = form.reembolso_status || 'pendente' // preserva "quitado" se já estava
      } else {
        patch.reembolso_status = null
        patch.reembolso_quitado_em = null
      }
      const { error } = await run(
        supabase.from('gastos').update(patch).eq('id', editando),
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
      const pessoaId = await resolverPessoaId()
      const { error } = await run(
        supabase.from('gastos').insert({
          descricao: form.descricao, valor, categoria: form.categoria,
          tipo_pagamento: form.tipo_pagamento, cartao_id: form.cartao_id || null,
          data: form.data, grupo_id: perfil.grupo_id, usuario_id: perfil.id,
          pessoa_id: pessoaId, reembolso_status: pessoaId ? 'pendente' : null,
          observacao: form.observacao || null,
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

  // Gastos de terceiro (a receber) são neutros: não entram no total do mês.
  const total = itens.reduce((s, it) => s + (it.terceiro ? 0 : it.valor), 0)
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
        <SwipeRow key={it.id} style={{ marginBottom: 8 }}
          onEdit={it.tipo === 'gasto' ? () => editarGasto(it) : undefined}
          onDelete={it.tipo === 'gasto' ? () => excluir(it.rawId) : undefined}>
        <div className="card" style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                {it.terceiro && (
                  <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg3)', color: 'var(--amber-text)', padding: '1px 7px', borderRadius: 10 }}>
                    {it.reembolso_status === 'quitado' ? 'recebido' : 'a receber'} · {it.terceiro}
                  </span>
                )}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                {fmtData(it.data, 'dd/MM')} · {it.origem} · {it.pessoa}
              </p>
              {it.observacao && (
                <p style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                  {it.observacao}
                </p>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: it.terceiro ? 'var(--text3)' : 'var(--red-text)', fontWeight: 700, fontFamily: 'Syne' }}>{fmt(it.valor)}</span>
            {it.tipo === 'gasto' ? <ChevronLeft size={14} color="var(--border2)" /> : <Layers size={15} color="var(--text3)" />}
          </div>
        </div>
        </SwipeRow>
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
              <div className="form-group"><label>{form.parcelado ? 'Valor total' : 'Valor'}</label><input type="number" inputMode="decimal" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" /></div>
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

            {/* Assinatura: repete todo mês (cria em Assinaturas, não um gasto único) */}
            {!editando && !form.parcelado && (
              <div style={{ marginBottom: form.assinatura ? 10 : 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>
                  <input type="checkbox" checked={form.assinatura} onChange={e => setForm(p => ({ ...p, assinatura: e.target.checked, de_terceiro: false }))} />
                  É uma assinatura (repete todo mês)
                </label>
                {form.assinatura && (
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>
                    Vai pra tela de Assinaturas e, se tiver cartão, entra sozinha na fatura todo mês — não precisa lançar de novo.
                  </span>
                )}
              </div>
            )}

            {/* Gasto de outra pessoa (a receber) — só faz sentido à vista e não-assinatura */}
            {!form.parcelado && !form.assinatura && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>
                  <input type="checkbox" checked={form.de_terceiro} onChange={e => setForm(p => ({ ...p, de_terceiro: e.target.checked }))} />
                  Foi de outra pessoa (vão me pagar)
                </label>
                {form.de_terceiro && (
                  <div className="form-group" style={{ marginTop: 10 }}>
                    <input list="pessoas-lista" value={form.pessoa_nome} onChange={e => setForm(p => ({ ...p, pessoa_nome: e.target.value }))} placeholder="Quem vai pagar (ex: Pai)" />
                    <datalist id="pessoas-lista">{pessoas.map(p => <option key={p.id} value={p.nome} />)}</datalist>
                    <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>
                      Esse valor não entra nos seus gastos — fica em “A receber” até você marcar como recebido.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Toggle à vista / parcelado — só ao criar (edição é só de gasto à vista) */}
            {!editando && !form.assinatura && (
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
                        <input type="number" inputMode="decimal" min="2" value={form.num_parcelas} onChange={e => setForm(p => ({ ...p, num_parcelas: e.target.value }))} placeholder="Ex: 12" />
                      </div>
                      <div className="form-group">
                        <label>Já paguei</label>
                        <input type="number" inputMode="decimal" min="0" max={nParcelas >= 2 ? nParcelas - 1 : undefined} value={form.parcelas_pagas} onChange={e => setForm(p => ({ ...p, parcelas_pagas: e.target.value }))} placeholder="0" />
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

            {!form.assinatura && (
              <div className="form-group">
                <label>Observação (opcional)</label>
                <textarea value={form.observacao} onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))}
                  rows={2} placeholder="Ex: dividido com a Lari, garantia até 2027..."
                  style={{ resize: 'vertical', minHeight: 44 }} />
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
