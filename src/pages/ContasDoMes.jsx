import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, subMonths, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Check, CalendarCheck } from 'lucide-react'
import { useCategorias } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { fmt, hojeISO } from '../lib/format'

export default function ContasDoMes() {
  const { perfil } = useAuth()
  const { emojiDe } = useCategorias()
  const run = useDb()
  const [mes, setMes] = useState(startOfMonth(new Date()))
  const [contas, setContas] = useState([])
  const [lancMap, setLancMap] = useState({})   // conta_fixa_id -> lançamento
  const [valores, setValores] = useState({})   // conta_fixa_id -> string do input de valor real
  const [loading, setLoading] = useState(true)

  const competencia = format(mes, 'yyyy-MM')

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil, competencia])

  async function carregar() {
    setLoading(true)
    const gid = perfil.grupo_id
    const [{ data: cf }, { data: lanc }] = await Promise.all([
      supabase.from('contas_fixas').select('id, nome, valor, categoria, dia_vencimento').eq('grupo_id', gid).eq('ativo', true).order('dia_vencimento'),
      supabase.from('fixas_lancamentos').select('*').eq('grupo_id', gid).eq('competencia', competencia),
    ])
    const map = {}
    ;(lanc || []).forEach(l => { map[l.conta_fixa_id] = l })
    const vals = {}
    ;(cf || []).forEach(c => { vals[c.id] = map[c.id]?.valor_real != null ? String(map[c.id].valor_real) : '' })
    setContas(cf || [])
    setLancMap(map)
    setValores(vals)
    setLoading(false)
  }

  // Upsert do lançamento da competência (snapshot do previsto = valor atual da conta fixa)
  async function salvarLanc(conta, patch) {
    const atual = lancMap[conta.id] || {}
    const payload = {
      grupo_id: perfil.grupo_id,
      conta_fixa_id: conta.id,
      competencia,
      valor_previsto: conta.valor,
      valor_real: atual.valor_real ?? null,
      pago: atual.pago ?? false,
      data_pagamento: atual.data_pagamento ?? null,
      atualizado_em: new Date().toISOString(),
      ...patch,
    }
    const { data, error } = await run(
      supabase.from('fixas_lancamentos').upsert(payload, { onConflict: 'conta_fixa_id,competencia' }).select().single(),
      { ok: patch.pago !== undefined ? (patch.pago ? 'Marcada como paga' : 'Pagamento desfeito') : 'Valor lançado' }
    )
    if (!error && data) setLancMap(m => ({ ...m, [conta.id]: data }))
    return { data, error }
  }

  function onBlurReal(conta) {
    const raw = valores[conta.id]
    const novo = raw === '' ? null : parseFloat(raw)
    const antigo = lancMap[conta.id]?.valor_real ?? null
    if (novo === antigo) return
    if (raw !== '' && Number.isNaN(novo)) return
    salvarLanc(conta, { valor_real: novo })
  }

  function togglePago(conta) {
    const jaPago = lancMap[conta.id]?.pago ?? false
    salvarLanc(conta, { pago: !jaPago, data_pagamento: !jaPago ? hojeISO() : null })
  }

  // ----- Agregados do mês -----
  const linhas = contas.map(c => {
    const l = lancMap[c.id]
    const previsto = Number(c.valor)
    const real = l?.valor_real != null ? Number(l.valor_real) : null
    const diff = real != null ? real - previsto : null
    return { conta: c, previsto, real, diff, pago: l?.pago ?? false }
  })
  const totalPrevisto = linhas.reduce((s, x) => s + x.previsto, 0)
  const lancadas = linhas.filter(x => x.real != null)
  const totalReal = lancadas.reduce((s, x) => s + x.real, 0)
  // real efetivo = usa o real quando lançado, senão o previsto (projeção do mês)
  const totalEfetivo = linhas.reduce((s, x) => s + (x.real != null ? x.real : x.previsto), 0)
  const difMes = totalEfetivo - totalPrevisto
  const totalPago = linhas.filter(x => x.pago).reduce((s, x) => s + (x.real != null ? x.real : x.previsto), 0)

  // Relatório por categoria
  const porCat = {}
  linhas.forEach(x => {
    const cat = x.conta.categoria || 'outros'
    if (!porCat[cat]) porCat[cat] = { previsto: 0, efetivo: 0 }
    porCat[cat].previsto += x.previsto
    porCat[cat].efetivo += (x.real != null ? x.real : x.previsto)
  })
  const catEntries = Object.entries(porCat).sort((a, b) => b[1].efetivo - a[1].efetivo)

  const corDif = d => d > 0 ? 'var(--red)' : d < 0 ? 'var(--accent)' : 'var(--text2)'
  const sinal = d => d > 0 ? '+' : ''

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <CalendarCheck size={20} color="var(--accent)" />
        <h2 style={{ fontSize: 20 }}>Contas do mês</h2>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        Lance quanto cada conta fixa veio de verdade e acompanhe a diferença do planejado.
      </p>

      {/* Navegação de mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => setMes(m => subMonths(m, 1))}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h3 style={{ fontSize: 15, textTransform: 'capitalize' }}>{format(mes, "MMMM 'de' yyyy", { locale: ptBR })}</h3>
        <button onClick={() => setMes(m => addMonths(m, 1))}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      {loading ? <div className="empty-state">Carregando...</div>
        : contas.length === 0 ? <div className="empty-state">Nenhuma conta fixa cadastrada. Crie em "Contas fixas".</div>
        : (
          <>
            {/* Resumo do mês */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text2)' }}>Previsto</p>
                  <p style={{ fontSize: 18, fontFamily: 'Syne', fontWeight: 700 }}>{fmt(totalPrevisto)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text2)' }}>Realizado {lancadas.length}/{linhas.length}</p>
                  <p style={{ fontSize: 18, fontFamily: 'Syne', fontWeight: 700, color: 'var(--blue)' }}>{fmt(totalReal)}</p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Diferença do mês</span>
                <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Syne', color: corDif(difMes) }}>
                  {sinal(difMes)}{fmt(difMes)}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                Já pago: {fmt(totalPago)} · diferença usa o real onde lançado, previsto no resto.
              </p>
            </div>

            {/* Lista de contas */}
            {linhas.map(({ conta, previsto, real, diff, pago }) => (
              <div key={conta.id} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => togglePago(conta)} title={pago ? 'Desmarcar pago' : 'Marcar como paga'}
                      style={{ width: 24, height: 24, borderRadius: '50%', border: `1.5px solid ${pago ? 'var(--accent)' : 'var(--border2)'}`, background: pago ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {pago && <Check size={14} color="var(--on-accent)" />}
                    </button>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500 }}>{emojiDe(conta.categoria)} {conta.nome}</p>
                      <p style={{ fontSize: 12, color: 'var(--text2)' }}>
                        Previsto {fmt(previsto)}{conta.dia_vencimento ? ` · vence dia ${conta.dia_vencimento}` : ''}
                      </p>
                    </div>
                  </div>
                  {diff != null && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: corDif(diff) }}>{sinal(diff)}{fmt(diff)}</span>
                  )}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11 }}>Valor real que veio</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder={`ex: ${previsto.toFixed(2)}`}
                    value={valores[conta.id] ?? ''}
                    onChange={e => setValores(v => ({ ...v, [conta.id]: e.target.value }))}
                    onBlur={() => onBlurReal(conta)}
                  />
                </div>
              </div>
            ))}

            {/* Relatório por categoria */}
            {catEntries.length > 0 && (
              <div className="card" style={{ marginTop: 16 }}>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>Previsto × realizado por categoria</p>
                {catEntries.map(([cat, o]) => {
                  const d = o.efetivo - o.previsto
                  return (
                    <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 13, textTransform: 'capitalize' }}>{emojiDe(cat)} {cat}</span>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 13, fontWeight: 500 }}>{fmt(o.efetivo)} <span style={{ color: 'var(--text3)', fontSize: 11 }}>de {fmt(o.previsto)}</span></p>
                        {d !== 0 && <p style={{ fontSize: 11, color: corDif(d) }}>{sinal(d)}{fmt(d)}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
    </div>
  )
}
