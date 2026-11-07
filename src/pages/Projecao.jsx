import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, getDaysInMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown, ChevronUp, FileText, Layers, CreditCard } from 'lucide-react'

const fmt = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const parseData = d => new Date(d + 'T12:00:00')
const bandeiras = { Visa: '💙', Mastercard: '🔴', Elo: '🟡', Amex: '🟢', Hipercard: '🔵' }
const clampDay = (y, m, d) => Math.min(d, getDaysInMonth(new Date(y, m, 1)))

// Valor da fatura de um cartão que VENCE em (anoV, mesV)
function faturaCartaoNoMes(card, gastosCartao, parcelasCartao, anoV, mesV) {
  const diaF = card.dia_fechamento || 1
  const diaV = card.dia_vencimento || 10

  // Mês/ano do fechamento que gera vencimento nesse mês
  let fechaY = anoV, fechaM = mesV
  if (diaV <= diaF) { fechaM = mesV - 1; if (fechaM < 0) { fechaM = 11; fechaY = anoV - 1 } }
  const fecha = new Date(fechaY, fechaM, clampDay(fechaY, fechaM, diaF))

  // Abertura = fechamento do mês anterior
  let abreY = fechaY, abreM = fechaM - 1
  if (abreM < 0) { abreM = 11; abreY = fechaY - 1 }
  const abre = new Date(abreY, abreM, clampDay(abreY, abreM, diaF))

  const venc = new Date(anoV, mesV, clampDay(anoV, mesV, diaV))
  const inCycle = d => d > abre && d <= fecha

  const compras = gastosCartao
    .filter(g => g.cartao_id === card.id && inCycle(parseData(g.data)))
    .reduce((s, g) => s + Number(g.valor), 0)

  const parcelasMes = parcelasCartao.filter(p =>
    p.cartao_id === card.id &&
    parseData(p.data_vencimento).getFullYear() === anoV &&
    parseData(p.data_vencimento).getMonth() === mesV
  )
  const totalParcelas = parcelasMes.reduce((s, p) => s + Number(p.valor), 0)

  return { total: compras + totalParcelas, compras, parcelas: parcelasMes, venc }
}

export default function Projecao() {
  const { perfil } = useAuth()
  const [meses, setMeses] = useState([])
  const [abertos, setAbertos] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    setLoading(true)
    const gid = perfil.grupo_id
    const hoje = new Date()
    const janelaGastos = format(startOfMonth(subMonths(hoje, 2)), 'yyyy-MM-dd')
    const compInicio = format(hoje, 'yyyy-MM')
    const compFim = format(addMonths(hoje, 5), 'yyyy-MM')

    const [{ data: fixas }, { data: entradas }, { data: parcelas }, { data: cartoes }, { data: gastosCartao }, { data: lancFixas }] = await Promise.all([
      supabase.from('contas_fixas').select('*').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('entradas').select('*').eq('grupo_id', gid).eq('recorrente', true),
      supabase.from('parcelas').select('*, parcelamentos(descricao, categoria, cartao_id, cartoes(nome))').eq('grupo_id', gid).eq('paga', false).gte('data_vencimento', format(startOfMonth(hoje), 'yyyy-MM-dd')),
      supabase.from('cartoes').select('*').eq('grupo_id', gid).eq('ativo', true).order('nome'),
      supabase.from('gastos').select('valor, data, cartao_id').eq('grupo_id', gid).not('cartao_id', 'is', null).gte('data', janelaGastos),
      supabase.from('fixas_lancamentos').select('competencia, conta_fixa_id, valor_real').eq('grupo_id', gid).gte('competencia', compInicio).lte('competencia', compFim),
    ])

    // Real lançado por (competência|conta_fixa_id) — substitui o previsto quando existe
    const realPorComp = {}
    ;(lancFixas || []).forEach(l => { if (l.valor_real != null) realPorComp[`${l.competencia}|${l.conta_fixa_id}`] = Number(l.valor_real) })

    // Entradas recorrentes = uma ocorrência mensal por (descrição + pessoa), valor mais recente
    const recorrentesUnicas = {}
    ;(entradas || []).slice().sort((a, b) => b.data.localeCompare(a.data)).forEach(e => {
      const k = `${e.descricao}|${e.usuario_id}`
      if (!(k in recorrentesUnicas)) recorrentesUnicas[k] = Number(e.valor)
    })
    const totalEntradas = Object.values(recorrentesUnicas).reduce((s, v) => s + v, 0)

    // Achatar cartao_id das parcelas
    const parcelasFlat = (parcelas || []).map(p => ({
      id: p.id,
      valor: Number(p.valor),
      data_vencimento: p.data_vencimento,
      descricao: p.parcelamentos?.descricao,
      numero: p.numero,
      cartao_id: p.parcelamentos?.cartao_id || null,
    }))

    const resultado = []

    for (let i = 0; i < 6; i++) {
      const mes = addMonths(hoje, i)
      const anoV = mes.getFullYear()
      const mesV = mes.getMonth()
      const comp = format(mes, 'yyyy-MM')
      const inicio = format(startOfMonth(mes), 'yyyy-MM-dd')
      const fim = format(endOfMonth(mes), 'yyyy-MM-dd')

      // Contas fixas do mês: usa o real lançado na competência quando houver
      const fixasMes = (fixas || []).map(f => {
        const real = realPorComp[`${comp}|${f.id}`]
        return { ...f, efetivo: real != null ? real : Number(f.valor), temReal: real != null }
      })
      const totalFixas = fixasMes.reduce((s, f) => s + f.efetivo, 0)

      // Parcelas FORA de cartão (ex: PIX da pós) que vencem no mês
      const parcelasFora = parcelasFlat.filter(p => !p.cartao_id && p.data_vencimento >= inicio && p.data_vencimento <= fim)
      const totalParcelasFora = parcelasFora.reduce((s, p) => s + p.valor, 0)

      // Fatura de cada cartão que vence no mês
      const faturas = (cartoes || []).map(c => {
        const f = faturaCartaoNoMes(c, gastosCartao || [], parcelasFlat, anoV, mesV)
        return { cartao: c, ...f }
      }).filter(f => f.total > 0)
      const totalCartoes = faturas.reduce((s, f) => s + f.total, 0)

      const totalSaidas = totalFixas + totalParcelasFora + totalCartoes
      const saldo = totalEntradas - totalSaidas

      resultado.push({
        mes,
        label: format(mes, "MMMM 'de' yyyy", { locale: ptBR }),
        entradas: totalEntradas,
        fixas: fixasMes,
        totalFixas,
        parcelasFora,
        totalParcelasFora,
        faturas,
        totalCartoes,
        totalSaidas,
        saldo,
        isAtual: i === 0,
      })
    }

    setMeses(resultado)
    setLoading(false)
  }

  function toggleMes(i) {
    setAbertos(p => ({ ...p, [i]: !p[i] }))
  }

  if (loading) return <div className="empty-state">Carregando projeção...</div>

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 6 }}>Projeção</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Próximos 6 meses com base em contas fixas, parcelamentos e faturas dos cartões</p>

      {meses.map((m, i) => (
        <div key={i} className="card" style={{ marginBottom: 10, borderColor: m.isAtual ? 'var(--accent)' : 'var(--border)' }}>
          <button style={{ width: '100%', textAlign: 'left' }} onClick={() => toggleMes(i)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, textTransform: 'capitalize' }}>
                  {m.label} {m.isAtual && <span style={{ fontSize: 11, color: 'var(--accent-text)', marginLeft: 6 }}>● atual</span>}
                </p>
                <p style={{ fontSize: 13, color: m.saldo >= 0 ? 'var(--accent)' : 'var(--red)', marginTop: 2 }}>
                  Saldo projetado: {fmt(m.saldo)}
                </p>
              </div>
              {abertos[i] ? <ChevronUp size={18} color="var(--text2)" /> : <ChevronDown size={18} color="var(--text2)" />}
            </div>

            {/* Resumo entradas x saídas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
              {[['Entradas', m.entradas, 'var(--accent)'], ['Saídas', m.totalSaidas, 'var(--red)']].map(([l, v, c]) => (
                <div key={l} style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                  <p style={{ fontSize: 10, color: 'var(--text2)' }}>{l}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: c, fontFamily: 'Syne' }}>{fmt(v)}</p>
                </div>
              ))}
            </div>
          </button>

          {/* Detalhes expandidos */}
          {abertos[i] && (
            <div style={{ marginTop: 14 }}>
              <div className="divider" style={{ margin: '0 0 12px' }} />

              {/* Contas fixas */}
              {m.fixas.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileText size={13} color="var(--blue)" /> Contas fixas
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-text)' }}>{fmt(m.totalFixas)}</span>
                  </div>
                  {m.fixas.map(f => (
                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span>{f.nome} <span style={{ color: 'var(--text3)', fontSize: 11 }}>· dia {f.dia_vencimento}{f.temReal ? ' · real' : ''}</span></span>
                      <span style={{ color: f.temReal ? 'var(--accent)' : 'var(--text2)' }}>{fmt(f.efetivo)}</span>
                    </div>
                  ))}
                </>
              )}

              {/* Parcelamentos fora de cartão */}
              {m.parcelasFora.length > 0 && (
                <>
                  <div className="divider" style={{ margin: '10px 0' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Layers size={13} color="var(--purple)" /> Parcelamentos
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple-text)' }}>{fmt(m.totalParcelasFora)}</span>
                  </div>
                  {m.parcelasFora.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span>{p.descricao}</span>
                      <span style={{ color: 'var(--text2)' }}>{fmt(p.valor)}</span>
                    </div>
                  ))}
                </>
              )}

              {/* Faturas por cartão */}
              {m.faturas.map(f => (
                <div key={f.cartao.id}>
                  <div className="divider" style={{ margin: '10px 0' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CreditCard size={13} color="var(--amber)" /> {bandeiras[f.cartao.bandeira] || '💳'} {f.cartao.nome}
                      <span style={{ color: 'var(--text3)' }}>· vence {format(f.venc, 'dd/MM')}</span>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber-text)' }}>{fmt(f.total)}</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
                    {f.compras > 0 && `${fmt(f.compras)} em compras`}
                    {f.compras > 0 && f.parcelas.length > 0 && ' · '}
                    {f.parcelas.length > 0 && `${f.parcelas.length} parcela${f.parcelas.length > 1 ? 's' : ''}`}
                  </p>
                  {f.parcelas.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5, paddingLeft: 4 }}>
                      <span style={{ color: 'var(--text2)' }}>↳ {p.descricao}</span>
                      <span style={{ color: 'var(--text3)' }}>{fmt(p.valor)}</span>
                    </div>
                  ))}
                </div>
              ))}

              <div className="divider" style={{ margin: '10px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--text2)' }}>Entradas</span>
                <span style={{ color: 'var(--accent-text)', fontWeight: 500 }}>{fmt(m.entradas)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10 }}>
                <span style={{ color: 'var(--text2)' }}>Saídas totais</span>
                <span style={{ color: 'var(--red-text)', fontWeight: 500 }}>{fmt(m.totalSaidas)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontFamily: 'Syne' }}>
                <span>Saldo projetado</span>
                <span style={{ color: m.saldo >= 0 ? 'var(--accent)' : 'var(--red)' }}>{fmt(m.saldo)}</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
