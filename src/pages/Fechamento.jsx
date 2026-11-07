import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, subMonths, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, PiggyBank, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useCategorias } from '../hooks/useCategorias'
import { fmt } from '../lib/format'

const ehMesCorrente = d => format(d, 'yyyy-MM') === format(new Date(), 'yyyy-MM')

// Calcula o resumo fechado de uma competência 'yyyy-MM'.
async function resumoDoMes(gid, ym) {
  const [ano, mes] = ym.split('-').map(Number)
  const ini = `${ym}-01`
  const ultimo = new Date(ano, mes, 0).getDate()
  const fim = `${ym}-${String(ultimo).padStart(2, '0')}`

  const [ent, gas, fix, lanc, parc, ass, tr] = await Promise.all([
    supabase.from('entradas').select('valor').eq('grupo_id', gid).gte('data', ini).lte('data', fim),
    supabase.from('gastos').select('valor, categoria').eq('grupo_id', gid).gte('data', ini).lte('data', fim),
    supabase.from('contas_fixas').select('id, valor, categoria').eq('grupo_id', gid).eq('ativo', true),
    supabase.from('fixas_lancamentos').select('conta_fixa_id, valor_real').eq('grupo_id', gid).eq('competencia', ym),
    supabase.from('parcelas').select('valor, parcelamentos(categoria)').eq('grupo_id', gid).gte('data_vencimento', ini).lte('data_vencimento', fim),
    supabase.from('assinaturas').select('valor').eq('grupo_id', gid).eq('ativo', true),
    supabase.from('transferencias').select('valor').eq('grupo_id', gid).gte('data', ini).lte('data', fim),
  ])

  const realPorConta = {}
  ;(lanc.data || []).forEach(l => { if (l.valor_real != null) realPorConta[l.conta_fixa_id] = Number(l.valor_real) })

  const receitas = (ent.data || []).reduce((s, e) => s + Number(e.valor), 0)
  const gastosVar = (gas.data || []).reduce((s, g) => s + Number(g.valor), 0)
  const parcelas = (parc.data || []).reduce((s, p) => s + Number(p.valor), 0)
  const assinaturas = (ass.data || []).reduce((s, a) => s + Number(a.valor), 0)

  const fixasPrevisto = (fix.data || []).reduce((s, f) => s + Number(f.valor), 0)
  const fixas = (fix.data || []).reduce((s, f) => s + (f.id in realPorConta ? realPorConta[f.id] : Number(f.valor)), 0)

  const despesas = gastosVar + fixas + parcelas + assinaturas
  const resultado = receitas - despesas
  const guardado = (tr.data || []).reduce((s, t) => s + (Number(t.valor) > 0 ? Number(t.valor) : 0), 0)
  const poupanca = receitas > 0 ? guardado / receitas : null

  // Gastos por categoria (unificado: variável + fixa real + parcela + assinaturas)
  const porCat = {}
  const add = (cat, v) => { const k = cat || 'outros'; porCat[k] = (porCat[k] || 0) + v }
  ;(gas.data || []).forEach(g => add(g.categoria, Number(g.valor)))
  ;(fix.data || []).forEach(f => add(f.categoria, f.id in realPorConta ? realPorConta[f.id] : Number(f.valor)))
  ;(parc.data || []).forEach(p => add(p.parcelamentos?.categoria, Number(p.valor)))
  if (assinaturas > 0) add('assinaturas', assinaturas)
  const categorias = Object.entries(porCat).sort((a, b) => b[1] - a[1])

  return { receitas, despesas, resultado, gastosVar, fixas, fixasPrevisto, parcelas, assinaturas, guardado, poupanca, categorias }
}

function Delta({ atual, anterior, invertido = false }) {
  if (anterior == null || anterior === 0) return null
  const dif = atual - anterior
  if (Math.abs(dif) < 0.01) return <span style={{ fontSize: 11, color: 'var(--text3)' }}>igual ao mês anterior</span>
  const pct = Math.round((dif / Math.abs(anterior)) * 100)
  // invertido: subir é ruim (despesa). normal: subir é bom (receita).
  const bom = invertido ? dif < 0 : dif > 0
  const cor = bom ? 'var(--accent)' : 'var(--red)'
  const Icon = dif > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span style={{ fontSize: 11, color: cor, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <Icon size={12} /> {Math.abs(pct)}% vs mês anterior
    </span>
  )
}

export default function Fechamento() {
  const { perfil } = useAuth()
  const { emojiDe } = useCategorias()
  const [mes, setMes] = useState(startOfMonth(new Date()))
  const [atual, setAtual] = useState(null)
  const [anterior, setAnterior] = useState(null)
  const [loading, setLoading] = useState(true)

  const ym = format(mes, 'yyyy-MM')

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil, ym])

  async function carregar() {
    setLoading(true)
    const gid = perfil.grupo_id
    const [a, b] = await Promise.all([
      resumoDoMes(gid, ym),
      resumoDoMes(gid, format(subMonths(mes, 1), 'yyyy-MM')),
    ])
    setAtual(a); setAnterior(b)
    setLoading(false)
  }

  const positivo = atual && atual.resultado >= 0
  const maxCat = atual && atual.categorias.length ? atual.categorias[0][1] : 0

  const linhasSaida = atual ? [
    ['Gastos variáveis', atual.gastosVar, 'var(--red)'],
    ['Contas fixas', atual.fixas, 'var(--amber)'],
    ['Parcelas', atual.parcelas, 'var(--purple)'],
    ['Assinaturas', atual.assinaturas, 'var(--blue)'],
  ].filter(l => l[1] > 0) : []

  return (
    <div>
      {/* Navegação de mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={() => setMes(m => subMonths(m, 1))} style={{ padding: 8, color: 'var(--text2)' }}><ChevronLeft size={20} /></button>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, textTransform: 'capitalize' }}>{format(mes, 'MMMM yyyy', { locale: ptBR })}</h2>
          <p style={{ fontSize: 11, color: 'var(--text3)' }}>Fechamento do mês</p>
        </div>
        <button onClick={() => setMes(m => addMonths(m, 1))} disabled={ehMesCorrente(mes)} style={{ padding: 8, color: ehMesCorrente(mes) ? 'var(--text3)' : 'var(--text2)', opacity: ehMesCorrente(mes) ? 0.4 : 1 }}><ChevronRight size={20} /></button>
      </div>

      {loading || !atual ? <div className="empty-state">Fechando as contas...</div> : (
        <>
          {/* Resultado do mês */}
          <div className="card" style={{ marginBottom: 16, textAlign: 'center', background: positivo ? 'var(--accent-dim)' : 'var(--red-dim)', borderColor: positivo ? 'var(--accent)' : 'var(--red)' }}>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>{positivo ? 'Sobrou no mês' : 'Faltou no mês'}</p>
            <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 32, color: positivo ? 'var(--accent2)' : 'var(--red)' }}>
              {fmt(Math.abs(atual.resultado))}
            </p>
            <div style={{ marginTop: 4 }}><Delta atual={atual.resultado} anterior={anterior?.resultado} /></div>
          </div>

          {/* Receitas × Despesas */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <TrendingUp size={15} color="var(--accent)" />
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>Entrou</span>
                </div>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 19, color: 'var(--accent-text)' }}>{fmt(atual.receitas)}</p>
                <Delta atual={atual.receitas} anterior={anterior?.receitas} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>Saiu</span>
                  <TrendingDown size={15} color="var(--red)" />
                </div>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 19, color: 'var(--red-text)' }}>{fmt(atual.despesas)}</p>
                <Delta atual={atual.despesas} anterior={anterior?.despesas} invertido />
              </div>
            </div>
            {/* barra proporção */}
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--bg3)' }}>
              <div style={{ width: `${Math.min(100, atual.receitas + atual.despesas > 0 ? (atual.receitas / (atual.receitas + atual.despesas)) * 100 : 50)}%`, background: 'var(--accent)' }} />
              <div style={{ flex: 1, background: 'var(--red)' }} />
            </div>
          </div>

          {/* Para onde foi o dinheiro */}
          {linhasSaida.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 14, marginBottom: 12 }}>Para onde foi</p>
              {linhasSaida.map(([label, valor, cor]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor }} />
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt(valor)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Top categorias */}
          {atual.categorias.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 14, marginBottom: 12 }}>Maiores categorias</p>
              {atual.categorias.slice(0, 5).map(([cat, valor]) => (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ textTransform: 'capitalize' }}>{cat === 'assinaturas' ? '📺' : emojiDe(cat)} {cat}</span>
                    <span style={{ fontWeight: 600 }}>{fmt(valor)}</span>
                  </div>
                  <div style={{ background: 'var(--bg3)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${maxCat ? (valor / maxCat) * 100 : 0}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Contas fixas: previsto × realizado */}
          {atual.fixasPrevisto > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 14, marginBottom: 12 }}>Contas fixas: previsto × realizado</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--text2)' }}>Previsto</span><span>{fmt(atual.fixasPrevisto)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--text2)' }}>Realizado</span><span style={{ fontWeight: 600 }}>{fmt(atual.fixas)}</span>
              </div>
              <div className="divider" style={{ margin: '8px 0' }} />
              {(() => {
                const dif = atual.fixas - atual.fixasPrevisto
                const cor = dif > 0 ? 'var(--red)' : 'var(--accent)'
                const txt = Math.abs(dif) < 0.01 ? 'Exatamente no previsto' : dif > 0 ? `${fmt(dif)} acima do previsto` : `${fmt(Math.abs(dif))} abaixo do previsto`
                return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}><span>Diferença</span><span style={{ color: cor }}>{txt}</span></div>
              })()}
            </div>
          )}

          {/* Poupança */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <PiggyBank size={17} color="var(--accent)" />
              <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 14 }}>Quanto você guardou</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20, color: 'var(--accent-text)' }}>{fmt(atual.guardado)}</span>
              {atual.poupanca != null && (
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {Math.round(atual.poupanca * 100)}% do que entrou
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
