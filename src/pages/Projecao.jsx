import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown, ChevronUp } from 'lucide-react'

const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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

    const [{ data: fixas }, { data: entradas }, { data: parcelas }, { data: parcelamentos }] = await Promise.all([
      supabase.from('contas_fixas').select('*').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('entradas').select('*').eq('grupo_id', gid).eq('recorrente', true),
      supabase.from('parcelas').select('*, parcelamentos(descricao, categoria)').eq('grupo_id', gid).eq('paga', false).gte('data_vencimento', format(hoje, 'yyyy-MM-dd')),
      supabase.from('parcelamentos').select('*').eq('grupo_id', gid),
    ])

    const resultado = []

    for (let i = 0; i < 6; i++) {
      const mes = addMonths(hoje, i)
      const inicio = format(startOfMonth(mes), 'yyyy-MM-dd')
      const fim = format(endOfMonth(mes), 'yyyy-MM-dd')

      const parcelasMes = (parcelas || []).filter(p => p.data_vencimento >= inicio && p.data_vencimento <= fim)
      const totalParcelas = parcelasMes.reduce((s, p) => s + p.valor, 0)
      const totalFixas = (fixas || []).reduce((s, f) => s + f.valor, 0)
      const totalEntradas = (entradas || []).reduce((s, e) => s + e.valor, 0)
      const totalSaidas = totalFixas + totalParcelas
      const saldo = totalEntradas - totalSaidas

      resultado.push({
        mes,
        label: format(mes, "MMMM 'de' yyyy", { locale: ptBR }),
        entradas: totalEntradas,
        fixas: fixas || [],
        totalFixas,
        parcelas: parcelasMes,
        totalParcelas,
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
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Próximos 6 meses com base em fixos, parcelas e entradas recorrentes</p>

      {meses.map((m, i) => (
        <div key={i} className="card" style={{ marginBottom: 10, borderColor: m.isAtual ? 'var(--accent)' : 'var(--border)' }}>
          <button style={{ width: '100%', textAlign: 'left' }} onClick={() => toggleMes(i)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, textTransform: 'capitalize' }}>
                  {m.label} {m.isAtual && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 6 }}>● atual</span>}
                </p>
                <p style={{ fontSize: 13, color: m.saldo >= 0 ? 'var(--accent)' : 'var(--red)', marginTop: 2 }}>
                  Saldo projetado: {fmt(m.saldo)}
                </p>
              </div>
              {abertos[i] ? <ChevronUp size={18} color="var(--text2)" /> : <ChevronDown size={18} color="var(--text2)" />}
            </div>

            {/* Barra visual */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10 }}>
              {[['Entradas', m.entradas, 'var(--accent)'], ['Fixas', m.totalFixas, 'var(--blue)'], ['Parcelas', m.totalParcelas, 'var(--amber)']].map(([l, v, c]) => (
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

              {m.fixas.length > 0 && (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Contas fixas</p>
                  {m.fixas.map(f => (
                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span>{f.nome} <span style={{ color: 'var(--text3)', fontSize: 11 }}>· dia {f.dia_vencimento}</span></span>
                      <span style={{ color: 'var(--blue)', fontWeight: 500 }}>{fmt(f.valor)}</span>
                    </div>
                  ))}
                </>
              )}

              {m.parcelas.length > 0 && (
                <>
                  <div className="divider" style={{ margin: '10px 0' }} />
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Parcelas</p>
                  {m.parcelas.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span>{p.parcelamentos?.descricao}</span>
                      <span style={{ color: 'var(--amber)', fontWeight: 500 }}>{fmt(p.valor)}</span>
                    </div>
                  ))}
                </>
              )}

              <div className="divider" style={{ margin: '10px 0' }} />
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
