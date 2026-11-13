import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Pencil, X, Check, ArrowRight, Undo2 } from 'lucide-react'
import { addMonths, subMonths, getDaysInMonth, format } from 'date-fns'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { useCategorias } from '../hooks/useCategorias'
import { fmt, fmtData, parseDataLocal, hojeISO } from '../lib/format'

const bandeiras = { Visa: '💙', Mastercard: '🔴', Elo: '🟡', Amex: '🟢', Hipercard: '🔵' }
// Paleta fixa de cores do cartão (identificação visual). Null = usa o accent.
const CORES = ['#8B5CF6', '#3B82F6', '#14B8A6', '#10B981', '#F97316', '#EF4444', '#EC4899', '#64748B']
const novoForm = () => ({ nome: '', bandeira: 'Visa', cor: '', dia_fechamento: '', dia_vencimento: '', limite: '', alerta_dias: 3, fatura_inicial: '' })

// Calcula fatura atual e próxima de um cartão a partir de gastos, parcelas e assinaturas
function calcularFaturas(card, gastos, parcelas, assinaturas, hoje) {
  const diaF = card.dia_fechamento || 1
  const diaV = card.dia_vencimento || 10
  const clampDay = (y, m, d) => Math.min(d, getDaysInMonth(new Date(y, m, 1)))
  const fechamento = ref => { const y = ref.getFullYear(), m = ref.getMonth(); return new Date(y, m, clampDay(y, m, diaF)) }

  let fechaAtual = fechamento(hoje)
  let abreAtual
  if (hoje <= fechaAtual) { abreAtual = fechamento(subMonths(hoje, 1)) }
  else { abreAtual = fechaAtual; fechaAtual = fechamento(addMonths(hoje, 1)) }

  const vencDe = fecha => {
    const y = fecha.getFullYear(), m = fecha.getMonth()
    let v = new Date(y, m, clampDay(y, m, diaV))
    if (diaV <= diaF) v = addMonths(v, 1)
    return v
  }
  const abreProx = fechaAtual
  const fechaProx = fechamento(addMonths(fechaAtual, 1))
  const vencAtual = vencDe(fechaAtual)
  const vencProx = vencDe(fechaProx)

  const inCycle = (d, abre, fecha) => d > abre && d <= fecha
  const sameMonth = (d, ref) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  // Itens (gastos + parcelas) que compõem a fatura de um ciclo.
  const itensDe = (abre, fecha, venc) => {
    const gs = gastos
      .filter(g => g.cartao_id === card.id && inCycle(parseDataLocal(g.data), abre, fecha))
      .map(g => ({ tipo: 'gasto', descricao: g.descricao, categoria: g.categoria, valor: Number(g.valor), data: g.data }))
    const ps = parcelas
      .filter(p => p.cartao_id === card.id && sameMonth(parseDataLocal(p.data_vencimento), venc))
      .map(p => ({ tipo: 'parcela', id: p.id, descricao: p.descricao, valor: Number(p.valor), data: p.data_vencimento, numero: p.numero, total: p.total }))
    return [...gs, ...ps].sort((a, b) => b.data.localeCompare(a.data))
  }
  // Assinaturas vinculadas ao cartão: cobrança mensal recorrente, entra em todo ciclo.
  const assinItens = assinaturas
    .filter(a => a.cartao_id === card.id)
    .map(a => ({ tipo: 'assinatura', descricao: a.nome, valor: Number(a.valor), diaCobranca: a.dia_cobranca, recorrente: true }))
  const atualItens = [...assinItens, ...itensDe(abreAtual, fechaAtual, vencAtual)]
  const proxItens = [...assinItens, ...itensDe(abreProx, fechaProx, vencProx)]
  const soma = arr => arr.reduce((s, x) => s + x.valor, 0)

  return {
    atual: soma(atualItens), atualItens, vencAtual,
    prox: soma(proxItens), proxItens, vencProx,
  }
}

// Últimos 6 meses de faturas de um cartão, para as barrinhas de histórico.
// Status: 'paga' (verde), 'vencida' não paga (vermelho), 'aberta'/'futura' (neutro).
function historicoFaturas(card, hoje, faturasPagas) {
  const diaV = card.dia_vencimento || 10
  const out = []
  for (let k = 5; k >= 0; k--) {
    const ref = subMonths(hoje, k)
    const y = ref.getFullYear(), m = ref.getMonth()
    const venc = new Date(y, m, Math.min(diaV, getDaysInMonth(new Date(y, m, 1))))
    const competencia = format(venc, 'yyyy-MM')
    const pagoRow = faturasPagas.find(p => p.referencia_id === card.id && p.competencia === competencia)
    let status = 'futura'
    if (pagoRow?.pago) status = 'paga'
    else if (venc < hoje) status = 'vencida'
    else if (venc.getFullYear() === hoje.getFullYear() && venc.getMonth() === hoje.getMonth()) status = 'aberta'
    out.push({ competencia, venc, status, valor: pagoRow?.valor, pagoRow })
  }
  return out
}

const CORES_HIST = { paga: 'var(--accent)', vencida: 'var(--red)', aberta: 'var(--amber)', futura: 'var(--border2)' }

export default function Cartoes() {
  const { perfil } = useAuth()
  const run = useDb()
  const { toast } = useToast()
  const { emojiDe } = useCategorias()
  const [detalhe, setDetalhe] = useState(null)   // { card, f }
  const [histSel, setHistSel] = useState(null)    // { card, h } — barrinha do histórico clicada
  const [cartoes, setCartoes] = useState([])
  const [gastos, setGastos] = useState([])
  const [parcelas, setParcelas] = useState([])
  const [assinaturas, setAssinaturas] = useState([])
  const [faturasPagas, setFaturasPagas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(novoForm())
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    setLoading(true)
    const gid = perfil.grupo_id
    const [{ data: cs }, { data: gs }, { data: ps }, { data: as }, { data: fp }] = await Promise.all([
      supabase.from('cartoes').select('*').eq('grupo_id', gid).order('nome'),
      supabase.from('gastos').select('valor, data, cartao_id, descricao, categoria').eq('grupo_id', gid).not('cartao_id', 'is', null),
      supabase.from('parcelas').select('id, valor, data_vencimento, numero, parcelamentos!inner(cartao_id, descricao, num_parcelas)').eq('grupo_id', gid).eq('paga', false),
      supabase.from('assinaturas').select('nome, valor, dia_cobranca, cartao_id').eq('grupo_id', gid).eq('ativo', true).not('cartao_id', 'is', null),
      supabase.from('contas_pagas').select('*').eq('grupo_id', gid).eq('tipo', 'fatura'),
    ])
    setCartoes(cs || [])
    setGastos(gs || [])
    setAssinaturas(as || [])
    setFaturasPagas(fp || [])
    setParcelas((ps || []).map(p => ({ id: p.id, valor: p.valor, data_vencimento: p.data_vencimento, cartao_id: p.parcelamentos?.cartao_id, descricao: p.parcelamentos?.descricao, numero: p.numero, total: p.parcelamentos?.num_parcelas })))
    setLoading(false)
  }

  // Marca a fatura atual como paga (competência do vencimento) e conclui as parcelas daquele mês.
  async function pagarFatura(card, f) {
    const competencia = format(f.vencAtual, 'yyyy-MM')
    if (!confirm(`Marcar a fatura de ${format(f.vencAtual, 'MM/yyyy')} (${fmt(f.atual)}) como paga?\nAs parcelas que vencem nesse mês entram como pagas.`)) return
    const { error } = await run(
      supabase.from('contas_pagas').upsert(
        { grupo_id: perfil.grupo_id, tipo: 'fatura', referencia_id: card.id, competencia, valor: f.atual, pago: true, data_pagamento: hojeISO() },
        { onConflict: 'tipo,referencia_id,competencia' }
      ),
      { ok: 'Fatura marcada como paga' }
    )
    if (error) return
    const ym = f.vencAtual.getFullYear() * 12 + f.vencAtual.getMonth()
    const idsMes = parcelas
      .filter(p => p.cartao_id === card.id && (() => { const d = parseDataLocal(p.data_vencimento); return d.getFullYear() * 12 + d.getMonth() === ym })())
      .map(p => p.id)
    if (idsMes.length) await supabase.from('parcelas').update({ paga: true }).in('id', idsMes)
    setDetalhe(null); carregar()
  }

  // Desfaz o pagamento registrado de uma fatura (não reabre parcelas automaticamente — faça isso em Parcelamentos).
  async function desfazerPagamento(pagoRow) {
    if (!pagoRow?.id) return
    const { error } = await run(supabase.from('contas_pagas').delete().eq('id', pagoRow.id), { ok: 'Pagamento desfeito' })
    if (!error) { setHistSel(null); carregar() }
  }

  // Joga uma parcela para a fatura seguinte (+1 mês no vencimento).
  async function moverParcela(parcelaId) {
    const p = parcelas.find(x => x.id === parcelaId)
    if (!p) return
    const nova = addMonths(parseDataLocal(p.data_vencimento), 1)
    const iso = `${nova.getFullYear()}-${String(nova.getMonth() + 1).padStart(2, '0')}-${String(nova.getDate()).padStart(2, '0')}`
    const { error } = await run(supabase.from('parcelas').update({ data_vencimento: iso }).eq('id', parcelaId), { ok: 'Parcela movida pra próxima fatura' })
    if (!error) { setDetalhe(null); carregar() }
  }

  function abrirNovo() {
    setEditando(null); setForm(novoForm()); setModal(true)
  }

  function editar(c) {
    setEditando(c.id)
    setForm({
      nome: c.nome, bandeira: c.bandeira || 'Visa', cor: c.cor || '',
      dia_fechamento: String(c.dia_fechamento ?? ''), dia_vencimento: String(c.dia_vencimento ?? ''),
      limite: c.limite != null ? String(c.limite) : '', alerta_dias: c.alerta_dias ?? 3,
      fatura_inicial: '',
    })
    setModal(true)
  }

  function fecharModal() {
    setModal(false); setEditando(null); setForm(novoForm())
  }

  async function salvar() {
    if (!form.nome || !form.dia_fechamento || !form.dia_vencimento) { toast('Preencha nome, fechamento e vencimento.', 'erro'); return }
    const payload = {
      nome: form.nome, bandeira: form.bandeira, cor: form.cor || null,
      dia_fechamento: parseInt(form.dia_fechamento), dia_vencimento: parseInt(form.dia_vencimento),
      limite: form.limite ? parseFloat(form.limite) : null, alerta_dias: parseInt(form.alerta_dias),
    }
    setSalvando(true)
    if (editando) {
      const { error } = await run(supabase.from('cartoes').update(payload).eq('id', editando), { ok: 'Cartão atualizado' })
      if (error) { setSalvando(false); return }
    } else {
      const { data, error } = await run(
        supabase.from('cartoes').insert({ ...payload, grupo_id: perfil.grupo_id }).select('id').single(),
        { ok: 'Cartão criado' }
      )
      if (error) { setSalvando(false); return }
      // Setup inicial: registra a fatura atual (fora parcelas) como um ajuste, pra já bater o valor.
      const fat = parseFloat(String(form.fatura_inicial).replace(',', '.'))
      if (data?.id && fat > 0) {
        await run(
          supabase.from('gastos').insert({
            grupo_id: perfil.grupo_id, usuario_id: perfil.id, cartao_id: data.id,
            descricao: 'Fatura atual (ajuste inicial)', valor: fat, categoria: 'outros', data: hojeISO(),
          }),
          { ok: 'Fatura inicial registrada' }
        )
      }
    }
    setSalvando(false)
    fecharModal(); carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir este cartão?')) return
    const { error } = await run(supabase.from('cartoes').delete().eq('id', id), { ok: 'Cartão excluído' })
    if (!error) carregar()
  }

  const hoje = new Date()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20 }}>Cartões</h2>
        <button onClick={abrirNovo} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--on-accent)', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> Novo
        </button>
      </div>

      {loading ? <div className="empty-state">Carregando...</div>
        : cartoes.length === 0 ? <div className="empty-state">Nenhum cartão cadastrado</div>
        : cartoes.map(c => {
          const f = calcularFaturas(c, gastos, parcelas, assinaturas, hoje)
          const ymAtual = f.vencAtual.getFullYear() * 12 + f.vencAtual.getMonth()
          const futuras = parcelas.filter(p => { if (p.cartao_id !== c.id) return false; const d = parseDataLocal(p.data_vencimento); return d.getFullYear() * 12 + d.getMonth() > ymAtual })
          const comprometidoFuturo = futuras.reduce((s, p) => s + Number(p.valor), 0)
          const comprometido = f.atual + comprometidoFuturo
          const usoPct = c.limite ? Math.min(100, Math.round((comprometido / Number(c.limite)) * 100)) : null
          const compAtual = format(f.vencAtual, 'yyyy-MM')
          const jaPaga = faturasPagas.some(p => p.referencia_id === c.id && p.competencia === compAtual && p.pago)
          const pagaEsteMes = f.vencAtual.getFullYear() === hoje.getFullYear() && f.vencAtual.getMonth() === hoje.getMonth()
          const hist = historicoFaturas(c, hoje, faturasPagas)
          return (
            <div key={c.id} className="card" style={{ marginBottom: 10, borderLeft: c.cor ? `4px solid ${c.cor}` : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20, width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.cor ? c.cor + '22' : 'var(--bg3)', flexShrink: 0 }}>{bandeiras[c.bandeira] || '💳'}</span>
                  <div>
                    <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 16 }}>{c.nome}</p>
                    <p style={{ fontSize: 12, color: 'var(--text2)' }}>{c.bandeira} · fecha dia {c.dia_fechamento} · vence dia {c.dia_vencimento}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => editar(c)}><Pencil size={15} color="var(--text3)" /></button>
                  <button onClick={() => excluir(c.id)}><Trash2 size={16} color="var(--text3)" /></button>
                </div>
              </div>

              {/* Fatura atual — clica para ver a composição */}
              <button onClick={() => setDetalhe({ card: c, f })} style={{ width: '100%', textAlign: 'left', marginTop: 14, padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg3)', color: 'var(--text)', border: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    Fatura atual · vence {format(f.vencAtual, 'dd/MM')}
                    {jaPaga
                      ? <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--accent-dim)', color: 'var(--accent2)', padding: '1px 7px', borderRadius: 10 }}>paga ✓</span>
                      : pagaEsteMes && <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--bg2)', color: 'var(--amber-text)', padding: '1px 7px', borderRadius: 10 }}>você paga este mês</span>}
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Syne', color: 'var(--text)' }}>{fmt(f.atual)}</span>
                </div>
                {c.limite && (
                  <>
                    <div style={{ background: 'var(--border2)', borderRadius: 4, height: 5, overflow: 'hidden', margin: '8px 0 4px' }}>
                      <div style={{ width: `${usoPct}%`, height: '100%', background: usoPct >= 90 ? 'var(--red)' : usoPct >= 70 ? 'var(--amber)' : 'var(--accent)', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {usoPct}% do limite de {fmt(c.limite)}
                      {comprometidoFuturo > 0 && ` · ${fmt(comprometido)} comprometido com parcelas futuras`}
                    </span>
                  </>
                )}
                <p style={{ fontSize: 11, color: 'var(--accent-text)', marginTop: 8 }}>Ver o que compõe esta fatura →</p>
              </button>

              {/* Próxima fatura */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text2)', padding: '0 2px' }}>
                <span>Próxima fatura · vence {format(f.vencProx, 'dd/MM')}</span>
                <strong style={{ color: 'var(--text)' }}>{fmt(f.prox)}</strong>
              </div>

              {/* Pagar fatura (conclui as parcelas do mês) */}
              {!jaPaga ? (
                <button onClick={() => pagarFatura(c, f)} disabled={f.atual <= 0}
                  style={{ width: '100%', marginTop: 12, padding: '9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', background: 'transparent', color: f.atual > 0 ? 'var(--accent-text)' : 'var(--text3)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Check size={15} /> Marcar fatura como paga
                </button>
              ) : (
                <div style={{ marginTop: 12, padding: '9px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-dim)', color: 'var(--accent2)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                  Fatura de {format(f.vencAtual, 'MM/yyyy')} paga ✓
                </div>
              )}

              {/* Histórico de faturas (últimos 6 meses) — clique numa barra */}
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Histórico de faturas</p>
                <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 34 }}>
                  {hist.map(h => (
                    <button key={h.competencia} onClick={() => setHistSel({ card: c, h })} title={format(h.venc, 'MM/yyyy')}
                      style={{ flex: 1, height: h.status === 'paga' ? 30 : h.status === 'vencida' ? 24 : 16, background: CORES_HIST[h.status], borderRadius: 3, opacity: histSel?.h?.competencia === h.competencia && histSel?.card?.id === c.id ? 1 : 0.85 }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                  {hist.map(h => (
                    <span key={h.competencia} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text3)' }}>{format(h.venc, 'MMM')}</span>
                  ))}
                </div>
              </div>
            </div>
          )
        })}

      {/* Modal: composição da fatura */}
      {detalhe && (() => {
        const { card, f } = detalhe
        const Secao = ({ titulo, venc, total, itens }) => (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Syne' }}>{titulo} · vence {format(venc, 'dd/MM')}</span>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Syne' }}>{fmt(total)}</span>
            </div>
            {itens.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text3)' }}>Nada lançado neste ciclo.</p>
            ) : itens.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 16 }}>{it.tipo === 'parcela' ? '💳' : it.tipo === 'assinatura' ? '📺' : emojiDe(it.categoria)}</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {it.descricao || 'Sem descrição'}
                      {it.tipo === 'parcela' && <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg3)', color: 'var(--blue-text)', padding: '1px 6px', borderRadius: 10 }}>{it.numero}/{it.total}x</span>}
                      {it.tipo === 'assinatura' && <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg3)', color: 'var(--purple-text)', padding: '1px 6px', borderRadius: 10 }}>assinatura</span>}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text3)' }}>{it.tipo === 'assinatura' ? (it.diaCobranca ? `Todo dia ${it.diaCobranca}` : 'Mensal') : fmtData(it.data, 'dd/MM')}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--red-text)' }}>{fmt(it.valor)}</span>
                  {it.tipo === 'parcela' && it.id && (
                    <button onClick={() => moverParcela(it.id)} title="Jogar pra próxima fatura">
                      <ArrowRight size={14} color="var(--text3)" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
        return (
          <div className="modal-overlay" onClick={() => setDetalhe(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h2 style={{ fontSize: 18 }}>{bandeiras[card.bandeira] || '💳'} {card.nome}</h2>
                <button onClick={() => setDetalhe(null)}><X size={20} color="var(--text2)" /></button>
              </div>
              <Secao titulo="Fatura atual" venc={f.vencAtual} total={f.atual} itens={f.atualItens} />
              <Secao titulo="Próxima fatura" venc={f.vencProx} total={f.prox} itens={f.proxItens} />
              {(() => {
                const jaPagaDet = faturasPagas.some(p => p.referencia_id === card.id && p.competencia === format(f.vencAtual, 'yyyy-MM') && p.pago)
                return jaPagaDet ? (
                  <div style={{ padding: '10px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-dim)', color: 'var(--accent2)', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
                    Fatura atual já marcada como paga ✓
                  </div>
                ) : (
                  <button className="btn-primary" style={{ width: '100%' }} onClick={() => pagarFatura(card, f)} disabled={f.atual <= 0}>
                    Marcar fatura atual como paga
                  </button>
                )
              })()}
            </div>
          </div>
        )
      })()}

      {/* Popover de uma fatura do histórico */}
      {histSel && (
        <div className="modal-overlay" onClick={() => setHistSel(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 17 }}>{histSel.card.nome} · {format(histSel.h.venc, 'MM/yyyy')}</h2>
              <button onClick={() => setHistSel(null)}><X size={20} color="var(--text2)" /></button>
            </div>
            {(() => {
              const h = histSel.h
              const rotulo = { paga: 'Paga', vencida: 'Vencida (não paga)', aberta: 'Aberta (vence este mês)', futura: 'Ainda não fechou' }[h.status]
              return (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>
                    Vence {format(h.venc, "dd 'de' MMM")} · <strong style={{ color: CORES_HIST[h.status] }}>{rotulo}</strong>
                  </p>
                  {h.status === 'paga' && h.valor != null && (
                    <p style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Syne', marginBottom: 4 }}>{fmt(h.valor)}</p>
                  )}
                  {h.pagoRow?.data_pagamento && (
                    <p style={{ fontSize: 12, color: 'var(--text3)' }}>Pago em {fmtData(h.pagoRow.data_pagamento, 'dd/MM/yyyy')}</p>
                  )}
                  {h.status !== 'paga' && (
                    <p style={{ fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.5 }}>
                      {h.status === 'vencida'
                        ? 'Essa fatura não ficou marcada como paga. Quando ela for a fatura vigente do cartão, use “Marcar fatura como paga”.'
                        : 'Essa fatura ainda não fechou.'}
                    </p>
                  )}
                  {h.status === 'paga' && (
                    <button onClick={() => desfazerPagamento(h.pagoRow)}
                      style={{ marginTop: 16, width: '100%', padding: '9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Undo2 size={15} /> Desfazer pagamento
                    </button>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>{editando ? 'Editar cartão' : 'Novo cartão'}</h2>
            <div className="form-group"><label>Nome do cartão</label><input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Nubank, Inter..." /></div>
            <div className="form-group">
              <label>Bandeira</label>
              <select value={form.bandeira} onChange={e => setForm(p => ({ ...p, bandeira: e.target.value }))}>
                {Object.keys(bandeiras).map(b => <option key={b} value={b}>{bandeiras[b]} {b}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Cor do cartão</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CORES.map(cor => (
                  <button key={cor} type="button" title="Cor do cartão"
                    onClick={() => setForm(p => ({ ...p, cor: p.cor === cor ? '' : cor }))}
                    style={{
                      width: 30, height: 30, borderRadius: '50%', background: cor, flexShrink: 0,
                      border: form.cor === cor ? '3px solid var(--text)' : '2px solid var(--border)',
                      boxShadow: form.cor === cor ? '0 0 0 2px var(--bg2)' : 'none',
                    }} />
                ))}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Dia de fechamento</label><input type="number" inputMode="decimal" min="1" max="31" value={form.dia_fechamento} onChange={e => setForm(p => ({ ...p, dia_fechamento: e.target.value }))} placeholder="Ex: 20" /></div>
              <div className="form-group"><label>Dia de vencimento</label><input type="number" inputMode="decimal" min="1" max="31" value={form.dia_vencimento} onChange={e => setForm(p => ({ ...p, dia_vencimento: e.target.value }))} placeholder="Ex: 27" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Limite (opcional)</label><input type="number" inputMode="decimal" value={form.limite} onChange={e => setForm(p => ({ ...p, limite: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>Alertar X dias antes</label><input type="number" inputMode="decimal" min="1" max="15" value={form.alerta_dias} onChange={e => setForm(p => ({ ...p, alerta_dias: e.target.value }))} /></div>
            </div>
            {!editando && (
              <div className="form-group">
                <label>Fatura atual aproximada (opcional)</label>
                <input type="number" inputMode="decimal" value={form.fatura_inicial} onChange={e => setForm(p => ({ ...p, fatura_inicial: e.target.value }))} placeholder="0,00" />
                <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>
                  Já usa esse cartão? Informe a fatura atual (fora parcelas) e a gente lança um ajuste pra começar com o valor certo.
                </span>
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
