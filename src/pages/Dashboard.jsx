import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, isSameMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, TrendingUp, PieChart as PieIcon, Target, Wallet, CalendarClock } from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import BotaoVoz from '../components/BotaoVoz'
import Onboarding from '../components/Onboarding'
import { useCategorias } from '../hooks/useCategorias'
import { InfoDica } from '../components/ui'
import { copy } from '../copy/pt-BR'

const t = copy.inicio
const fmt = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtCurto = v => {
  const n = Number(v || 0)
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}k`
  return String(Math.round(n))
}
const CORES = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#14b8a6', '#ec4899', '#0ea5e9']
const corBarra = pct => (pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--accent)')
const iniciais = n => (n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
const AVCOR = [
  { bg: 'var(--accent-dim)', fg: 'var(--accent-text)' },
  { bg: 'var(--blue-dim)', fg: 'var(--blue-text)' },
  { bg: 'var(--purple-dim)', fg: 'var(--purple-text)' },
  { bg: 'var(--amber-dim)', fg: 'var(--amber-text)' },
]

export default function Dashboard() {
  const { perfil } = useAuth()
  const { emojiDe } = useCategorias()
  const [mes, setMes] = useState(new Date())
  const [dados, setDados] = useState(null)
  const [dadosAnt, setDadosAnt] = useState(null)
  const [historico, setHistorico] = useState([])
  const [grupo, setGrupo] = useState(null)      // { nome }
  const [membros, setMembros] = useState([])    // [{ id, nome }]
  const [loading, setLoading] = useState(true)

  const ehMesAtual = isSameMonth(mes, new Date())

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil, mes])
  useEffect(() => { if (perfil?.grupo_id) carregarGrupo() }, [perfil?.grupo_id])

  // Nome do grupo + membros (cabeçalho do Início). Carrega uma vez.
  async function carregarGrupo() {
    const gid = perfil.grupo_id
    const [{ data: g }, { data: ms }] = await Promise.all([
      supabase.from('grupos').select('nome').eq('id', gid).single(),
      supabase.from('usuarios').select('id, nome').eq('grupo_id', gid),
    ])
    setGrupo(g || null)
    setMembros(ms || [])
  }

  // Tendência dos últimos 6 meses (entradas, saídas, saldo)
  async function carregarHistorico() {
    const gid = perfil.grupo_id
    const inicioJanela = format(startOfMonth(subMonths(mes, 5)), 'yyyy-MM-dd')
    const fimJanela = format(endOfMonth(mes), 'yyyy-MM-dd')

    const [{ data: gastos }, { data: entradas }, { data: parcelas }, { data: fixas }, { data: assinaturas }] = await Promise.all([
      supabase.from('gastos').select('valor, data').eq('grupo_id', gid).gte('data', inicioJanela).lte('data', fimJanela),
      supabase.from('entradas').select('valor, data').eq('grupo_id', gid).gte('data', inicioJanela).lte('data', fimJanela),
      supabase.from('parcelas').select('valor, data_vencimento').eq('grupo_id', gid).gte('data_vencimento', inicioJanela).lte('data_vencimento', fimJanela),
      supabase.from('contas_fixas').select('valor').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('assinaturas').select('valor').eq('grupo_id', gid).eq('ativo', true),
    ])
    const fixoMensal = (fixas || []).reduce((s, f) => s + Number(f.valor), 0) + (assinaturas || []).reduce((s, a) => s + Number(a.valor), 0)

    const buckets = {}
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(mes, i)
      const key = format(m, 'yyyy-MM')
      buckets[key] = { key, label: format(m, 'MMM', { locale: ptBR }).replace('.', ''), entradas: 0, saidas: fixoMensal }
    }
    ;(entradas || []).forEach(e => { const k = e.data.slice(0, 7); if (buckets[k]) buckets[k].entradas += Number(e.valor) })
    ;(gastos || []).forEach(g => { const k = g.data.slice(0, 7); if (buckets[k]) buckets[k].saidas += Number(g.valor) })
    ;(parcelas || []).forEach(p => { const k = p.data_vencimento.slice(0, 7); if (buckets[k]) buckets[k].saidas += Number(p.valor) })

    return Object.values(buckets).map(b => ({ ...b, saldo: b.entradas - b.saidas }))
  }

  async function carregarMes(data) {
    const inicio = format(startOfMonth(data), 'yyyy-MM-dd')
    const fim = format(endOfMonth(data), 'yyyy-MM-dd')
    const gid = perfil.grupo_id

    const competencia = format(data, 'yyyy-MM')

    const [{ data: gastos }, { data: entradas }, { data: fixas }, { data: parcelas }, { data: assinaturas }, { data: lancFixas }, { data: contasPagas }, { data: orcamentos }, { data: cartoes }] = await Promise.all([
      supabase.from('gastos').select('id, descricao, valor, categoria, data, cartao_id, usuarios(nome)').eq('grupo_id', gid).gte('data', inicio).lte('data', fim),
      supabase.from('entradas').select('valor, recebido').eq('grupo_id', gid).gte('data', inicio).lte('data', fim),
      supabase.from('contas_fixas').select('id, valor, categoria').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('parcelas').select('valor, paga, parcelamentos(categoria, cartao_id)').eq('grupo_id', gid).gte('data_vencimento', inicio).lte('data_vencimento', fim),
      supabase.from('assinaturas').select('id, valor, cartao_id').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('fixas_lancamentos').select('conta_fixa_id, valor_real, pago').eq('grupo_id', gid).eq('competencia', competencia),
      supabase.from('contas_pagas').select('tipo, referencia_id, pago').eq('grupo_id', gid).eq('competencia', competencia),
      supabase.from('orcamentos').select('categoria, valor').eq('grupo_id', gid),
      supabase.from('cartoes').select('id, nome').eq('grupo_id', gid).eq('ativo', true),
    ])

    // valor efetivo de cada conta fixa = real lançado no mês (se houver) senão o previsto
    const realPorConta = {}
    ;(lancFixas || []).forEach(l => { if (l.valor_real != null) realPorConta[l.conta_fixa_id] = Number(l.valor_real) })
    const valorFixa = f => (f.id in realPorConta ? realPorConta[f.id] : Number(f.valor))

    const totalEntradas = (entradas || []).reduce((s, e) => s + Number(e.valor), 0)
    const totalGastos = (gastos || []).reduce((s, g) => s + Number(g.valor), 0)
    const totalFixas = (fixas || []).reduce((s, f) => s + valorFixa(f), 0)
    const totalParcelas = (parcelas || []).reduce((s, p) => s + Number(p.valor), 0)
    const totalAssint = (assinaturas || []).reduce((s, a) => s + Number(a.valor), 0)
    const totalSaidas = totalGastos + totalFixas + totalParcelas + totalAssint
    const saldo = totalEntradas - totalSaidas

    // --- Realizado (fluxo de caixa): o que de fato já entrou e já saiu ---
    // Os estados de "pago" vêm das mesmas fontes que o usuário controla no hub Contas do mês.
    const faturaPaga = {}       // cartao_id -> fatura do mês quitada
    const assinaturaPaga = {}   // assinatura_id -> assinatura avulsa quitada
    ;(contasPagas || []).forEach(r => {
      if (!r.pago) return
      if (r.tipo === 'fatura') faturaPaga[r.referencia_id] = true
      else if (r.tipo === 'assinatura') assinaturaPaga[r.referencia_id] = true
    })
    const fixaPaga = {}
    ;(lancFixas || []).forEach(l => { if (l.pago) fixaPaga[l.conta_fixa_id] = true })

    // Entradas: realizado = marcadas como recebidas
    const recebidoEntradas = (entradas || []).filter(e => e.recebido).reduce((s, e) => s + Number(e.valor), 0)
    const aReceber = totalEntradas - recebidoEntradas

    // Saídas: dinheiro que já saiu da conta
    let saiuSaidas = 0
    ;(gastos || []).forEach(g => {
      const v = Number(g.valor)
      if (!g.cartao_id) saiuSaidas += v                  // pix/dinheiro/débito: saiu na hora
      else if (faturaPaga[g.cartao_id]) saiuSaidas += v   // gasto no cartão: saiu quando a fatura foi paga
    })
    ;(fixas || []).forEach(f => { if (fixaPaga[f.id]) saiuSaidas += valorFixa(f) })
    ;(parcelas || []).forEach(p => {
      const cid = p.parcelamentos?.cartao_id
      if (cid ? faturaPaga[cid] : p.paga) saiuSaidas += Number(p.valor)
    })
    ;(assinaturas || []).forEach(a => {
      if (a.cartao_id ? faturaPaga[a.cartao_id] : assinaturaPaga[a.id]) saiuSaidas += Number(a.valor)
    })
    const saldoCaixa = recebidoEntradas - saiuSaidas

    // --- Atalhos do Início ---
    // Fatura (aprox. do mês) por cartão: gastos + parcelas + assinaturas no cartão.
    const fatPorCartao = {}
    const addFat = (cid, v) => { if (cid) fatPorCartao[cid] = (fatPorCartao[cid] || 0) + v }
    ;(gastos || []).forEach(g => addFat(g.cartao_id, Number(g.valor)))
    ;(parcelas || []).forEach(p => addFat(p.parcelamentos?.cartao_id, Number(p.valor)))
    ;(assinaturas || []).forEach(a => addFat(a.cartao_id, Number(a.valor)))
    // Faturas: soma de TODOS os cartões com fatura em aberto (um card só, resumo).
    let faturasTotal = 0, faturasCount = 0
    ;(cartoes || []).forEach(c => {
      const v = fatPorCartao[c.id] || 0
      if (v > 0 && !faturaPaga[c.id]) { faturasTotal += v; faturasCount++ }
    })
    // Contas a vencer = contas fixas + parcelas avulsas + assinaturas avulsas ainda não
    // pagas. As faturas NÃO entram aqui (ficam no card de Faturas, pra não contar 2x).
    let aVencerCount = 0, aVencerTotal = 0
    ;(fixas || []).forEach(f => { if (!fixaPaga[f.id]) { aVencerCount++; aVencerTotal += valorFixa(f) } })
    ;(parcelas || []).forEach(p => { if (!p.parcelamentos?.cartao_id && !p.paga) { aVencerCount++; aVencerTotal += Number(p.valor) } })
    ;(assinaturas || []).forEach(a => { if (!a.cartao_id && !assinaturaPaga[a.id]) { aVencerCount++; aVencerTotal += Number(a.valor) } })

    // Visão por NATUREZA: categorias só dos gastos variáveis
    const porCategoria = {}
    ;(gastos || []).forEach(g => { porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + Number(g.valor) })

    // Visão por CATEGORIA: soma gasto variável + conta fixa + parcela (+ assinatura) na mesma categoria
    const porCategoriaUni = {}
    const addCat = (cat, campo, v) => {
      const c = cat || 'outros'
      if (!porCategoriaUni[c]) porCategoriaUni[c] = { total: 0, gasto: 0, fixa: 0, parcela: 0, assinatura: 0 }
      porCategoriaUni[c][campo] += v
      porCategoriaUni[c].total += v
    }
    ;(gastos || []).forEach(g => addCat(g.categoria, 'gasto', Number(g.valor)))
    ;(fixas || []).forEach(f => addCat(f.categoria, 'fixa', valorFixa(f)))
    ;(parcelas || []).forEach(p => addCat(p.parcelamentos?.categoria, 'parcela', Number(p.valor)))
    ;(assinaturas || []).forEach(a => addCat('assinaturas', 'assinatura', Number(a.valor)))

    // --- Previsto do mês = teto do orçamento (planejado pelo usuário) ---
    // Para cada categoria: o maior entre o já realizado e o teto definido.
    // Assim o previsto projeta o fim do mês em vez de "crescer" conforme se gasta.
    const tetos = Object.fromEntries((orcamentos || []).map(o => [o.categoria, Number(o.valor)]))
    const catsPrev = new Set([...Object.keys(porCategoriaUni), ...Object.keys(tetos)])
    let previstoSaidas = 0
    catsPrev.forEach(c => {
      if (c === 'assinaturas') { previstoSaidas += porCategoriaUni[c]?.total || 0; return } // assinaturas não têm teto
      previstoSaidas += Math.max(porCategoriaUni[c]?.total || 0, tetos[c] || 0)
    })
    const saldoPrevisto = totalEntradas - previstoSaidas
    const aPagar = Math.max(0, previstoSaidas - saiuSaidas)

    // Orçamento × realizado (só categorias com teto), ordenado por % de uso
    const orcamentoCats = Object.keys(tetos).map(c => ({
      categoria: c,
      teto: tetos[c],
      realizado: porCategoriaUni[c]?.total || 0,
    })).sort((a, b) => (b.realizado / b.teto) - (a.realizado / a.teto))

    const porPessoa = {}
    ;(gastos || []).forEach(g => {
      const nome = g.usuarios?.nome?.split(' ')[0] || 'Desconhecido'
      porPessoa[nome] = (porPessoa[nome] || 0) + Number(g.valor)
    })

    return { totalEntradas, recebidoEntradas, aReceber, totalGastos, totalFixas, totalParcelas, totalAssint, totalSaidas, saiuSaidas, aPagar, saldo, saldoCaixa, previstoSaidas, saldoPrevisto, orcamentoCats, porCategoria, porCategoriaUni, porPessoa, gastos: gastos || [], faturasTotal, faturasCount, aVencerCount, aVencerTotal }
  }

  async function carregar() {
    setLoading(true)
    const [d, dAnt, hist] = await Promise.all([
      carregarMes(mes),
      carregarMes(subMonths(mes, 1)),
      carregarHistorico(),
    ])
    setDados(d); setDadosAnt(dAnt); setHistorico(hist)
    setLoading(false)
  }

  // Carregando: esqueleto com brilho (referência estados.html)
  if (loading) return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="ui-skel" style={{ height: 13, width: 120 }} />
          <div className="ui-skel" style={{ height: 22, width: 160 }} />
        </div>
        <div className="ui-skel" style={{ width: 64, height: 34, borderRadius: 17 }} />
      </div>
      <div className="ui-skel" style={{ height: 150, borderRadius: 'var(--radius-lg)', marginBottom: 12 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div className="ui-skel" style={{ height: 68, borderRadius: 'var(--radius)' }} />
        <div className="ui-skel" style={{ height: 68, borderRadius: 'var(--radius)' }} />
      </div>
      <div className="ui-skel" style={{ height: 180, borderRadius: 'var(--radius)' }} />
      <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, marginTop: 16 }}>{t.carregando}</p>
    </div>
  )

  const pessoaEntries = Object.entries(dados.porPessoa).sort((a, b) => b[1] - a[1])
  const totalPessoas = pessoaEntries.reduce((s, [, v]) => s + v, 0)

  // Visão por categoria (tudo somado): [cat, { total, gasto, fixa, parcela, assinatura }]
  const catUniEntries = Object.entries(dados.porCategoriaUni).sort((a, b) => b[1].total - a[1].total)

  const emojiPara = cat => cat === 'assinaturas' ? '📺' : emojiDe(cat)
  const nomeCategoria = cat => cat === 'assinaturas' ? 'Assinaturas' : cat

  // Distribuição da renda: quanto de tudo que entrou vai para cada categoria
  const baseRenda = Math.max(dados.totalEntradas, dados.totalSaidas, 1)
  const sobra = dados.totalEntradas - dados.totalSaidas
  const distribuicao = catUniEntries.map(([cat, o]) => ({ nome: cat, valor: o.total, rotulo: `${emojiPara(cat)} ${nomeCategoria(cat)}` }))
  if (sobra > 0) distribuicao.push({ nome: 'Disponível', valor: sobra, rotulo: '✅ Disponível', sobra: true })

  // "Quanto posso gastar" (só no mês corrente): renda − compromissos − já gasto variável
  const diasNoMes = endOfMonth(mes).getDate()
  const diasRestantes = Math.max(1, diasNoMes - new Date().getDate() + 1)
  const compromissos = dados.totalFixas + dados.totalParcelas + dados.totalAssint
  const livreMes = dados.totalEntradas - compromissos - dados.totalGastos
  const porDia = Math.max(0, livreMes) / diasRestantes

  // Hero: saldo previsto no azul/vermelho + mini-barras com o saldo dos últimos meses
  const azul = dados.saldoPrevisto >= 0
  const barMax = Math.max(1, ...historico.map(h => Math.abs(h.saldo)))
  // Bloco "O mês até agora": progresso do realizado sobre o previsto
  const pctEntrou = dados.totalEntradas > 0 ? Math.min(100, (dados.recebidoEntradas / dados.totalEntradas) * 100) : 0
  const pctSaiu = dados.previstoSaidas > 0 ? Math.min(100, (dados.saiuSaidas / dados.previstoSaidas) * 100) : 0
  // Atalho único: tudo que falta pagar no mês = contas + parcelas + faturas em aberto
  const vencerCount = dados.aVencerCount + dados.faturasCount
  const vencerTotal = dados.aVencerTotal + dados.faturasTotal

  return (
    <div>
      {/* Cabeçalho: grupo + saudação + avatares dos membros */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{grupo?.nome || t.grupoFallback}</span>
          <h2 style={{ fontSize: 22, fontFamily: 'Syne', fontWeight: 700 }}>{t.saudacao}, {perfil?.nome?.split(' ')[0]}</h2>
        </div>
        {membros.length > 0 && (
          <div aria-label={`${membros.length} membros`} style={{ display: 'flex', flexShrink: 0 }}>
            {membros.slice(0, 4).map((m, i) => (
              <span key={m.id} title={m.nome} style={{ width: 34, height: 34, borderRadius: 17, background: AVCOR[i % AVCOR.length].bg, color: AVCOR[i % AVCOR.length].fg, fontFamily: 'Syne', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg)', marginLeft: i ? -10 : 0 }}>
                {iniciais(m.nome)}
              </span>
            ))}
          </div>
        )}
      </header>

      <Onboarding />

      {/* Navegação de mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => setMes(m => subMonths(m, 1))}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h3 style={{ fontSize: 15, textTransform: 'capitalize' }}>{format(mes, "MMMM 'de' yyyy", { locale: ptBR })}</h3>
        <button onClick={() => setMes(m => addMonths(m, 1))}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      {/* Card principal: saldo em caixa (número principal) + projeção do mês abaixo */}
      <section style={{ background: 'var(--panel-ink)', color: '#fff', borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#94a3b8' }}>
            {t.caixaLabel}
            <InfoDica titulo={t.dicaCaixaTitulo} texto={t.dicaCaixa} cor="#cbd5e1" alinhar="left" />
          </span>
          <span style={{ fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: azul ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)', color: azul ? '#34d399' : '#fca5a5' }}>{azul ? t.noAzul : t.noVermelho}</span>
        </div>
        <div>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 36, lineHeight: '40px', color: dados.saldoCaixa >= 0 ? '#fff' : '#fca5a5' }}>{fmt(dados.saldoCaixa)}</span>
          <p style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
            <span>{t.projecaoMes} <strong style={{ color: azul ? '#34d399' : '#fca5a5' }}>{fmt(dados.saldoPrevisto)}</strong></span>
            <InfoDica titulo={t.dicaProjecaoTitulo} texto={t.dicaProjecao} cor="#cbd5e1" alinhar="right" tamanho={14} />
          </p>
        </div>
        {historico.length > 0 && (
          <svg width="100%" height="48" viewBox="0 0 310 48" preserveAspectRatio="none" aria-hidden="true">
            {historico.map((h, i) => {
              const alt = Math.max(5, (Math.abs(h.saldo) / barMax) * 46)
              const larg = 310 / historico.length
              const ultimo = i === historico.length - 1
              return <rect key={i} x={i * larg + 4} y={48 - alt} width={larg - 8} height={alt} rx={6}
                fill={ultimo ? '#10b981' : (h.saldo >= 0 ? '#1b253b' : '#3b2130')} className="hf-grow" style={{ animationDelay: `${i * 0.05}s` }} />
            })}
          </svg>
        )}
      </section>

      {/* Atalho único: tudo que falta pagar no mês (contas + parcelas + faturas).
          Detalhe item a item, com vencimentos, abre na tela Contas do mês. */}
      <Link to="/contas-do-mes" className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, textDecoration: 'none', color: 'var(--text)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: vencerCount > 0 ? 'var(--amber-text)' : 'var(--accent-text)' }}>
            <CalendarClock size={16} style={{ flexShrink: 0 }} /> {vencerCount > 0 ? t.aVencer(vencerCount) : t.emDia}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{vencerCount > 0 ? t.contasVencerSub : t.emDiaSub}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {vencerCount > 0 && <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20 }}>{fmt(vencerTotal)}</span>}
          <ChevronRight size={18} color="var(--text3)" />
        </div>
      </Link>

      {/* O mês até agora: realizado × previsto em barras (menos número solto) */}
      <section className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>{t.mesAteAgora}</p>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: 13, marginBottom: 6 }}>
            <span>{t.entrou} <strong style={{ fontFamily: 'Syne' }}>{fmt(dados.recebidoEntradas)}</strong> <span style={{ color: 'var(--text3)', fontSize: 12 }}>{t.de(fmt(dados.totalEntradas))}</span></span>
            {dados.aReceber > 0.005 && <span style={{ color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap' }}>{t.aReceberLabel} {fmt(dados.aReceber)}</span>}
          </div>
          <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pctEntrou}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width 0.4s' }} />
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: 13, marginBottom: 6 }}>
            <span>{t.saiu} <strong style={{ fontFamily: 'Syne' }}>{fmt(dados.saiuSaidas)}</strong> <span style={{ color: 'var(--text3)', fontSize: 12 }}>{t.de(fmt(dados.previstoSaidas))}</span></span>
            {dados.aPagar > 0.005 && <span style={{ color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap' }}>{t.aPagarLabel} {fmt(dados.aPagar)}</span>}
          </div>
          <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pctSaiu}%`, height: '100%', background: 'var(--red)', borderRadius: 4, transition: 'width 0.4s' }} />
          </div>
        </div>
      </section>

      {/* Quanto posso gastar (mês corrente) */}
      {ehMesAtual && (
        <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wallet size={22} color="var(--accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>Quanto posso gastar</p>
            <p style={{ fontSize: 22, fontFamily: 'Syne', fontWeight: 700, color: livreMes >= 0 ? 'var(--accent)' : 'var(--red)' }}>
              {fmt(Math.max(0, livreMes))}
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}> livres no mês</span>
            </p>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {livreMes > 0
                ? `cerca de ${fmt(porDia)} por dia nos próximos ${diasRestantes} dias`
                : 'Renda já comprometida com contas e gastos do mês'}
            </p>
          </div>
        </div>
      )}

      {/* Orçamento × realizado */}
      {dados.orcamentoCats.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={18} color="var(--accent)" />
              <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15 }}>Orçamento do mês</p>
            </div>
            <Link to="/orcamento" style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>Ver tudo</Link>
          </div>
          {dados.orcamentoCats.slice(0, 5).map(({ categoria, teto, realizado }) => {
            const pct = teto > 0 ? Math.round((realizado / teto) * 100) : 0
            return (
              <div key={categoria} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ textTransform: 'capitalize' }}>{emojiDe(categoria)} {categoria}</span>
                  <span style={{ fontWeight: 500 }}>{fmt(realizado)} <span style={{ color: 'var(--text3)', fontSize: 11 }}>de {fmt(teto)} ({pct}%)</span></span>
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 7, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: corBarra(pct), borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pizza: para onde vai a renda */}
      {distribuicao.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <PieIcon size={18} color="var(--accent)" />
            <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15 }}>Para onde vai a renda</p>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
            Tudo somado por categoria (gasto, conta fixa, parcela e assinatura juntos)
          </p>
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={distribuicao} dataKey="valor" nameKey="rotulo" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="none">
                {distribuicao.map((d, i) => (
                  <Cell key={i} fill={d.sobra ? 'var(--border2)' : CORES[i % CORES.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, n) => [`${fmt(v)} (${Math.round((v / baseRenda) * 100)}%)`, n]}
                contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, boxShadow: 'var(--shadow-sm)' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 8 }}>
            {distribuicao.map((d, i) => {
              const pct = Math.round((d.valor / baseRenda) * 100)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: d.sobra ? 'var(--border2)' : CORES[i % CORES.length], display: 'inline-block' }} />
                    {d.rotulo}
                  </span>
                  <span style={{ fontWeight: 500 }}>{fmt(d.valor)} <span style={{ color: 'var(--text3)', fontSize: 11 }}>({pct}%)</span></span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tendência dos últimos 6 meses */}
      {historico.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <TrendingUp size={18} color="var(--accent)" />
            <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15 }}>Tendência (6 meses)</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={historico} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gEnt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gSai" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text2)' }} tickLine={false} axisLine={false} style={{ textTransform: 'capitalize' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} tickLine={false} axisLine={false} tickFormatter={fmtCurto} width={44} />
              <Tooltip
                formatter={(v, n) => [fmt(v), n]}
                labelStyle={{ color: 'var(--text)', fontWeight: 600, textTransform: 'capitalize' }}
                contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, boxShadow: 'var(--shadow-sm)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Area type="monotone" dataKey="entradas" name="Entradas" stroke="#10b981" strokeWidth={2.5} fill="url(#gEnt)" dot={{ r: 2.5, fill: '#10b981' }} />
              <Area type="monotone" dataKey="saidas" name="Saídas" stroke="#ef4444" strokeWidth={2.5} fill="url(#gSai)" dot={{ r: 2.5, fill: '#ef4444' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Composição das saídas */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Composição das saídas</p>
        {[
          ['Gastos variáveis', dados.totalGastos, 'var(--red)'],
          ['Contas fixas', dados.totalFixas, 'var(--blue)'],
          ['Assinaturas', dados.totalAssint, 'var(--purple)'],
          ['Parcelas', dados.totalParcelas, 'var(--amber)'],
        ].map(([label, valor, cor]) => {
          const pct = dados.totalSaidas > 0 ? Math.round((valor / dados.totalSaidas) * 100) : 0
          return valor > 0 ? (
            <div key={label} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                <span>{label}</span>
                <span style={{ fontWeight: 500 }}>{fmt(valor)} <span style={{ color: 'var(--text3)', fontSize: 11 }}>({pct}%)</span></span>
              </div>
              <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: cor, borderRadius: 4, transition: 'width 0.4s' }} />
              </div>
            </div>
          ) : null
        })}
      </div>

      {/* Gastos por pessoa */}
      {pessoaEntries.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Gastos por pessoa</p>
          {pessoaEntries.map(([nome, valor], i) => {
            const pct = totalPessoas > 0 ? Math.round((valor / totalPessoas) * 100) : 0
            return (
              <div key={nome} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: CORES[i % CORES.length] + '33', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: CORES[i % CORES.length] }}>
                      {nome[0].toUpperCase()}
                    </span>
                    {nome}
                  </span>
                  <span style={{ fontWeight: 500 }}>{fmt(valor)} <span style={{ color: 'var(--text3)', fontSize: 11 }}>({pct}%)</span></span>
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: CORES[i % CORES.length], borderRadius: 4 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Comparativo vs mês anterior */}
      {dadosAnt && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Comparativo com mês anterior</p>
          {[
            ['Entradas', dados.totalEntradas, dadosAnt.totalEntradas, true],
            ['Gastos variáveis', dados.totalGastos, dadosAnt.totalGastos, false],
            ['Total saídas', dados.totalSaidas, dadosAnt.totalSaidas, false],
            ['Saldo do mês', dados.saldo, dadosAnt.saldo, true],
          ].map(([label, atual, anterior, maiorEBom]) => {
            const diff = atual - anterior
            const bom = maiorEBom ? diff >= 0 : diff <= 0
            return (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</span>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 14, fontWeight: 500, fontFamily: 'Syne' }}>{fmt(atual)}</p>
                  {diff !== 0 && (
                    <p style={{ fontSize: 11, color: bom ? 'var(--accent)' : 'var(--red)' }}>
                      {diff > 0 ? '+' : ''}{fmt(diff)} vs ant.
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Botão de voz flutuante */}
      <BotaoVoz onSalvo={carregar} />
    </div>
  )
}
