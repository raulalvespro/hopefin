import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const fmt = v => Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const cats = { mercado: '🛒', transporte: '⛽', saude: '💊', alimentacao: '🍔', vestuario: '👕', lazer: '🎉', assinatura: '📱', outros: '📦' }
const CORES = ['#c8f55a','#60a5fa','#ff6b6b','#fbbf24','#a78bfa','#34d399','#f87171','#38bdf8']

export default function Resumo() {
  const { perfil } = useAuth()
  const [mes, setMes] = useState(new Date())
  const [dados, setDados] = useState(null)
  const [dadosAnt, setDadosAnt] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil, mes])

  async function carregarMes(data) {
    const inicio = format(startOfMonth(data), 'yyyy-MM-dd')
    const fim = format(endOfMonth(data), 'yyyy-MM-dd')
    const gid = perfil.grupo_id

    const [{ data: gastos }, { data: entradas }, { data: fixas }, { data: parcelas }, { data: assinaturas }] = await Promise.all([
      supabase.from('gastos').select('*, usuarios(nome)').eq('grupo_id', gid).gte('data', inicio).lte('data', fim),
      supabase.from('entradas').select('valor').eq('grupo_id', gid).gte('data', inicio).lte('data', fim),
      supabase.from('contas_fixas').select('valor').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('parcelas').select('valor').eq('grupo_id', gid).gte('data_vencimento', inicio).lte('data_vencimento', fim),
      supabase.from('assinaturas').select('valor').eq('grupo_id', gid).eq('ativo', true),
    ])

    const totalEntradas = (entradas||[]).reduce((s,e) => s+Number(e.valor), 0)
    const totalGastos = (gastos||[]).reduce((s,g) => s+Number(g.valor), 0)
    const totalFixas = (fixas||[]).reduce((s,f) => s+Number(f.valor), 0)
    const totalParcelas = (parcelas||[]).reduce((s,p) => s+Number(p.valor), 0)
    const totalAssint = (assinaturas||[]).reduce((s,a) => s+Number(a.valor), 0)
    const totalSaidas = totalGastos + totalFixas + totalParcelas + totalAssint
    const saldo = totalEntradas - totalSaidas

    // Gastos por categoria
    const porCategoria = {}
    ;(gastos||[]).forEach(g => {
      porCategoria[g.categoria] = (porCategoria[g.categoria]||0) + Number(g.valor)
    })

    // Gastos por pessoa
    const porPessoa = {}
    ;(gastos||[]).forEach(g => {
      const nome = g.usuarios?.nome?.split(' ')[0] || 'Desconhecido'
      porPessoa[nome] = (porPessoa[nome]||0) + Number(g.valor)
    })

    return { totalEntradas, totalGastos, totalFixas, totalParcelas, totalAssint, totalSaidas, saldo, porCategoria, porPessoa, gastos: gastos||[] }
  }

  async function carregar() {
    setLoading(true)
    const [d, dAnt] = await Promise.all([carregarMes(mes), carregarMes(subMonths(mes, 1))])
    setDados(d); setDadosAnt(dAnt)
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:32, height:32, border:'3px solid var(--border2)', borderTop:'3px solid var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const varEntradas = dadosAnt?.totalEntradas > 0 ? ((dados.totalEntradas - dadosAnt.totalEntradas) / dadosAnt.totalEntradas * 100).toFixed(0) : null
  const varGastos = dadosAnt?.totalSaidas > 0 ? ((dados.totalSaidas - dadosAnt.totalSaidas) / dadosAnt.totalSaidas * 100).toFixed(0) : null

  const catEntries = Object.entries(dados.porCategoria).sort((a,b) => b[1]-a[1])
  const maxCat = catEntries[0]?.[1] || 1
  const pessoaEntries = Object.entries(dados.porPessoa).sort((a,b) => b[1]-a[1])
  const totalPessoas = pessoaEntries.reduce((s,[,v]) => s+v, 0)

  return (
    <div>
      {/* Navegação de mês */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <button onClick={() => setMes(m => subMonths(m,1))}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h2 style={{ fontSize:16, textTransform:'capitalize' }}>{format(mes, "MMMM 'de' yyyy", { locale: ptBR })}</h2>
        <button onClick={() => setMes(m => { const n = new Date(m); n.setMonth(n.getMonth()+1); return n })}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      {/* Saldo */}
      <div className="card" style={{ marginBottom:16, background: dados.saldo>=0?'var(--accent-dim)':'var(--red-dim)', borderColor: dados.saldo>=0?'var(--accent)':'var(--red)' }}>
        <p style={{ fontSize:12, color:'var(--text2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>Saldo do mês</p>
        <p style={{ fontSize:36, fontFamily:'Syne', fontWeight:700, color: dados.saldo>=0?'var(--accent)':'var(--red)' }}>{fmt(dados.saldo)}</p>
        {dadosAnt && <p style={{ fontSize:12, color:'var(--text2)', marginTop:6 }}>Mês anterior: {fmt(dadosAnt.saldo)}</p>}
      </div>

      {/* Comparativo */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
        <div className="card">
          <p style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>Entradas</p>
          <p style={{ fontSize:20, fontFamily:'Syne', fontWeight:700, color:'var(--accent)' }}>{fmt(dados.totalEntradas)}</p>
          {varEntradas !== null && (
            <p style={{ fontSize:12, marginTop:4, color: varEntradas>=0?'var(--accent)':'var(--red)' }}>
              {varEntradas>=0?'▲':'▼'} {Math.abs(varEntradas)}% vs mês ant.
            </p>
          )}
        </div>
        <div className="card">
          <p style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>Saídas totais</p>
          <p style={{ fontSize:20, fontFamily:'Syne', fontWeight:700, color:'var(--red)' }}>{fmt(dados.totalSaidas)}</p>
          {varGastos !== null && (
            <p style={{ fontSize:12, marginTop:4, color: varGastos<=0?'var(--accent)':'var(--red)' }}>
              {varGastos>=0?'▲':'▼'} {Math.abs(varGastos)}% vs mês ant.
            </p>
          )}
        </div>
      </div>

      {/* Detalhamento saídas */}
      <div className="card" style={{ marginBottom:20 }}>
        <p style={{ fontSize:13, color:'var(--text2)', marginBottom:14 }}>Composição das saídas</p>
        {[
          ['Gastos variáveis', dados.totalGastos, 'var(--red)'],
          ['Contas fixas', dados.totalFixas, 'var(--blue)'],
          ['Assinaturas', dados.totalAssint, 'var(--purple)'],
          ['Parcelas', dados.totalParcelas, 'var(--amber)'],
        ].map(([label, valor, cor]) => {
          const pct = dados.totalSaidas > 0 ? Math.round((valor/dados.totalSaidas)*100) : 0
          return valor > 0 ? (
            <div key={label} style={{ marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:5 }}>
                <span>{label}</span>
                <span style={{ fontWeight:500 }}>{fmt(valor)} <span style={{ color:'var(--text3)', fontSize:11 }}>({pct}%)</span></span>
              </div>
              <div style={{ background:'var(--bg3)', borderRadius:4, height:6, overflow:'hidden' }}>
                <div style={{ width:`${pct}%`, height:'100%', background:cor, borderRadius:4, transition:'width 0.4s' }} />
              </div>
            </div>
          ) : null
        })}
      </div>

      {/* Gastos por categoria */}
      {catEntries.length > 0 && (
        <div className="card" style={{ marginBottom:20 }}>
          <p style={{ fontSize:13, color:'var(--text2)', marginBottom:14 }}>Gastos por categoria</p>
          {catEntries.map(([cat, valor], i) => {
            const pct = Math.round((valor/maxCat)*100)
            const pctTotal = dados.totalGastos > 0 ? Math.round((valor/dados.totalGastos)*100) : 0
            return (
              <div key={cat} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:5 }}>
                  <span>{cats[cat]||'📦'} {cat}</span>
                  <span style={{ fontWeight:500 }}>{fmt(valor)} <span style={{ color:'var(--text3)', fontSize:11 }}>({pctTotal}%)</span></span>
                </div>
                <div style={{ background:'var(--bg3)', borderRadius:4, height:8, overflow:'hidden' }}>
                  <div style={{ width:`${pct}%`, height:'100%', background:CORES[i%CORES.length], borderRadius:4, transition:'width 0.4s' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Quem gastou mais */}
      {pessoaEntries.length > 0 && (
        <div className="card" style={{ marginBottom:20 }}>
          <p style={{ fontSize:13, color:'var(--text2)', marginBottom:14 }}>Gastos por pessoa</p>
          {pessoaEntries.map(([nome, valor], i) => {
            const pct = totalPessoas > 0 ? Math.round((valor/totalPessoas)*100) : 0
            return (
              <div key={nome} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:5 }}>
                  <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ width:28, height:28, borderRadius:'50%', background:CORES[i%CORES.length]+'33', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:CORES[i%CORES.length] }}>
                      {nome[0].toUpperCase()}
                    </span>
                    {nome}
                  </span>
                  <span style={{ fontWeight:500 }}>{fmt(valor)} <span style={{ color:'var(--text3)', fontSize:11 }}>({pct}%)</span></span>
                </div>
                <div style={{ background:'var(--bg3)', borderRadius:4, height:8, overflow:'hidden' }}>
                  <div style={{ width:`${pct}%`, height:'100%', background:CORES[i%CORES.length], borderRadius:4 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Comparativo vs mês anterior */}
      {dadosAnt && (
        <div className="card" style={{ marginBottom:20 }}>
          <p style={{ fontSize:13, color:'var(--text2)', marginBottom:14 }}>Comparativo com mês anterior</p>
          {[
            ['Entradas', dados.totalEntradas, dadosAnt.totalEntradas, true],
            ['Gastos variáveis', dados.totalGastos, dadosAnt.totalGastos, false],
            ['Total saídas', dados.totalSaidas, dadosAnt.totalSaidas, false],
            ['Saldo', dados.saldo, dadosAnt.saldo, true],
          ].map(([label, atual, anterior, maiorEBom]) => {
            const diff = atual - anterior
            const bom = maiorEBom ? diff >= 0 : diff <= 0
            return (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:13, color:'var(--text2)' }}>{label}</span>
                <div style={{ textAlign:'right' }}>
                  <p style={{ fontSize:14, fontWeight:500, fontFamily:'Syne' }}>{fmt(atual)}</p>
                  {diff !== 0 && (
                    <p style={{ fontSize:11, color: bom?'var(--accent)':'var(--red)' }}>
                      {diff>0?'+':''}{fmt(diff)} vs ant.
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
