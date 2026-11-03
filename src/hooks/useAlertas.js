import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, addMonths, getDaysInMonth } from 'date-fns'
import { useCategorias } from './useCategorias'
import { fmt, parseDataLocal } from '../lib/format'

const clampDay = (y, m, d) => Math.min(d, getDaysInMonth(new Date(y, m, 1)))

// Ciclo da fatura de um cartão que VENCE no mês (ano, mesIdx 0-based).
function cicloFatura(card, ano, mesIdx) {
  const diaF = card.dia_fechamento || 1
  const diaV = card.dia_vencimento || 10
  const vencDia = clampDay(ano, mesIdx, diaV)
  const fIdx = diaV <= diaF ? mesIdx - 1 : mesIdx
  const fecha = new Date(ano, fIdx, clampDay(ano, fIdx, diaF))
  const abre = new Date(ano, fIdx - 1, clampDay(ano, fIdx - 1, diaF))
  return { abre, fecha, vencDia }
}

// Janela (em dias) para avisar de uma conta que está por vencer.
const JANELA_DIAS = 7

// Alertas da família: contas vencidas, a vencer e orçamento estourado.
// Mesma regra do hub Contas do mês, cobrindo o mês atual + início do próximo.
export function useAlertas() {
  const { perfil } = useAuth()
  const { emojiDe } = useCategorias()
  const [alertas, setAlertas] = useState([])
  const [loading, setLoading] = useState(true)
  const dispensadosRef = useRef(new Set())

  const carregar = useCallback(async () => {
    if (!perfil?.grupo_id) { setAlertas([]); setLoading(false); return }
    setLoading(true)
    const gid = perfil.grupo_id
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const limiteJanela = new Date(hoje); limiteJanela.setDate(limiteJanela.getDate() + JANELA_DIAS)

    const mesAtual = startOfMonth(hoje)
    const prox = addMonths(mesAtual, 1)
    const compAtual = format(mesAtual, 'yyyy-MM')
    const compProx = format(prox, 'yyyy-MM')
    const iniAtual = format(mesAtual, 'yyyy-MM-dd')
    const fimProx = format(endOfMonth(prox), 'yyyy-MM-dd')

    const [cf, cartoes, gastos, parcelas, assinaturas, lanc, pagas, orc, disp] = await Promise.all([
      supabase.from('contas_fixas').select('id, nome, valor, categoria, dia_vencimento').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('cartoes').select('id, nome, dia_fechamento, dia_vencimento').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('gastos').select('valor, data, cartao_id, categoria').eq('grupo_id', gid),
      supabase.from('parcelas').select('valor, data_vencimento, paga, parcelamentos(descricao, categoria, cartao_id)').eq('grupo_id', gid).gte('data_vencimento', iniAtual).lte('data_vencimento', fimProx),
      supabase.from('assinaturas').select('id, nome, valor, dia_cobranca, cartao_id').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('fixas_lancamentos').select('conta_fixa_id, competencia, valor_real, pago').eq('grupo_id', gid).in('competencia', [compAtual, compProx]),
      supabase.from('contas_pagas').select('tipo, referencia_id, competencia, pago').eq('grupo_id', gid).in('competencia', [compAtual, compProx]),
      supabase.from('orcamentos').select('categoria, valor').eq('grupo_id', gid),
      supabase.from('alertas_dispensados').select('alerta_id').eq('grupo_id', gid),
    ])

    dispensadosRef.current = new Set((disp.data || []).map(d => d.alerta_id))

    const lancMap = {}
    ;(lanc.data || []).forEach(l => { lancMap[`${l.competencia}|${l.conta_fixa_id}`] = l })
    const pagasMap = {}
    ;(pagas.data || []).forEach(p => { pagasMap[`${p.competencia}|${p.tipo}|${p.referencia_id}`] = p })
    const mesDe = d => d.slice(0, 7)
    const inCycle = (d, abre, fecha) => d > abre && d <= fecha

    // Monta as contas a pagar de um mês (data, não os handlers do hub).
    function linhasDoMes(dataMes) {
      const ano = dataMes.getFullYear(); const mesIdx = dataMes.getMonth(); const comp = format(dataMes, 'yyyy-MM')
      const linhas = []
      ;(cf.data || []).forEach(c => {
        const l = lancMap[`${comp}|${c.id}`]
        const valor = l?.valor_real != null ? Number(l.valor_real) : Number(c.valor)
        linhas.push({ tipo: 'fixa', nome: c.nome, emoji: emojiDe(c.categoria), vencDia: c.dia_vencimento || 99, valor, pago: l?.pago ?? false })
      })
      ;(cartoes.data || []).forEach(card => {
        const { abre, fecha, vencDia } = cicloFatura(card, ano, mesIdx)
        const gCiclo = (gastos.data || []).filter(g => g.cartao_id === card.id && inCycle(parseDataLocal(g.data), abre, fecha)).reduce((s, g) => s + Number(g.valor), 0)
        const pCartao = (parcelas.data || []).filter(p => p.parcelamentos?.cartao_id === card.id && mesDe(p.data_vencimento) === comp).reduce((s, p) => s + Number(p.valor), 0)
        const aCartao = (assinaturas.data || []).filter(a => a.cartao_id === card.id).reduce((s, a) => s + Number(a.valor), 0)
        const valor = gCiclo + pCartao + aCartao
        if (valor <= 0) return
        const pg = pagasMap[`${comp}|fatura|${card.id}`]
        linhas.push({ tipo: 'fatura', nome: `Fatura ${card.nome}`, emoji: '💳', vencDia, valor, pago: pg?.pago ?? false })
      })
      ;(parcelas.data || []).filter(p => !p.parcelamentos?.cartao_id && mesDe(p.data_vencimento) === comp).forEach(p => {
        linhas.push({ tipo: 'parcela', nome: p.parcelamentos?.descricao || 'Parcela', emoji: emojiDe(p.parcelamentos?.categoria), vencDia: parseDataLocal(p.data_vencimento).getDate(), valor: Number(p.valor), pago: p.paga })
      })
      ;(assinaturas.data || []).filter(a => !a.cartao_id).forEach(a => {
        const pg = pagasMap[`${comp}|assinatura|${a.id}`]
        linhas.push({ tipo: 'assinatura', nome: a.nome, emoji: '📺', vencDia: a.dia_cobranca || 99, valor: Number(a.valor), pago: pg?.pago ?? false })
      })
      return linhas.map(l => ({ ...l, ano, mesIdx }))
    }

    const todas = [...linhasDoMes(mesAtual), ...linhasDoMes(prox)]
    const out = []

    todas.forEach(l => {
      if (l.pago || l.vencDia >= 99) return
      const venc = new Date(l.ano, l.mesIdx, clampDay(l.ano, l.mesIdx, l.vencDia))
      const ehAtual = l.ano === mesAtual.getFullYear() && l.mesIdx === mesAtual.getMonth()
      const base = `${l.tipo}|${l.nome}|${format(venc, 'yyyy-MM-dd')}`
      if (ehAtual && venc < hoje) {
        out.push({ id: `venc-${base}`, severidade: 'vencido', emoji: l.emoji, titulo: l.nome, descricao: `Venceu ${format(venc, 'dd/MM')}`, valor: l.valor, venc, destino: '/contas-do-mes', ord: 0 })
      } else if (venc >= hoje && venc <= limiteJanela) {
        const dias = Math.round((venc - hoje) / 86400000)
        const quando = dias === 0 ? 'Vence hoje' : dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias (${format(venc, 'dd/MM')})`
        out.push({ id: `vence-${base}`, severidade: 'vence', emoji: l.emoji, titulo: l.nome, descricao: quando, valor: l.valor, venc, destino: '/contas-do-mes', ord: 1 })
      }
    })

    // Orçamento estourado ou perto do limite (mês atual). Realizado = gasto + fixa + parcela.
    const tetos = Object.fromEntries((orc.data || []).map(o => [o.categoria, Number(o.valor)]))
    const real = {}
    const addReal = (cat, v) => { const c = cat || 'outros'; real[c] = (real[c] || 0) + v }
    ;(gastos.data || []).filter(g => mesDe(g.data) === compAtual).forEach(g => addReal(g.categoria, Number(g.valor)))
    ;(cf.data || []).forEach(c => { const l = lancMap[`${compAtual}|${c.id}`]; addReal(c.categoria, l?.valor_real != null ? Number(l.valor_real) : Number(c.valor)) })
    ;(parcelas.data || []).filter(p => mesDe(p.data_vencimento) === compAtual).forEach(p => addReal(p.parcelamentos?.categoria, Number(p.valor)))
    Object.entries(tetos).forEach(([cat, teto]) => {
      if (!teto || teto <= 0) return
      const r = real[cat] || 0
      const pct = Math.round((r / teto) * 100)
      if (r >= teto) {
        out.push({ id: `orc-${compAtual}-${cat}-estourou`, severidade: 'estourou', emoji: emojiDe(cat), titulo: `Orçamento de ${cat}`, descricao: `Estourou — ${fmt(r)} de ${fmt(teto)} (${pct}%)`, destino: '/orcamento', ord: 0.5 })
      } else if (pct >= 80) {
        out.push({ id: `orc-${compAtual}-${cat}-quase`, severidade: 'quase', emoji: emojiDe(cat), titulo: `Orçamento de ${cat}`, descricao: `No limite — ${fmt(r)} de ${fmt(teto)} (${pct}%)`, destino: '/orcamento', ord: 1.5 })
      }
    })

    out.sort((a, b) => (a.ord - b.ord) || ((a.venc?.getTime() || 0) - (b.venc?.getTime() || 0)))
    setAlertas(out.filter(a => !dispensadosRef.current.has(a.id)))
    setLoading(false)
  }, [perfil, emojiDe])

  useEffect(() => { carregar() }, [carregar])

  // Dispensa um alerta (some do sininho até voltar a ser relevante).
  const dispensar = useCallback(async id => {
    if (!perfil?.grupo_id) return
    dispensadosRef.current.add(id)
    setAlertas(a => a.filter(x => x.id !== id))
    await supabase.from('alertas_dispensados').upsert(
      { grupo_id: perfil.grupo_id, alerta_id: id },
      { onConflict: 'grupo_id,alerta_id' }
    )
  }, [perfil])

  const dispensarTodos = useCallback(async () => {
    if (!perfil?.grupo_id || alertas.length === 0) return
    const ids = alertas.map(a => a.id)
    ids.forEach(i => dispensadosRef.current.add(i))
    setAlertas([])
    await supabase.from('alertas_dispensados').upsert(
      ids.map(i => ({ grupo_id: perfil.grupo_id, alerta_id: i })),
      { onConflict: 'grupo_id,alerta_id' }
    )
  }, [perfil, alertas])

  return { alertas, loading, recarregar: carregar, dispensar, dispensarTodos }
}
