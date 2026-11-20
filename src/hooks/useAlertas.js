import { useState, useEffect, useCallback, useRef } from 'react'
import { useAtualizarSozinho } from './useAtualizarSozinho'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, addMonths, getDaysInMonth } from 'date-fns'
import { useCategorias } from './useCategorias'
import { fmt, parseDataLocal } from '../lib/format'
import { estadoAssinatura } from '../lib/assinatura'
import { carregarMotor, resumoMes, faturasDoCartaoAgora, hojeBRT } from '../lib/motor'

const clampDay = (y, m, d) => Math.min(d, getDaysInMonth(new Date(y, m, 1)))
const diasEntre = (a, b) => Math.round((a - b) / 86400000)

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

  const carregar = useCallback(async (opcoes) => {
    if (!perfil?.grupo_id) { setAlertas([]); setLoading(false); return }
    if (!opcoes?.silencioso) setLoading(true)
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

    // Contas, faturas e orçamento vêm do MOTOR ÚNICO (mesma conta do Início e de Contas do mês).
    const [motor, cofrinhos, supr, pref, subAssin] = await Promise.all([
      carregarMotor(gid, { compIni: compAtual, compFim: compProx }).catch(e => { console.error('[alertas] motor', e); return null }),
      supabase.from('cofrinhos').select('id, nome, meta, meta_data, saldo_atual').eq('grupo_id', gid),
      supabase.from('alertas_dispensados').select('alerta_id, lembrar_em').eq('grupo_id', gid),
      supabase.from('preferencias_notificacao').select('*').eq('grupo_id', gid).maybeSingle(),
      supabase.from('subscriptions').select('*').maybeSingle(),
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

    const hojeISOStr = hojeBRT()
    const cartoesAtivos = (motor?.cartoes || []).filter(c => c.ativo !== false)
    const fixasPorId = Object.fromEntries((motor?.fixas || []).map(f => [f.id, f]))
    const cartaoPorId = Object.fromEntries(cartoesAtivos.map(c => [c.id, c]))

    // Contas a pagar de um mês (data + janela de alerta por item) — pelo motor.
    function linhasDoMes(dataMes) {
      if (!motor) return []
      const ano = dataMes.getFullYear(); const mesIdx = dataMes.getMonth(); const comp = format(dataMes, 'yyyy-MM')
      const r = resumoMes(comp, motor, { hoje: hojeISOStr })
      const dia = iso => (iso ? Number(iso.slice(8, 10)) : 99)
      const linhas = []
      r.fixas.forEach(f => linhas.push({ tipo: 'fixa', nome: f.descricao, emoji: emojiDe(f.categoria), vencDia: dia(f.data), valor: f.valor, pago: f.paga, alertaDias: fixasPorId[f.id]?.alerta_dias ?? 3 }))
      r.faturas.filter(f => cartaoPorId[f.cartaoId]).forEach(f => linhas.push({ tipo: 'fatura', nome: `Fatura ${f.cartaoNome}`, emoji: '💳', vencDia: dia(f.vencimento), valor: f.total, pago: f.paga, alertaDias: cartaoPorId[f.cartaoId]?.alerta_dias ?? 3 }))
      r.parcelasAvulsas.forEach(p => linhas.push({ tipo: 'parcela', nome: p.descricao || 'Parcela', emoji: emojiDe(p.categoria), vencDia: dia(p.data), valor: p.valor, pago: p.paga, alertaDias: DIAS_PADRAO }))
      r.assinaturasAvulsas.forEach(a => linhas.push({ tipo: 'assinatura', nome: a.descricao, emoji: '📺', vencDia: dia(a.data), valor: a.valor, pago: a.paga, alertaDias: DIAS_PADRAO }))
      return linhas.map(l => ({ ...l, ano, mesIdx }))
    }
    const resumoAtual = motor ? resumoMes(compAtual, motor, { hoje: hojeISOStr }) : null

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

    // 2) Fatura do cartão fechando em breve (hora de revisar os gastos) — a fatura ABERTA
    if (ligado.fatura && motor) cartoesAtivos.forEach(card => {
      const { aberta } = faturasDoCartaoAgora(card, motor, hojeISOStr)
      const fecha = parseDataLocal(aberta.fechamento); fecha.setHours(0, 0, 0, 0)
      const diasF = diasEntre(fecha, hoje)
      if (diasF < 0 || diasF > FECHA_JANELA || aberta.total <= 0) return
      const quando = diasF === 0 ? 'Fecha hoje' : diasF === 1 ? 'Fecha amanhã' : `Fecha em ${diasF} dias (${format(fecha, 'dd/MM')})`
      out.push({ id: `fecha-${aberta.fechamento}-${card.id}`, severidade: 'info', emoji: '💳', titulo: `Fatura ${card.nome} fechando`, descricao: `${quando} · ${fmt(aberta.total)} até agora`, valor: aberta.total, destino: '/cartoes', ord: 1.2 })
    })

    // 3) Orçamento: meu gasto do mês por categoria (compra + fixa + parcela + assinatura, sem terceiros)
    if (ligado.orcamento && resumoAtual) resumoAtual.orcamento.forEach(o => {
      const teto = o.teto
      if (!teto || teto <= 0) return
      const r = o.realizado
      const pct = Math.round((r / teto) * 100)
      if (r >= teto) {
        out.push({ id: `orc-${compAtual}-${o.categoria}-estourou`, severidade: 'estourou', emoji: emojiDe(o.categoria), titulo: `Orçamento de ${o.categoria}`, descricao: `Estourou — ${fmt(r)} de ${fmt(teto)} (${pct}%)`, destino: '/orcamento', ord: 0.6 })
      } else if (pct >= 80) {
        out.push({ id: `orc-${compAtual}-${o.categoria}-quase`, severidade: 'quase', emoji: emojiDe(o.categoria), titulo: `Orçamento de ${o.categoria}`, descricao: `No limite — ${fmt(r)} de ${fmt(teto)} (${pct}%)`, destino: '/orcamento', ord: 1.5 })
      }
    })

    // 4) Mês no vermelho: tudo que vence no mês passa do que entra (mesma conta do Início)
    if (ligado.projecao && resumoAtual && resumoAtual.sobraDoMes < 0) {
      out.push({ id: `proj-neg-${compAtual}`, severidade: 'estourou', emoji: '📉', titulo: 'Mês pode fechar no vermelho', descricao: `Vai faltar ${fmt(Math.abs(resumoAtual.sobraDoMes))} — entram ${fmt(resumoAtual.entradasPrevistas)} e vencem ${fmt(resumoAtual.totalSaidas)}`, destino: '/', ord: 0.2 })
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

    // 6) Assinatura: trial/acesso acabando, pagamento pendente, vencida ou renovação próxima.
    const { aviso: avisoAssin } = estadoAssinatura(subAssin.data)
    if (avisoAssin) {
      const emoji = avisoAssin.severidade === 'info' ? '💳' : avisoAssin.severidade === 'vencido' ? '⚠️' : '⏳'
      const ord = avisoAssin.severidade === 'vencido' ? 0.1 : avisoAssin.severidade === 'vence' ? 0.5 : 1.3
      out.push({ id: avisoAssin.chave, severidade: avisoAssin.severidade, emoji, titulo: avisoAssin.titulo, descricao: avisoAssin.texto, destino: '/planos', ord })
    }

    out.sort((a, b) => (a.ord - b.ord) || ((a.venc?.getTime() || 0) - (b.venc?.getTime() || 0)))
    setAlertas(out.filter(a => !suprimidosRef.current.has(a.id)))
    setLoading(false)
  }, [perfil, emojiDe])

  useEffect(() => { carregar() }, [carregar])
  useAtualizarSozinho(carregar)

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
