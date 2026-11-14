import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, X, Check, ArrowRight, ArrowLeft, Undo2, ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, getDaysInMonth, format } from 'date-fns'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { useCategorias } from '../hooks/useCategorias'
import SwipeRow from '../components/SwipeRow'
import { fmt, fmtData, parseDataLocal, hojeISO } from '../lib/format'

const bandeiras = { Visa: '💙', Mastercard: '🔴', Elo: '🟡', Amex: '🟢', Hipercard: '🔵' }
const CORES = ['#8B5CF6', '#3B82F6', '#14B8A6', '#10B981', '#F97316', '#EF4444', '#EC4899', '#64748B']
const novoForm = () => ({ nome: '', bandeira: 'Visa', cor: '', dia_fechamento: '', dia_vencimento: '', limite: '', alerta_dias: 3, fatura_inicial: '' })

// ---- Matemática de faturas (modelo por COMPETÊNCIA = mês do vencimento 'yyyy-MM') ----
const clampDay = (y, m, d) => Math.min(d, getDaysInMonth(new Date(y, m, 1)))
const compDe = date => format(date, 'yyyy-MM')
function fechaDoMes(diaF, y, m) { return new Date(y, m, clampDay(y, m, diaF)) }
function vencDoFecha(diaF, diaV, fecha) {
  const y = fecha.getFullYear(), m = fecha.getMonth()
  let v = new Date(y, m, clampDay(y, m, diaV))
  if (diaV <= diaF) v = addMonths(v, 1)
  return v
}
// Vencimento da fatura NATURAL (pela data da compra) em que um valor cai.
function vencNatural(card, dataStr) {
  const diaF = card.dia_fechamento || 1, diaV = card.dia_vencimento || 10
  const d = parseDataLocal(dataStr)
  let fecha = fechaDoMes(diaF, d.getFullYear(), d.getMonth())
  if (d > fecha) { const n = addMonths(fecha, 1); fecha = fechaDoMes(diaF, n.getFullYear(), n.getMonth()) }
  return vencDoFecha(diaF, diaV, fecha)
}
// Competência (yyyy-MM) da fatura de um gasto, já com o ajuste manual (±N faturas).
function compDoGasto(card, g) { return compDe(addMonths(vencNatural(card, g.data), g.fatura_ajuste || 0)) }
// Vencimento (Date) de uma competência.
function vencDaComp(card, comp) {
  const diaV = card.dia_vencimento || 10
  const [y, m] = comp.split('-').map(Number)
  return new Date(y, m - 1, clampDay(y, m - 1, diaV))
}
function compDoHoje(card, hoje) {
  const diaF = card.dia_fechamento || 1, diaV = card.dia_vencimento || 10
  let fecha = fechaDoMes(diaF, hoje.getFullYear(), hoje.getMonth())
  if (hoje > fecha) { const n = addMonths(fecha, 1); fecha = fechaDoMes(diaF, n.getFullYear(), n.getMonth()) }
  return compDe(vencDoFecha(diaF, diaV, fecha))
}

// Itens que compõem a fatura de uma competência. Assinaturas só entram na atual/futuras.
function itensDaFatura(card, comp, gastos, parcelas, assinaturas, compAtual, emojiDe) {
  const gs = gastos.filter(g => g.cartao_id === card.id && compDoGasto(card, g) === comp)
    .map(g => ({ tipo: 'gasto', id: g.id, descricao: g.descricao, categoria: g.categoria, valor: Number(g.valor), data: g.data, ajuste: g.fatura_ajuste || 0, emoji: emojiDe(g.categoria) }))
  const ps = parcelas.filter(p => p.cartao_id === card.id && compDe(parseDataLocal(p.data_vencimento)) === comp)
    .map(p => ({ tipo: 'parcela', id: p.id, descricao: p.descricao, valor: Number(p.valor), data: p.data_vencimento, numero: p.numero, total: p.total, paga: p.paga }))
  const ass = comp >= compAtual
    ? assinaturas.filter(a => a.cartao_id === card.id).map(a => ({ tipo: 'assinatura', descricao: a.nome, valor: Number(a.valor), diaCobranca: a.dia_cobranca }))
    : []
  return [...ass, ...gs, ...ps].sort((a, b) => (b.data || '').localeCompare(a.data || ''))
}

export default function Cartoes() {
  const { perfil } = useAuth()
  const run = useDb()
  const { toast } = useToast()
  const { emojiDe } = useCategorias()
  const [detalhe, setDetalhe] = useState(null)   // { cardId, comp }
  const [cartoes, setCartoes] = useState([])
  const [gastos, setGastos] = useState([])
  const [parcelas, setParcelas] = useState([])
  const [assinaturas, setAssinaturas] = useState([])
  const [faturasPagas, setFaturasPagas] = useState([])
  const [inicioComp, setInicioComp] = useState(null)  // competência em que o grupo começou a usar o app
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(novoForm())
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    setLoading(true)
    const gid = perfil.grupo_id
    const [{ data: cs }, { data: gs }, { data: ps }, { data: as }, { data: fp }, { data: grupo }] = await Promise.all([
      supabase.from('cartoes').select('*').eq('grupo_id', gid).order('nome'),
      supabase.from('gastos').select('id, valor, data, cartao_id, descricao, categoria, fatura_ajuste').eq('grupo_id', gid).not('cartao_id', 'is', null),
      supabase.from('parcelas').select('id, valor, data_vencimento, numero, paga, parcelamentos!inner(cartao_id, descricao, num_parcelas)').eq('grupo_id', gid),
      supabase.from('assinaturas').select('nome, valor, dia_cobranca, cartao_id').eq('grupo_id', gid).eq('ativo', true).not('cartao_id', 'is', null),
      supabase.from('contas_pagas').select('*').eq('grupo_id', gid).eq('tipo', 'fatura'),
      supabase.from('grupos').select('criado_em').eq('id', gid).single(),
    ])
    setInicioComp(grupo?.criado_em ? grupo.criado_em.slice(0, 7) : null)
    setCartoes(cs || [])
    setGastos(gs || [])
    setAssinaturas(as || [])
    setFaturasPagas(fp || [])
    setParcelas((ps || []).map(p => ({ id: p.id, valor: p.valor, data_vencimento: p.data_vencimento, paga: p.paga, cartao_id: p.parcelamentos?.cartao_id, descricao: p.parcelamentos?.descricao, numero: p.numero, total: p.parcelamentos?.num_parcelas })))
    setLoading(false)
  }

  const estaPaga = (cardId, comp) => faturasPagas.some(p => p.referencia_id === cardId && p.competencia === comp && p.pago)

  // Marca uma fatura (competência) como paga e conclui as parcelas que vencem nela.
  async function pagarFatura(card, comp, total) {
    if (!confirm(`Marcar a fatura de ${format(vencDaComp(card, comp), 'MM/yyyy')} (${fmt(total)}) como paga?\nAs parcelas que vencem nesse mês entram como pagas.`)) return
    const { error } = await run(
      supabase.from('contas_pagas').upsert(
        { grupo_id: perfil.grupo_id, tipo: 'fatura', referencia_id: card.id, competencia: comp, valor: total, pago: true, data_pagamento: hojeISO() },
        { onConflict: 'tipo,referencia_id,competencia' }
      ),
      { ok: 'Fatura marcada como paga' }
    )
    if (error) return
    const idsMes = parcelas.filter(p => p.cartao_id === card.id && compDe(parseDataLocal(p.data_vencimento)) === comp && !p.paga).map(p => p.id)
    if (idsMes.length) await supabase.from('parcelas').update({ paga: true }).in('id', idsMes)
    carregar()  // mantém o modal aberto; o botão vira "paga ✓"
  }

  async function desfazerPagamento(card, comp) {
    const row = faturasPagas.find(p => p.referencia_id === card.id && p.competencia === comp)
    if (!row?.id) return
    const { error } = await run(supabase.from('contas_pagas').delete().eq('id', row.id), { ok: 'Pagamento desfeito' })
    if (!error) carregar()
  }

  // Move uma parcela ±1 fatura (muda o vencimento). Com "Desfazer".
  async function moverParcela(parcelaId, delta) {
    const p = parcelas.find(x => x.id === parcelaId)
    if (!p) return
    const antes = p.data_vencimento
    const nova = addMonths(parseDataLocal(antes), delta)
    const iso = `${nova.getFullYear()}-${String(nova.getMonth() + 1).padStart(2, '0')}-${String(nova.getDate()).padStart(2, '0')}`
    const { error } = await supabase.from('parcelas').update({ data_vencimento: iso }).eq('id', parcelaId)
    if (error) { toast('Não foi possível mover a parcela.', 'erro'); return }
    carregar()
    toast(delta > 0 ? 'Parcela jogada pra próxima fatura' : 'Parcela voltou pra fatura anterior', 'ok', {
      acao: { label: 'Desfazer', onClick: async () => { await supabase.from('parcelas').update({ data_vencimento: antes }).eq('id', parcelaId); carregar() } },
    })
  }

  // Move um gasto ±1 fatura (ajuste manual; a data real do gasto não muda). Com "Desfazer".
  async function moverGasto(gastoId, ajusteAtual, delta) {
    const novo = (ajusteAtual || 0) + delta
    const { error } = await supabase.from('gastos').update({ fatura_ajuste: novo }).eq('id', gastoId)
    if (error) { toast('Não foi possível mover o gasto.', 'erro'); return }
    carregar()
    toast(delta > 0 ? 'Gasto jogado pra próxima fatura' : 'Gasto voltou pra fatura anterior', 'ok', {
      acao: { label: 'Desfazer', onClick: async () => { await supabase.from('gastos').update({ fatura_ajuste: ajusteAtual || 0 }).eq('id', gastoId); carregar() } },
    })
  }

  function abrirNovo() { setEditando(null); setForm(novoForm()); setModal(true) }
  function editar(c) {
    setEditando(c.id)
    setForm({
      nome: c.nome, bandeira: c.bandeira || 'Visa', cor: c.cor || '',
      dia_fechamento: String(c.dia_fechamento ?? ''), dia_vencimento: String(c.dia_vencimento ?? ''),
      limite: c.limite != null ? String(c.limite) : '', alerta_dias: c.alerta_dias ?? 3, fatura_inicial: '',
    })
    setModal(true)
  }
  function fecharModal() { setModal(false); setEditando(null); setForm(novoForm()) }

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
          const compAtual = compDoHoje(c, hoje)
          const compProx = compDe(addMonths(vencDaComp(c, compAtual), 1))
          const itensAtual = itensDaFatura(c, compAtual, gastos, parcelas, assinaturas, compAtual, emojiDe)
          const totalAtual = itensAtual.reduce((s, x) => s + x.valor, 0)
          const itensProx = itensDaFatura(c, compProx, gastos, parcelas, assinaturas, compAtual, emojiDe)
          const totalProx = itensProx.reduce((s, x) => s + x.valor, 0)
          const vencAtual = vencDaComp(c, compAtual)
          const vencProx = vencDaComp(c, compProx)

          // Comprometido futuro (parcelas + gastos movidos pra frente) p/ o limite.
          const futParc = parcelas.filter(p => p.cartao_id === c.id && compDe(parseDataLocal(p.data_vencimento)) > compAtual).reduce((s, p) => s + Number(p.valor), 0)
          const futGasto = gastos.filter(g => g.cartao_id === c.id && compDoGasto(c, g) > compAtual).reduce((s, g) => s + Number(g.valor), 0)
          const comprometidoFuturo = futParc + futGasto
          const comprometido = totalAtual + comprometidoFuturo
          const usoPct = c.limite ? Math.min(100, Math.round((comprometido / Number(c.limite)) * 100)) : null

          const jaPaga = estaPaga(c.id, compAtual)
          const pagaEsteMes = vencAtual.getFullYear() === hoje.getFullYear() && vencAtual.getMonth() === hoje.getMonth()

          // Histórico: só competências que TÊM movimento + a atual. Nada antes de começar a usar.
          const comps = new Set()
          gastos.forEach(g => { if (g.cartao_id === c.id) comps.add(compDoGasto(c, g)) })
          parcelas.forEach(p => { if (p.cartao_id === c.id) comps.add(compDe(parseDataLocal(p.data_vencimento))) })
          comps.add(compAtual)
          // Histórico começa quando o grupo começou a usar o app — nada antes disso.
          const piso = inicioComp && inicioComp < compAtual ? inicioComp : compAtual
          const barras = [...comps].filter(cp => cp >= piso && cp <= compAtual).sort().slice(-10).map(cp => {
            const venc = vencDaComp(c, cp)
            const itens = itensDaFatura(c, cp, gastos, parcelas, assinaturas, compAtual, emojiDe)
            const total = itens.reduce((s, x) => s + x.valor, 0)
            const paga = estaPaga(c.id, cp)
            let status = 'futura'
            if (paga) status = 'paga'
            else if (cp === compAtual) status = 'aberta'
            else if (cp < compAtual) status = 'vencida'
            return { comp: cp, venc, total, status }
          })
          const CORES_HIST = { paga: 'var(--accent)', vencida: 'var(--red)', aberta: 'var(--amber)', futura: 'var(--border2)' }

          return (
            <SwipeRow key={c.id} style={{ marginBottom: 10 }} onEdit={() => editar(c)} onDelete={() => excluir(c.id)}>
            <div className="card" style={{ margin: 0, borderLeft: c.cor ? `4px solid ${c.cor}` : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20, width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.cor ? c.cor + '22' : 'var(--bg3)', flexShrink: 0 }}>{bandeiras[c.bandeira] || '💳'}</span>
                <div>
                  <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 16 }}>{c.nome}</p>
                  <p style={{ fontSize: 12, color: 'var(--text2)' }}>{c.bandeira} · fecha dia {c.dia_fechamento} · vence dia {c.dia_vencimento}</p>
                </div>
              </div>

              {/* Fatura atual — clica para ver a composição */}
              <button onClick={() => setDetalhe({ cardId: c.id, comp: compAtual })} style={{ width: '100%', textAlign: 'left', marginTop: 14, padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg3)', color: 'var(--text)', border: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    Fatura atual · vence {format(vencAtual, 'dd/MM')}
                    {jaPaga
                      ? <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--accent-dim)', color: 'var(--accent2)', padding: '1px 7px', borderRadius: 10 }}>paga ✓</span>
                      : pagaEsteMes && <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--bg2)', color: 'var(--amber-text)', padding: '1px 7px', borderRadius: 10 }}>você paga este mês</span>}
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Syne', color: 'var(--text)' }}>{fmt(totalAtual)}</span>
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
              <button onClick={() => setDetalhe({ cardId: c.id, comp: compProx })} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 8, fontSize: 12, color: 'var(--text2)', padding: '2px 2px', background: 'transparent', border: 'none', textAlign: 'left' }}>
                <span>Próxima fatura · vence {format(vencProx, 'dd/MM')}</span>
                <strong style={{ color: 'var(--text)' }}>{fmt(totalProx)}</strong>
              </button>

              {/* Pagar fatura */}
              {!jaPaga ? (
                <button onClick={() => pagarFatura(c, compAtual, totalAtual)} disabled={totalAtual <= 0}
                  style={{ width: '100%', marginTop: 12, padding: '9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', background: 'transparent', color: totalAtual > 0 ? 'var(--accent-text)' : 'var(--text3)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Check size={15} /> Marcar fatura como paga
                </button>
              ) : (
                <div style={{ marginTop: 12, padding: '9px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-dim)', color: 'var(--accent2)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                  Fatura de {format(vencAtual, 'MM/yyyy')} paga ✓
                </div>
              )}

              {/* Histórico de faturas — só meses com movimento, a partir de quando começou */}
              {barras.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Histórico de faturas · toque pra abrir</p>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 34 }}>
                    {barras.map(h => (
                      <button key={h.comp} onClick={() => setDetalhe({ cardId: c.id, comp: h.comp })} title={`${format(h.venc, 'MM/yyyy')} · ${fmt(h.total)}`}
                        style={{ flex: 1, height: h.status === 'paga' ? 30 : h.status === 'aberta' ? 22 : h.status === 'vencida' ? 24 : 16, background: CORES_HIST[h.status], borderRadius: 3, opacity: 0.9 }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                    {barras.map(h => (
                      <span key={h.comp} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text3)' }}>{format(h.venc, 'MMM')}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </SwipeRow>
          )
        })}

      {/* Modal: composição de UMA fatura (com navegação entre meses) */}
      {detalhe && (() => {
        const card = cartoes.find(c => c.id === detalhe.cardId)
        if (!card) return null
        const comp = detalhe.comp
        const compAtual = compDoHoje(card, hoje)
        const venc = vencDaComp(card, comp)
        const itens = itensDaFatura(card, comp, gastos, parcelas, assinaturas, compAtual, emojiDe)
        const total = itens.reduce((s, x) => s + x.valor, 0)
        const paga = estaPaga(card.id, comp)
        const irMes = delta => setDetalhe({ cardId: card.id, comp: compDe(addMonths(venc, delta)) })
        return (
          <div className="modal-overlay" onClick={() => setDetalhe(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '82vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h2 style={{ fontSize: 18 }}>{bandeiras[card.bandeira] || '💳'} {card.nome}</h2>
                <button onClick={() => setDetalhe(null)}><X size={20} color="var(--text2)" /></button>
              </div>

              {/* Navegação entre faturas */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                <button onClick={() => irMes(-1)} aria-label="Fatura anterior"><ChevronLeft size={20} color="var(--text2)" /></button>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Syne' }}>Fatura {format(venc, 'MM/yyyy')}</p>
                  <p style={{ fontSize: 11, color: 'var(--text3)' }}>vence {format(venc, "dd 'de' MMM")} · {paga ? 'paga ✓' : comp === compAtual ? 'aberta' : comp < compAtual ? 'não paga' : 'ainda não fechou'}</p>
                </div>
                <button onClick={() => irMes(1)} aria-label="Próxima fatura"><ChevronRight size={20} color="var(--text2)" /></button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Total da fatura</span>
                <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Syne' }}>{fmt(total)}</span>
              </div>

              {itens.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--text3)', padding: '10px 0' }}>Nada lançado nesta fatura.</p>
              ) : itens.map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 16 }}>{it.tipo === 'parcela' ? '💳' : it.tipo === 'assinatura' ? '📺' : it.emoji}</span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {it.descricao || 'Sem descrição'}
                        {it.tipo === 'parcela' && <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg3)', color: 'var(--blue-text)', padding: '1px 6px', borderRadius: 10 }}>{it.numero}/{it.total}x</span>}
                        {it.tipo === 'assinatura' && <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg3)', color: 'var(--purple-text)', padding: '1px 6px', borderRadius: 10 }}>assinatura</span>}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text3)' }}>{it.tipo === 'assinatura' ? (it.diaCobranca ? `Todo dia ${it.diaCobranca}` : 'Mensal') : fmtData(it.data, 'dd/MM')}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--red-text)' }}>{fmt(it.valor)}</span>
                    {(it.tipo === 'parcela' || it.tipo === 'gasto') && (
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button onClick={() => it.tipo === 'parcela' ? moverParcela(it.id, -1) : moverGasto(it.id, it.ajuste, -1)} title="Jogar pra fatura anterior"
                          style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg3)' }}>
                          <ArrowLeft size={13} color="var(--text2)" />
                        </button>
                        <button onClick={() => it.tipo === 'parcela' ? moverParcela(it.id, 1) : moverGasto(it.id, it.ajuste, 1)} title="Jogar pra próxima fatura"
                          style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg3)' }}>
                          <ArrowRight size={13} color="var(--text2)" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div style={{ marginTop: 16 }}>
                {paga ? (
                  <button onClick={() => desfazerPagamento(card, comp)}
                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Undo2 size={15} /> Desfazer pagamento desta fatura
                  </button>
                ) : (
                  <button className="btn-primary" style={{ width: '100%' }} onClick={() => pagarFatura(card, comp, total)} disabled={total <= 0}>
                    Marcar esta fatura como paga
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

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
