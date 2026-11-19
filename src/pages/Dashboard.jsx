import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, subMonths, addMonths, isSameMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, TrendingUp, PieChart as PieIcon, Target, Wallet, CalendarClock } from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import BotaoVoz from '../components/BotaoVoz'
import Onboarding from '../components/Onboarding'
import Explicacao from '../components/Explicacao'
import ViradaMes from '../components/ViradaMes'
import { useCategorias } from '../hooks/useCategorias'
import { InfoDica } from '../components/ui'
import { copy } from '../copy/pt-BR'
import { carregarMotor, garantirSeries, resumoMes, addMeses, compsEntre, nomeMesCurto, hojeBRT, compDe } from '../lib/motor'

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

// Itens -> linhas da explicação
const linhas = (lista, detalhe) => lista.map(x => ({ descricao: x.descricao, valor: x.valor, data: x.data, detalhe: detalhe ? detalhe(x) : null }))
const somaLista = lista => Math.round(lista.reduce((s, x) => s + Number(x.valor || 0), 0) * 100) / 100

export default function Dashboard() {
  const { perfil } = useAuth()
  const { emojiDe } = useCategorias()
  const [mes, setMes] = useState(new Date())
  const [r, setR] = useState(null)            // resumoMes do mês na tela
  const [rAnt, setRAnt] = useState(null)      // mês anterior (comparativo)
  const [historico, setHistorico] = useState([])
  const [porUsuario, setPorUsuario] = useState({})
  const [grupo, setGrupo] = useState(null)
  const [membros, setMembros] = useState([])
  const [virada, setVirada] = useState(null)  // { comp, resumo, cofrinhos }
  const [explica, setExplica] = useState(null) // 'saldo' | 'sobra'
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const ehMesAtual = isSameMonth(mes, new Date())

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil, mes])
  useEffect(() => { if (perfil?.grupo_id) carregarGrupo() }, [perfil?.grupo_id])

  async function carregarGrupo() {
    const gid = perfil.grupo_id
    const [{ data: g }, { data: ms }] = await Promise.all([
      supabase.from('grupos').select('nome').eq('id', gid).single(),
      supabase.from('usuarios').select('id, nome').eq('grupo_id', gid),
    ])
    setGrupo(g || null)
    setMembros(ms || [])
  }

  async function carregar() {
    setLoading(true); setErro(null)
    try {
      await garantirSeries()
      const gid = perfil.grupo_id
      const hoje = hojeBRT()
      const comp = format(mes, 'yyyy-MM')
      const compIni = addMeses(comp, -5)
      const dados = await carregarMotor(gid, { compIni, compFim: addMeses(comp, 1) })
      const res = resumoMes(comp, dados, { hoje })
      setR(res)
      setRAnt(resumoMes(addMeses(comp, -1), dados, { hoje }))

      // Tendência: só a partir de quando o grupo começou a usar o app
      const piso = dados.inicioComp && dados.inicioComp > compIni ? dados.inicioComp : compIni
      setHistorico(compsEntre(piso, comp).map(c => {
        const x = resumoMes(c, dados, { hoje })
        return { key: c, label: nomeMesCurto(c), entradas: x.entradasPrevistas, saidas: x.totalSaidas, saldo: x.sobraDoMes }
      }))

      // Gastos por pessoa (quem lançou), só o que é seu — o nome entra na hora de mostrar
      const pu = {}
      for (const g of dados.gastos) {
        if (g.pessoa_id || compDe(g.data) !== comp) continue
        pu[g.usuario_id || '?'] = (pu[g.usuario_id || '?'] || 0) + Number(g.valor)
      }
      setPorUsuario(pu)

      // Virada do mês: o mês anterior fechou e ninguém decidiu ainda?
      setVirada(null)
      const compAnt = addMeses(compDe(hoje), -1)
      if (comp === compDe(hoje) && (!dados.inicioComp || dados.inicioComp <= compAnt)) {
        const { data: dec } = await supabase.from('viradas_mes').select('id').eq('grupo_id', gid).eq('competencia', compAnt).maybeSingle()
        if (!dec) {
          const resAnt = resumoMes(compAnt, dados, { hoje })
          if (Math.abs(resAnt.saldoDoMes) > 0.004) {
            const { data: cofs } = await supabase.from('cofrinhos').select('id, nome').eq('grupo_id', gid).order('nome')
            setVirada({ comp: compAnt, resumo: resAnt, cofrinhos: cofs || [] })
          }
        }
      }
    } catch (e) {
      console.error('[inicio]', e)
      setErro('Não foi possível carregar suas contas agora. Puxe pra atualizar ou tente de novo.')
    }
    setLoading(false)
  }

  // Carregando: esqueleto com brilho (referência estados.html)
  if (loading && !r) return (
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
  if (!r) return <p style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>{erro || t.carregando}</p>

  // ---------- derivados pra tela ----------
  const azul = r.saldoDoMes >= 0
  const barMax = Math.max(1, ...historico.map(h => Math.abs(h.saldo)))
  const pctEntrou = r.entradasPrevistas > 0 ? Math.min(100, (r.entradasRecebidas / r.entradasPrevistas) * 100) : 0
  const pctSaiu = r.totalSaidas > 0 ? Math.min(100, (r.pago / r.totalSaidas) * 100) : 0

  // Contas a vencer: tudo que vence no mês e ainda não foi pago
  const aVencerItens = [...r.faturas, ...r.fixas, ...r.parcelasAvulsas, ...r.assinaturasAvulsas].filter(x => !x.paga)
  const vencerCount = aVencerItens.length
  const vencerTotal = somaLista(aVencerItens)

  // Categorias (meu gasto, sem compras de outras pessoas)
  const catUniEntries = Object.entries(r.meuGasto.porCategoria).sort((a, b) => b[1].total - a[1].total)
  const emojiPara = cat => cat === 'assinaturas' ? '📺' : emojiDe(cat)
  const nomeCategoria = cat => cat === 'assinaturas' ? 'Assinaturas' : cat
  const baseRenda = Math.max(r.entradasPrevistas, r.meuGasto.total, 1)
  const sobraRenda = r.entradasPrevistas - r.meuGasto.total
  const distribuicao = catUniEntries.map(([cat, o]) => ({ nome: cat, valor: o.total, rotulo: `${emojiPara(cat)} ${nomeCategoria(cat)}` }))
  if (sobraRenda > 0) distribuicao.push({ nome: 'Disponível', valor: sobraRenda, rotulo: '✅ Disponível', sobra: true })

  const orcamentoCats = r.orcamento.filter(o => o.teto > 0).sort((a, b) => (b.realizado / b.teto) - (a.realizado / a.teto))
  const nomesMembros = Object.fromEntries(membros.map(m => [m.id, m.nome?.split(' ')[0] || 'Alguém']))
  const porPessoaObj = {}
  for (const [uid, v] of Object.entries(porUsuario)) {
    const nome = nomesMembros[uid] || 'Alguém'
    porPessoaObj[nome] = (porPessoaObj[nome] || 0) + v
  }
  const porPessoaMes = Object.entries(porPessoaObj).sort((a, b) => b[1] - a[1])
  const totalPessoas = porPessoaMes.reduce((s, [, v]) => s + v, 0)

  const composicao = [
    ['Faturas de cartão', somaLista(r.faturas), 'var(--red)'],
    ['Contas fixas', somaLista(r.fixas), 'var(--blue)'],
    ['Assinaturas sem cartão', somaLista(r.assinaturasAvulsas), 'var(--purple)'],
    ['Parcelas sem cartão', somaLista(r.parcelasAvulsas), 'var(--amber)'],
    ['À vista (pix, débito, dinheiro)', somaLista(r.aVista), 'var(--accent)'],
    ['Guardado em cofrinho', somaLista(r.cofrinhos), 'var(--text3)'],
  ]

  // ---------- "de onde vem esse número?" ----------
  const blocosSaidas = (soPago) => {
    const f = l => (soPago ? l.filter(x => x.paga) : l)
    return [
      { titulo: soPago ? t.blocoFaturasPagas : t.blocoFaturas, sinal: '−', itens: linhas(f(r.faturas), x => x.paga ? 'paga' : x.status === 'aberta' ? 'aberta' : 'a pagar'), total: somaLista(f(r.faturas)) },
      { titulo: t.blocoFixas, sinal: '−', itens: linhas(f(r.fixas), x => x.paga ? 'paga' : 'a pagar'), total: somaLista(f(r.fixas)) },
      { titulo: t.blocoParcelas, sinal: '−', itens: linhas(f(r.parcelasAvulsas), x => `${x.numero}/${x.total}${x.paga ? ' · paga' : ''}`), total: somaLista(f(r.parcelasAvulsas)) },
      { titulo: t.blocoAssinaturas, sinal: '−', itens: linhas(f(r.assinaturasAvulsas)), total: somaLista(f(r.assinaturasAvulsas)) },
      { titulo: t.blocoAVista, sinal: '−', itens: linhas(f(r.aVista), x => x.semCartao ? 'cartão não informado' : null), total: somaLista(f(r.aVista)) },
      { titulo: t.blocoCofrinhos, sinal: '−', itens: linhas(f(r.cofrinhos)), total: somaLista(f(r.cofrinhos)) },
    ]
  }
  const explicacoes = {
    saldo: {
      titulo: t.resultadoSaldo, subtitulo: t.explicaSaldoSub,
      blocos: [{ titulo: t.blocoEntrou, sinal: '+', itens: linhas(r.entradas.filter(e => e.recebida)), total: r.entradasRecebidas }, ...blocosSaidas(true)],
      resultado: { rotulo: t.resultadoSaldo, valor: r.saldoDoMes },
    },
    sobra: {
      titulo: t.resultadoSobra, subtitulo: t.explicaSobraSub,
      blocos: [{ titulo: t.blocoEntradas, sinal: '+', itens: linhas(r.entradas, e => e.origem === 'reembolso_previsto' ? `previsto · ${e.qtd} ${e.qtd === 1 ? 'item' : 'itens'}` : e.recebida ? 'recebida' : 'a receber'), total: r.entradasPrevistas }, ...blocosSaidas(false)],
      resultado: { rotulo: t.resultadoSobra, valor: r.sobraDoMes },
    },
  }

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

      {virada && <ViradaMes comp={virada.comp} resumo={virada.resumo} cofrinhos={virada.cofrinhos} onDecidido={() => { setVirada(null); carregar() }} />}

      {/* Navegação de mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => setMes(m => subMonths(m, 1))}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h3 style={{ fontSize: 15, textTransform: 'capitalize' }}>{format(mes, "MMMM 'de' yyyy", { locale: ptBR })}</h3>
        <button onClick={() => setMes(m => addMonths(m, 1))}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      {/* Card principal: saldo do mês (o que entrou − o que foi pago) + o que vai sobrar */}
      <section style={{ background: 'var(--panel-ink)', color: '#fff', borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#94a3b8' }}>
            {t.caixaLabel}
            <InfoDica titulo={t.dicaCaixaTitulo} texto={t.dicaCaixa} cor="#cbd5e1" alinhar="left" />
          </span>
          <span style={{ fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: azul ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)', color: azul ? '#34d399' : '#fca5a5' }}>{azul ? t.noAzul : t.noVermelho}</span>
        </div>
        <div>
          <button onClick={() => setExplica('saldo')} title={t.deOndeVem} style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 36, lineHeight: '40px', color: azul ? '#fff' : '#fca5a5', background: 'none', border: 'none', padding: 0, textAlign: 'left' }}>
            {fmt(r.saldoDoMes)}
          </button>
          <p style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
            <button onClick={() => setExplica('sobra')} style={{ background: 'none', border: 'none', padding: 0, color: '#94a3b8', fontSize: 13, textAlign: 'left' }}>
              {t.projecaoMes} <strong style={{ color: r.sobraDoMes >= 0 ? '#34d399' : '#fca5a5' }}>{fmt(r.sobraDoMes)}</strong>
            </button>
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

      {/* Atalho único: tudo que falta pagar no mês (faturas + contas + parcelas + assinaturas) */}
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

      {/* O mês até agora: realizado × total do mês */}
      <section className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>{t.mesAteAgora}</p>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: 13, marginBottom: 6 }}>
            <span>{t.entrou} <strong style={{ fontFamily: 'Syne' }}>{fmt(r.entradasRecebidas)}</strong> <span style={{ color: 'var(--text3)', fontSize: 12 }}>{t.de(fmt(r.entradasPrevistas))}</span></span>
            {r.aReceber > 0.005 && <span style={{ color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap' }}>{t.aReceberLabel} {fmt(r.aReceber)}</span>}
          </div>
          <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pctEntrou}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width 0.4s' }} />
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: 13, marginBottom: 6 }}>
            <span>{t.saiu} <strong style={{ fontFamily: 'Syne' }}>{fmt(r.pago)}</strong> <span style={{ color: 'var(--text3)', fontSize: 12 }}>{t.de(fmt(r.totalSaidas))}</span></span>
            {r.aPagar > 0.005 && <span style={{ color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap' }}>{t.aPagarLabel} {fmt(r.aPagar)}</span>}
          </div>
          <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pctSaiu}%`, height: '100%', background: 'var(--red)', borderRadius: 4, transition: 'width 0.4s' }} />
          </div>
        </div>
      </section>

      {/* Quanto posso gastar (mês corrente) = o que vai sobrar com tudo que já está lançado */}
      {ehMesAtual && (
        <div className="card" style={{ marginBottom: 20 }}>
          <button onClick={() => setExplica('sobra')} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, color: 'var(--text)' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Wallet size={22} color="var(--accent)" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, color: 'var(--text2)' }}>{t.possoGastar}</p>
              <p style={{ fontSize: 22, fontFamily: 'Syne', fontWeight: 700, color: r.sobraDoMes >= 0 ? 'var(--accent)' : 'var(--red)' }}>
                {fmt(r.sobraDoMes)}
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>{t.possoGastarLivres}</span>
              </p>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                {r.sobraDoMes > 0 ? t.possoGastarPorDia(fmt(r.porDia), r.diasRestantes) : t.possoGastarNegativo}
              </p>
            </div>
            <ChevronRight size={18} color="var(--text3)" />
          </button>
          {(r.reservaAvista > 0 || r.faturaMesQueVem > 0) && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              {r.reservaAvista > 0 && <span>{t.separandoOrcamento(fmt(r.livreSeparandoOrcamento))}</span>}
              {r.faturaMesQueVem > 0 && (
                <span>{r.faturaMesQueVemEstimada > r.faturaMesQueVem + 0.5
                  ? t.faturaMesQueVemEstimada(fmt(r.faturaMesQueVem), fmt(r.faturaMesQueVemEstimada))
                  : t.faturaMesQueVem(fmt(r.faturaMesQueVem))}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Orçamento × realizado (meu gasto, sem compras de outras pessoas) */}
      {orcamentoCats.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={18} color="var(--accent)" />
              <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15 }}>Orçamento do mês</p>
            </div>
            <Link to="/orcamento" style={{ fontSize: 12, color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>Ver tudo</Link>
          </div>
          {orcamentoCats.slice(0, 5).map(({ categoria, teto, realizado }) => {
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

      {/* Pizza: para onde vai a renda (meu gasto por categoria) */}
      {distribuicao.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <PieIcon size={18} color="var(--accent)" />
            <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15 }}>Para onde vai a renda</p>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
            O que é seu, por categoria (gasto, conta fixa, parcela e assinatura juntos — sem o que é de outras pessoas)
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

      {/* Tendência dos últimos meses (mesma regra: caixa pelo vencimento) */}
      {historico.length > 1 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <TrendingUp size={18} color="var(--accent)" />
            <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15 }}>Tendência ({historico.length} meses)</p>
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

      {/* Composição das saídas do mês (o que sai da conta) */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Composição das saídas</p>
        {composicao.map(([label, valor, cor]) => {
          const pct = r.totalSaidas > 0 ? Math.round((valor / r.totalSaidas) * 100) : 0
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

      {/* Gastos por pessoa (quem lançou) */}
      {porPessoaMes.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Gastos por pessoa</p>
          {porPessoaMes.map(([nome, valor], i) => {
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
      {rAnt && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Comparativo com mês anterior</p>
          {[
            ['Entradas', r.entradasPrevistas, rAnt.entradasPrevistas, true],
            ['Meu gasto', r.meuGasto.total, rAnt.meuGasto.total, false],
            ['Total que sai da conta', r.totalSaidas, rAnt.totalSaidas, false],
            ['Sobra do mês', r.sobraDoMes, rAnt.sobraDoMes, true],
          ].map(([label, atual, anterior, maiorEBom]) => {
            const diff = atual - anterior
            const bom = maiorEBom ? diff >= 0 : diff <= 0
            return (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</span>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 14, fontWeight: 500, fontFamily: 'Syne' }}>{fmt(atual)}</p>
                  {Math.abs(diff) > 0.004 && (
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

      {explica && <Explicacao {...explicacoes[explica]} onFechar={() => setExplica(null)} />}

      {/* Botão de voz flutuante */}
      <BotaoVoz onSalvo={carregar} />
    </div>
  )
}
