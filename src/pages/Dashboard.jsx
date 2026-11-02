import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, addDays, isSameMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, TrendingUp, Bell, PieChart as PieIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import BotaoVoz from '../components/BotaoVoz'
import { useCategorias } from '../hooks/useCategorias'

const fmt = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtCurto = v => {
  const n = Number(v || 0)
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}k`
  return String(Math.round(n))
}
const CORES = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#14b8a6', '#ec4899', '#0ea5e9']

export default function Dashboard() {
  const { perfil } = useAuth()
  const { emojiDe } = useCategorias()
  const navigate = useNavigate()
  const [mes, setMes] = useState(new Date())
  const [dados, setDados] = useState(null)
  const [dadosAnt, setDadosAnt] = useState(null)
  const [historico, setHistorico] = useState([])
  const [alertas, setAlertas] = useState([])
  const [loading, setLoading] = useState(true)
  const [visao, setVisao] = useState('categoria') // 'categoria' = tudo somado por categoria | 'natureza' = separa fixo/variável/parcela

  const ehMesAtual = isSameMonth(mes, new Date())

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil, mes])

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

    const [{ data: gastos }, { data: entradas }, { data: fixas }, { data: parcelas }, { data: assinaturas }] = await Promise.all([
      supabase.from('gastos').select('id, descricao, valor, categoria, data, usuarios(nome)').eq('grupo_id', gid).gte('data', inicio).lte('data', fim),
      supabase.from('entradas').select('valor').eq('grupo_id', gid).gte('data', inicio).lte('data', fim),
      supabase.from('contas_fixas').select('valor, categoria').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('parcelas').select('valor, parcelamentos(categoria)').eq('grupo_id', gid).gte('data_vencimento', inicio).lte('data_vencimento', fim),
      supabase.from('assinaturas').select('valor').eq('grupo_id', gid).eq('ativo', true),
    ])

    const totalEntradas = (entradas || []).reduce((s, e) => s + Number(e.valor), 0)
    const totalGastos = (gastos || []).reduce((s, g) => s + Number(g.valor), 0)
    const totalFixas = (fixas || []).reduce((s, f) => s + Number(f.valor), 0)
    const totalParcelas = (parcelas || []).reduce((s, p) => s + Number(p.valor), 0)
    const totalAssint = (assinaturas || []).reduce((s, a) => s + Number(a.valor), 0)
    const totalSaidas = totalGastos + totalFixas + totalParcelas + totalAssint
    const saldo = totalEntradas - totalSaidas

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
    ;(fixas || []).forEach(f => addCat(f.categoria, 'fixa', Number(f.valor)))
    ;(parcelas || []).forEach(p => addCat(p.parcelamentos?.categoria, 'parcela', Number(p.valor)))
    ;(assinaturas || []).forEach(a => addCat('assinaturas', 'assinatura', Number(a.valor)))

    const porPessoa = {}
    ;(gastos || []).forEach(g => {
      const nome = g.usuarios?.nome?.split(' ')[0] || 'Desconhecido'
      porPessoa[nome] = (porPessoa[nome] || 0) + Number(g.valor)
    })

    return { totalEntradas, totalGastos, totalFixas, totalParcelas, totalAssint, totalSaidas, saldo, porCategoria, porCategoriaUni, porPessoa, gastos: gastos || [] }
  }

  // Vencimentos próximos (só faz sentido no mês corrente)
  async function carregarAlertas() {
    const gid = perfil.grupo_id
    const hoje = new Date()
    const [{ data: fixas }, { data: cartoes }] = await Promise.all([
      supabase.from('contas_fixas').select('valor, nome, dia_vencimento, alerta_dias').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('cartoes').select('nome, dia_vencimento, alerta_dias').eq('grupo_id', gid).eq('ativo', true),
    ])
    const alertasGerados = []
    const mesN = hoje.getMonth()
    const anoN = hoje.getFullYear()
    ;(fixas || []).forEach(f => {
      const venc = new Date(anoN, mesN, f.dia_vencimento)
      const limite = addDays(hoje, f.alerta_dias || 3)
      if (venc >= hoje && venc <= limite) alertasGerados.push({ tipo: 'fixa', nome: f.nome, data: venc, valor: f.valor })
    })
    ;(cartoes || []).forEach(c => {
      const venc = new Date(anoN, mesN, c.dia_vencimento)
      const limite = addDays(hoje, c.alerta_dias || 3)
      if (venc >= hoje && venc <= limite) alertasGerados.push({ tipo: 'cartao', nome: `Fatura ${c.nome}`, data: venc })
    })
    return alertasGerados
  }

  async function carregar() {
    setLoading(true)
    const [d, dAnt, hist, alrt] = await Promise.all([
      carregarMes(mes),
      carregarMes(subMonths(mes, 1)),
      carregarHistorico(),
      ehMesAtual ? carregarAlertas() : Promise.resolve([]),
    ])
    setDados(d); setDadosAnt(dAnt); setHistorico(hist); setAlertas(alrt)
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--border2)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const varEntradas = dadosAnt?.totalEntradas > 0 ? ((dados.totalEntradas - dadosAnt.totalEntradas) / dadosAnt.totalEntradas * 100).toFixed(0) : null
  const varGastos = dadosAnt?.totalSaidas > 0 ? ((dados.totalSaidas - dadosAnt.totalSaidas) / dadosAnt.totalSaidas * 100).toFixed(0) : null

  const catEntries = Object.entries(dados.porCategoria).sort((a, b) => b[1] - a[1])
  const maxCat = catEntries[0]?.[1] || 1
  const pessoaEntries = Object.entries(dados.porPessoa).sort((a, b) => b[1] - a[1])
  const totalPessoas = pessoaEntries.reduce((s, [, v]) => s + v, 0)

  // Visão por categoria (tudo somado): [cat, { total, gasto, fixa, parcela, assinatura }]
  const catUniEntries = Object.entries(dados.porCategoriaUni).sort((a, b) => b[1].total - a[1].total)
  const maxCatUni = catUniEntries[0]?.[1].total || 1

  const emojiPara = cat => cat === 'assinaturas' ? '📺' : emojiDe(cat)
  const nomeCategoria = cat => cat === 'assinaturas' ? 'Assinaturas' : cat

  // Distribuição da renda: quanto de tudo que entrou vai para cada fatia
  const baseRenda = Math.max(dados.totalEntradas, dados.totalSaidas, 1)
  const sobra = dados.totalEntradas - dados.totalSaidas
  const distribuicao = []
  if (visao === 'categoria') {
    catUniEntries.forEach(([cat, o]) => distribuicao.push({ nome: cat, valor: o.total, rotulo: `${emojiPara(cat)} ${nomeCategoria(cat)}` }))
  } else {
    catEntries.forEach(([cat, valor]) => distribuicao.push({ nome: cat, valor, rotulo: `${emojiDe(cat)} ${cat}` }))
    if (dados.totalFixas > 0) distribuicao.push({ nome: 'Contas fixas', valor: dados.totalFixas, rotulo: '🧾 Contas fixas' })
    if (dados.totalParcelas > 0) distribuicao.push({ nome: 'Parcelas', valor: dados.totalParcelas, rotulo: '💳 Parcelas' })
    if (dados.totalAssint > 0) distribuicao.push({ nome: 'Assinaturas', valor: dados.totalAssint, rotulo: '📺 Assinaturas' })
  }
  if (sobra > 0) distribuicao.push({ nome: 'Disponível', valor: sobra, rotulo: '✅ Disponível', sobra: true })

  // Rótulo de composição por natureza dentro de uma categoria (ex: "variável R$120 · fixa R$80")
  const composicaoCat = o => {
    const partes = []
    if (o.gasto > 0) partes.push(`variável ${fmt(o.gasto)}`)
    if (o.fixa > 0) partes.push(`fixa ${fmt(o.fixa)}`)
    if (o.parcela > 0) partes.push(`parcela ${fmt(o.parcela)}`)
    if (o.assinatura > 0) partes.push(`assinatura ${fmt(o.assinatura)}`)
    return partes.length > 1 ? partes.join(' · ') : null
  }

  const ultimosGastos = [...dados.gastos].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5)

  return (
    <div>
      {/* Saudação */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
        </p>
        <h2 style={{ fontSize: 22, marginTop: 2 }}>Olá, {perfil?.nome?.split(' ')[0]} 👋</h2>
      </div>

      {/* Navegação de mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => setMes(m => subMonths(m, 1))}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h3 style={{ fontSize: 15, textTransform: 'capitalize' }}>{format(mes, "MMMM 'de' yyyy", { locale: ptBR })}</h3>
        <button onClick={() => setMes(m => addMonths(m, 1))}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      {/* Saldo do mês */}
      <div className="card" style={{ marginBottom: 16, background: dados.saldo >= 0 ? 'var(--accent-dim)' : 'var(--red-dim)', borderColor: dados.saldo >= 0 ? 'var(--accent)' : 'var(--red)' }}>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saldo do mês</p>
        <p style={{ fontSize: 34, fontFamily: 'Syne', fontWeight: 700, color: dados.saldo >= 0 ? 'var(--accent)' : 'var(--red)' }}>{fmt(dados.saldo)}</p>
        {dadosAnt && <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>Mês anterior: {fmt(dadosAnt.saldo)}</p>}
      </div>

      {/* Comparativo entradas/saídas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div className="card">
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Entradas</p>
          <p style={{ fontSize: 20, fontFamily: 'Syne', fontWeight: 700, color: 'var(--accent)' }}>{fmt(dados.totalEntradas)}</p>
          {varEntradas !== null && (
            <p style={{ fontSize: 12, marginTop: 4, color: varEntradas >= 0 ? 'var(--accent)' : 'var(--red)' }}>
              {varEntradas >= 0 ? '▲' : '▼'} {Math.abs(varEntradas)}% vs mês ant.
            </p>
          )}
        </div>
        <div className="card">
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Saídas totais</p>
          <p style={{ fontSize: 20, fontFamily: 'Syne', fontWeight: 700, color: 'var(--red)' }}>{fmt(dados.totalSaidas)}</p>
          {varGastos !== null && (
            <p style={{ fontSize: 12, marginTop: 4, color: varGastos <= 0 ? 'var(--accent)' : 'var(--red)' }}>
              {varGastos >= 0 ? '▲' : '▼'} {Math.abs(varGastos)}% vs mês ant.
            </p>
          )}
        </div>
      </div>

      {/* Vencimentos próximos (mês corrente) */}
      {ehMesAtual && alertas.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Bell size={14} color="var(--amber)" /> Vencimentos próximos
          </h3>
          {alertas.map((a, i) => (
            <div key={i} className="card" style={{ marginBottom: 8, borderColor: 'var(--amber)', background: 'var(--amber-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 500, fontSize: 14 }}>{a.nome}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>Vence {format(a.data, 'dd/MM', { locale: ptBR })}</p>
              </div>
              {a.valor && <p style={{ color: 'var(--amber)', fontWeight: 700, fontFamily: 'Syne' }}>{fmt(a.valor)}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Pizza: para onde vai a renda */}
      {distribuicao.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PieIcon size={18} color="var(--accent)" />
              <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15 }}>Para onde vai a renda</p>
            </div>
            <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: 20, padding: 2 }}>
              {[['categoria', 'Categoria'], ['natureza', 'Natureza']].map(([v, label]) => (
                <button key={v} onClick={() => setVisao(v)}
                  style={{ fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 18, border: 'none',
                    background: visao === v ? 'var(--accent)' : 'transparent', color: visao === v ? 'var(--on-accent)' : 'var(--text2)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
            {visao === 'categoria'
              ? 'Tudo somado por categoria (gasto, conta fixa e parcela juntos)'
              : 'Separado por natureza (gastos variáveis, contas fixas, parcelas, assinaturas)'}
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

      {/* Por categoria (barras) — respeita o toggle categoria/natureza */}
      {visao === 'categoria' ? (
        catUniEntries.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Por categoria (tudo somado)</p>
            {catUniEntries.map(([cat, o], i) => {
              const pct = Math.round((o.total / maxCatUni) * 100)
              const totalCatUni = dados.totalGastos + dados.totalFixas + dados.totalParcelas + dados.totalAssint
              const pctTotal = totalCatUni > 0 ? Math.round((o.total / totalCatUni) * 100) : 0
              const comp = composicaoCat(o)
              return (
                <div key={cat} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                    <span>{emojiPara(cat)} {nomeCategoria(cat)}</span>
                    <span style={{ fontWeight: 500 }}>{fmt(o.total)} <span style={{ color: 'var(--text3)', fontSize: 11 }}>({pctTotal}%)</span></span>
                  </div>
                  <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: CORES[i % CORES.length], borderRadius: 4, transition: 'width 0.4s' }} />
                  </div>
                  {comp && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{comp}</p>}
                </div>
              )
            })}
          </div>
        )
      ) : (
        catEntries.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Gastos variáveis por categoria</p>
            {catEntries.map(([cat, valor], i) => {
              const pct = Math.round((valor / maxCat) * 100)
              const pctTotal = dados.totalGastos > 0 ? Math.round((valor / dados.totalGastos) * 100) : 0
              return (
                <div key={cat} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                    <span>{emojiDe(cat)} {cat}</span>
                    <span style={{ fontWeight: 500 }}>{fmt(valor)} <span style={{ color: 'var(--text3)', fontSize: 11 }}>({pctTotal}%)</span></span>
                  </div>
                  <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: CORES[i % CORES.length], borderRadius: 4, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

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

      {/* Últimos gastos */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text2)' }}>Últimos gastos</h3>
          <button onClick={() => navigate('/gastos')} style={{ fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 2 }}>
            Ver todos <ChevronRight size={13} />
          </button>
        </div>
        {ultimosGastos.length === 0 ? (
          <div className="empty-state">Nenhum gasto neste mês</div>
        ) : ultimosGastos.map(g => (
          <div key={g.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>{emojiDe(g.categoria)}</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{g.descricao}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>{format(new Date(g.data + 'T12:00:00'), 'dd/MM', { locale: ptBR })}</p>
              </div>
            </div>
            <p style={{ color: 'var(--red)', fontWeight: 700, fontFamily: 'Syne' }}>-{fmt(g.valor)}</p>
          </div>
        ))}
      </div>

      {/* Comparativo vs mês anterior */}
      {dadosAnt && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Comparativo com mês anterior</p>
          {[
            ['Entradas', dados.totalEntradas, dadosAnt.totalEntradas, true],
            ['Gastos variáveis', dados.totalGastos, dadosAnt.totalGastos, false],
            ['Total saídas', dados.totalSaidas, dadosAnt.totalSaidas, false],
            ['Saldo', dados.saldo, dadosAnt.saldo, true],
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
