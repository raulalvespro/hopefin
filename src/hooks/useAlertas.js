import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, addMonths, getDaysInMonth } from 'date-fns'
import { useCategorias } from './useCategorias'
import { fmt, parseDataLocal } from '../lib/format'

const clampDay = (y, m, d) => Math.min(d, getDaysInMonth(new Date(y, m, 1)))
const diasEntre = (a, b) => Math.round((a - b) / 86400000)

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

const FECHA_JANELA = 3    // dias p/ avisar que a fatura do cartão vai fechar
const META_JANELA = 30    // dias p/ avisar que o prazo de uma meta está chegando

// Central de alertas da família: contas vencidas/a vencer, orçamento estourado,
// fatura fechando, metas de cofrinho e projeção do mês no vermelho.
// Mesma regra do hub Contas do mês; cobre o mês atual + início do próximo.
export function useAlertas() {
  const { perfil } = useAuth()
  const { emojiDe } = useCategorias()
  const [alertas, setAlertas] = useState([])
  const [loading, setLoading] = useState(true)
  const suprimidosRef = useRef(new Set())

  const carregar = useCallback(async () => {
    if (!perfil?.grupo_id) { setAlertas([]); setLoading(false); return }
    setLoading(true)
    const gid = perfil.grupo_id
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const hojeStr = format(hoje, 'yyyy-MM-dd')

    const mesAtual = startOfMonth(hoje)
    const prox = addMonths(mesAtual, 1)
    const compAtual = format(mesAtual, 'yyyy-MM')
    const compProx = format(prox, 'yyyy-MM')
    const iniAtual = format(mesAtual, 'yyyy-MM-dd')
    const fimAtual = format(endOfMonth(mesAtual), 'yyyy-MM-dd')
    const fimProx = format(endOfMonth(prox), 'yyyy-MM-dd')

    const [cf, cartoes, gastos, parcelas, assinaturas, lanc, pagas, orc, entradas, cofrinhos, supr, pref] = await Promise.all([
      supabase.from('contas_fixas').select('id, nome, valor, categoria, dia_vencimento, alerta_dias').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('cartoes').select('id, nome, dia_fechamento, dia_vencimento, alerta_dias').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('gastos').select('valor, data, cartao_id, categoria').eq('grupo_id', gid),
      supabase.from('parcelas').select('valor, data_vencimento, paga, parcelamentos(descricao, categoria, cartao_id)').eq('grupo_id', gid).gte('data_vencimento', iniAtual).lte('data_vencimento', fimProx),
      supabase.from('assinaturas').select('id, nome, valor, dia_cobranca, cartao_id').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('fixas_lancamentos').select('conta_fixa_id, competencia, valor_real, pago').eq('grupo_id', gid).in('competencia', [compAtual, compProx]),
      supabase.from('contas_pagas').select('tipo, referencia_id, competencia, pago').eq('grupo_id', gid).in('competencia', [compAtual, compProx]),
      supabase.from('orcamentos').select('categoria, valor').eq('grupo_id', gid),
      supabase.from('entradas').select('valor').eq('grupo_id', gid).gte('data', iniAtual).lte('data', fimAtual),
      supabase.from('cofrinhos').select('id, nome, meta, meta_data, saldo_atual').eq('grupo_id', gid),
      supabase.from('alertas_dispensados').select('alerta_id, lembrar_em').eq('grupo_id', gid),
      supabase.from('preferencias_notificacao').select('*').eq('grupo_id', gid).maybeSingle(),
    ])

    // Preferências (ausência = tudo ligado). dias_padrao vale p/ parcelas e assinaturas.
    const prefs = {
      alertar_vencimentos: true, alertar_fatura: true, alertar_orcamento: true,
      alertar_metas: true, alertar_projecao: true, dias_padrao: 7,
      ...(pref.data || {}),
    }
    const DIAS_PADRAO = prefs.dias_padrao ?? 7
    const ligado = { vencimentos: prefs.alertar_vencimentos, fatura: prefs.alertar_fatura, orcamento: prefs.alertar_orcamento, metas: prefs.alertar_metas, projecao: prefs.alertar_projecao }

    // Suprimidos = dispensados de vez (lembrar_em null) ou em soneca ainda ativa (lembrar_em > hoje)
    suprimidosRef.current = new Set((supr.data || []).filter(d => !d.lembrar_em || d.lembrar_em > hojeStr).map(d => d.alerta_id))

    const lancMap = {}
    ;(lanc.data || []).forEach(l => { lancMap[`${l.competencia}|${l.conta_fixa_id}`] = l })
    const pagasMap = {}
    ;(pagas.data || []).forEach(p => { pagasMap[`${p.competencia}|${p.tipo}|${p.referencia_id}`] = p })
    const mesDe = d => d.slice(0, 7)
    const inCycle = (d, abre, fecha) => d > abre && d <= fecha

    // Contas a pagar de um mês (data + janela de alerta por item).
    function linhasDoMes(dataMes) {
      const ano = dataMes.getFullYear(); const mesIdx = dataMes.getMonth(); const comp = format(dataMes, 'yyyy-MM')
      const linhas = []
      ;(cf.data || []).forEach(c => {
        const l = lancMap[`${comp}|${c.id}`]
        const valor = l?.valor_real != null ? Number(l.valor_real) : Number(c.valor)
        linhas.push({ tipo: 'fixa', nome: c.nome, emoji: emojiDe(c.categoria), vencDia: c.dia_vencimento || 99, valor, pago: l?.pago ?? false, alertaDias: c.alerta_dias ?? 3 })
      })
      ;(cartoes.data || []).forEach(card => {
        const { abre, fecha, vencDia } = cicloFatura(card, ano, mesIdx)
        const gCiclo = (gastos.data || []).filter(g => g.cartao_id === card.id && inCycle(parseDataLocal(g.data), abre, fecha)).reduce((s, g) => s + Number(g.valor), 0)
        const pCartao = (parcelas.data || []).filter(p => p.parcelamentos?.cartao_id === card.id && mesDe(p.data_vencimento) === comp).reduce((s, p) => s + Number(p.valor), 0)
        const aCartao = (assinaturas.data || []).filter(a => a.cartao_id === card.id).reduce((s, a) => s + Number(a.valor), 0)
        const valor = gCiclo + pCartao + aCartao
        if (valor <= 0) return
        const pg = pagasMap[`${comp}|fatura|${card.id}`]
        linhas.push({ tipo: 'fatura', nome: `Fatura ${card.nome}`, emoji: '💳', vencDia, valor, pago: pg?.pago ?? false, alertaDias: card.alerta_dias ?? 3 })
      })
      ;(parcelas.data || []).filter(p => !p.parcelamentos?.cartao_id && mesDe(p.data_vencimento) === comp).forEach(p => {
        linhas.push({ tipo: 'parcela', nome: p.parcelamentos?.descricao || 'Parcela', emoji: emojiDe(p.parcelamentos?.categoria), vencDia: parseDataLocal(p.data_vencimento).getDate(), valor: Number(p.valor), pago: p.paga, alertaDias: DIAS_PADRAO })
      })
      ;(assinaturas.data || []).filter(a => !a.cartao_id).forEach(a => {
        const pg = pagasMap[`${comp}|assinatura|${a.id}`]
        linhas.push({ tipo: 'assinatura', nome: a.nome, emoji: '📺', vencDia: a.dia_cobranca || 99, valor: Number(a.valor), pago: pg?.pago ?? false, alertaDias: DIAS_PADRAO })
      })
      return linhas.map(l => ({ ...l, ano, mesIdx }))
    }

    const out = []

    // 1) Contas vencidas e a vencer (respeitando o "alertar X dias antes" de cada conta)
    if (ligado.vencimentos) [...linhasDoMes(mesAtual), ...linhasDoMes(prox)].forEach(l => {
      if (l.pago || l.vencDia >= 99) return
      const venc = new Date(l.ano, l.mesIdx, clampDay(l.ano, l.mesIdx, l.vencDia))
      const ehAtual = l.ano === mesAtual.getFullYear() && l.mesIdx === mesAtual.getMonth()
      const dias = diasEntre(venc, hoje)
      const base = `${l.tipo}|${l.nome}|${format(venc, 'yyyy-MM-dd')}`
      if (ehAtual && venc < hoje) {
        out.push({ id: `venc-${base}`, severidade: 'vencido', emoji: l.emoji, titulo: l.nome, descricao: `Venceu ${format(venc, 'dd/MM')}`, valor: l.valor, venc, destino: '/contas-do-mes', ord: 0 })
      } else if (dias >= 0 && dias <= (l.alertaDias ?? DIAS_PADRAO)) {
        const quando = dias === 0 ? 'Vence hoje' : dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias (${format(venc, 'dd/MM')})`
        out.push({ id: `vence-${base}`, severidade: 'vence', emoji: l.emoji, titulo: l.nome, descricao: quando, valor: l.valor, venc, destino: '/contas-do-mes', ord: 1 })
      }
    })

    // 2) Fatura do cartão fechando em breve (hora de revisar os gastos)
    if (ligado.fatura) (cartoes.data || []).forEach(card => {
      const diaF = card.dia_fechamento
      if (!diaF) return
      let fecha = new Date(hoje.getFullYear(), hoje.getMonth(), clampDay(hoje.getFullYear(), hoje.getMonth(), diaF))
      if (fecha < hoje) fecha = new Date(hoje.getFullYear(), hoje.getMonth() + 1, clampDay(hoje.getFullYear(), hoje.getMonth() + 1, diaF))
      const diasF = diasEntre(fecha, hoje)
      if (diasF < 0 || diasF > FECHA_JANELA) return
      const abre = new Date(fecha.getFullYear(), fecha.getMonth() - 1, clampDay(fecha.getFullYear(), fecha.getMonth() - 1, diaF))
      const spend = (gastos.data || []).filter(g => g.cartao_id === card.id && parseDataLocal(g.data) > abre && parseDataLocal(g.data) <= fecha).reduce((s, g) => s + Number(g.valor), 0)
      if (spend <= 0) return
      const quando = diasF === 0 ? 'Fecha hoje' : diasF === 1 ? 'Fecha amanhã' : `Fecha em ${diasF} dias (${format(fecha, 'dd/MM')})`
      out.push({ id: `fecha-${format(fecha, 'yyyy-MM-dd')}-${card.id}`, severidade: 'info', emoji: '💳', titulo: `Fatura ${card.nome} fechando`, descricao: `${quando} · ${fmt(spend)} até agora`, valor: spend, destino: '/cartoes', ord: 1.2 })
    })

    // 3) Orçamento: realizado unificado por categoria (gasto + fixa + parcela), mês atual
    const tetos = Object.fromEntries((orc.data || []).map(o => [o.categoria, Number(o.valor)]))
    const real = {}
    const addReal = (cat, v) => { const c = cat || 'outros'; real[c] = (real[c] || 0) + v }
    ;(gastos.data || []).filter(g => mesDe(g.data) === compAtual).forEach(g => addReal(g.categoria, Number(g.valor)))
    ;(cf.data || []).forEach(c => { const l = lancMap[`${compAtual}|${c.id}`]; addReal(c.categoria, l?.valor_real != null ? Number(l.valor_real) : Number(c.valor)) })
    ;(parcelas.data || []).filter(p => mesDe(p.data_vencimento) === compAtual).forEach(p => addReal(p.parcelamentos?.categoria, Number(p.valor)))
    if (ligado.orcamento) Object.entries(tetos).forEach(([cat, teto]) => {
      if (!teto || teto <= 0) return
      const r = real[cat] || 0
      const pct = Math.round((r / teto) * 100)
      if (r >= teto) {
        out.push({ id: `orc-${compAtual}-${cat}-estourou`, severidade: 'estourou', emoji: emojiDe(cat), titulo: `Orçamento de ${cat}`, descricao: `Estourou — ${fmt(r)} de ${fmt(teto)} (${pct}%)`, destino: '/orcamento', ord: 0.6 })
      } else if (pct >= 80) {
        out.push({ id: `orc-${compAtual}-${cat}-quase`, severidade: 'quase', emoji: emojiDe(cat), titulo: `Orçamento de ${cat}`, descricao: `No limite — ${fmt(r)} de ${fmt(teto)} (${pct}%)`, destino: '/orcamento', ord: 1.5 })
      }
    })

    // 4) Projeção do mês no vermelho (entradas do mês − previsto por teto)
    const catsPrev = new Set([...Object.keys(real), ...Object.keys(tetos)])
    let previsto = 0
    catsPrev.forEach(c => { previsto += Math.max(real[c] || 0, tetos[c] || 0) })
    previsto += (assinaturas.data || []).reduce((s, a) => s + Number(a.valor), 0)
    const totalEnt = (entradas.data || []).reduce((s, e) => s + Number(e.valor), 0)
    const projecao = totalEnt - previsto
    if (ligado.projecao && projecao < 0) {
      out.push({ id: `proj-neg-${compAtual}`, severidade: 'estourou', emoji: '📉', titulo: 'Mês pode fechar no vermelho', descricao: `Projeção de ${fmt(projecao)} — previsto ${fmt(previsto)} e entradas ${fmt(totalEnt)}`, destino: '/projecao', ord: 0.2 })
    }

    // 5) Metas de cofrinho: atingida 🎉 ou prazo chegando
    if (ligado.metas) (cofrinhos.data || []).forEach(c => {
      const meta = Number(c.meta || 0); const saldo = Number(c.saldo_atual || 0)
      if (meta <= 0) return
      if (saldo >= meta) {
        out.push({ id: `cofre-ok-${c.id}`, severidade: 'ok', emoji: '🎉', titulo: `Meta "${c.nome}" atingida`, descricao: `${fmt(saldo)} de ${fmt(meta)}`, destino: '/cofrinhos', ord: 2 })
      } else if (c.meta_data) {
        const prazo = parseDataLocal(c.meta_data); prazo.setHours(0, 0, 0, 0)
        const diasP = diasEntre(prazo, hoje)
        if (diasP >= 0 && diasP <= META_JANELA) {
          out.push({ id: `cofre-prazo-${c.id}-${c.meta_data}`, severidade: 'quase', emoji: '🐷', titulo: `Meta "${c.nome}" perto do prazo`, descricao: `Faltam ${diasP} dias e ${fmt(meta - saldo)} (${fmt(saldo)}/${fmt(meta)})`, destino: '/cofrinhos', ord: 1.6 })
        }
      }
    })

    out.sort((a, b) => (a.ord - b.ord) || ((a.venc?.getTime() || 0) - (b.venc?.getTime() || 0)))
    setAlertas(out.filter(a => !suprimidosRef.current.has(a.id)))
    setLoading(false)
  }, [perfil, emojiDe])

  useEffect(() => { carregar() }, [carregar])

  const suprimir = useCallback(async (id, lembrarEm) => {
    if (!perfil?.grupo_id) return
    suprimidosRef.current.add(id)
    setAlertas(a => a.filter(x => x.id !== id))
    await supabase.from('alertas_dispensados').upsert(
      { grupo_id: perfil.grupo_id, alerta_id: id, lembrar_em: lembrarEm ?? null },
      { onConflict: 'grupo_id,alerta_id' }
    )
  }, [perfil])

  const dispensar = useCallback(id => suprimir(id, null), [suprimir])

  const snoozeAmanha = useCallback(id => {
    const amanha = new Date(); amanha.setHours(0, 0, 0, 0); amanha.setDate(amanha.getDate() + 1)
    return suprimir(id, format(amanha, 'yyyy-MM-dd'))
  }, [suprimir])

  const dispensarTodos = useCallback(async () => {
    if (!perfil?.grupo_id || alertas.length === 0) return
    const ids = alertas.map(a => a.id)
    ids.forEach(i => suprimidosRef.current.add(i))
    setAlertas([])
    await supabase.from('alertas_dispensados').upsert(
      ids.map(i => ({ grupo_id: perfil.grupo_id, alerta_id: i, lembrar_em: null })),
      { onConflict: 'grupo_id,alerta_id' }
    )
  }, [perfil, alertas])

  return { alertas, loading, recarregar: carregar, dispensar, snoozeAmanha, dispensarTodos }
}
