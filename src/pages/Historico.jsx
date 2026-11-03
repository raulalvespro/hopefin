import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useCategorias } from '../hooks/useCategorias'
import { fmt, fmtData, parseDataLocal } from '../lib/format'
import { History } from 'lucide-react'

const DIAS = 90   // janela do feed

// Rótulo do grupo de um dia: Hoje / Ontem / data por extra.
function rotuloDia(iso) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const d = parseDataLocal(iso); d.setHours(0, 0, 0, 0)
  const diff = Math.round((hoje - d) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  return fmtData(iso, "EEEE, dd 'de' MMMM")
}

export default function Historico() {
  const { perfil } = useAuth()
  const { emojiDe } = useCategorias()
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!perfil?.grupo_id) return
    ;(async () => {
      setLoading(true)
      const gid = perfil.grupo_id
      const desde = new Date(); desde.setDate(desde.getDate() - DIAS)
      const desdeISO = desde.toISOString().slice(0, 10)

      const [gastos, entradas, transf] = await Promise.all([
        supabase.from('gastos').select('id, descricao, valor, categoria, data, usuarios(nome)').eq('grupo_id', gid).gte('data', desdeISO).order('data', { ascending: false }),
        supabase.from('entradas').select('id, descricao, valor, data, usuarios(nome)').eq('grupo_id', gid).gte('data', desdeISO).order('data', { ascending: false }),
        supabase.from('transferencias').select('id, valor, descricao, data, cofrinhos(nome), usuarios(nome)').eq('grupo_id', gid).gte('data', desdeISO).order('data', { ascending: false }),
      ])

      const out = []
      ;(gastos.data || []).forEach(g => out.push({
        id: `g-${g.id}`, tipo: 'gasto', emoji: emojiDe(g.categoria), titulo: g.descricao,
        sub: g.categoria, valor: -Number(g.valor), data: g.data, quem: g.usuarios?.nome,
      }))
      ;(entradas.data || []).forEach(e => out.push({
        id: `e-${e.id}`, tipo: 'entrada', emoji: '💰', titulo: e.descricao,
        sub: 'Entrada', valor: Number(e.valor), data: e.data, quem: e.usuarios?.nome,
      }))
      ;(transf.data || []).forEach(t => out.push({
        id: `t-${t.id}`, tipo: 'cofrinho', emoji: '🐷', titulo: t.descricao || `Aporte em ${t.cofrinhos?.nome || 'cofrinho'}`,
        sub: t.cofrinhos?.nome ? `Cofrinho · ${t.cofrinhos.nome}` : 'Cofrinho', valor: -Number(t.valor), data: t.data, quem: t.usuarios?.nome,
      }))

      out.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
      setEventos(out)
      setLoading(false)
    })()
  }, [perfil, emojiDe])

  // Agrupa por dia preservando a ordem (já vem decrescente).
  const grupos = []
  eventos.forEach(ev => {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.dia === ev.data) ultimo.itens.push(ev)
    else grupos.push({ dia: ev.data, itens: [ev] })
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <History size={22} color="var(--accent)" />
        <h1 style={{ fontSize: 22 }}>Histórico</h1>
      </div>

      {loading ? (
        <div className="empty-state">Carregando…</div>
      ) : eventos.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: 28, marginBottom: 8 }}>🗒️</p>
          <p>Nada por aqui nos últimos {DIAS} dias.</p>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Gastos, entradas e aportes vão aparecer nesta linha do tempo.</p>
        </div>
      ) : (
        grupos.map(({ dia, itens }) => {
          const total = itens.reduce((s, i) => s + i.valor, 0)
          return (
            <div key={dia} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, padding: '0 2px' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'capitalize' }}>{rotuloDia(dia)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: total >= 0 ? 'var(--accent)' : 'var(--text3)' }}>
                  {total >= 0 ? '+' : ''}{fmt(total)}
                </span>
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {itens.map((ev, idx) => (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: idx ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{ev.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.titulo}</p>
                      <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 1, textTransform: 'capitalize' }}>
                        {ev.sub}{ev.quem ? ` · ${ev.quem.split(' ')[0]}` : ''}
                      </p>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Syne', flexShrink: 0, color: ev.valor >= 0 ? 'var(--accent)' : 'var(--text)' }}>
                      {ev.valor >= 0 ? '+' : '−'}{fmt(Math.abs(ev.valor))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
