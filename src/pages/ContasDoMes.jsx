import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, getDaysInMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Check, CalendarCheck } from 'lucide-react'
import { useCategorias } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { fmt, hojeISO, parseDataLocal } from '../lib/format'

const clampDay = (y, m, d) => Math.min(d, getDaysInMonth(new Date(y, m, 1)))

// Ciclo da fatura de um cartão que VENCE no mês (ano, mesIdx 0-based).
function cicloFatura(card, ano, mesIdx) {
  const diaF = card.dia_fechamento || 1
  const diaV = card.dia_vencimento || 10
  const vencDia = clampDay(ano, mesIdx, diaV)
  const venc = new Date(ano, mesIdx, vencDia)
  const fIdx = diaV <= diaF ? mesIdx - 1 : mesIdx
  const fecha = new Date(ano, fIdx, clampDay(ano, fIdx, diaF))
  const abre = new Date(ano, fIdx - 1, clampDay(ano, fIdx - 1, diaF))
  return { abre, fecha, venc, vencDia }
}

export default function ContasDoMes() {
  const { perfil } = useAuth()
  const { emojiDe } = useCategorias()
  const run = useDb()
  const [mes, setMes] = useState(startOfMonth(new Date()))
  const [dados, setDados] = useState(null)
  const [valores, setValores] = useState({})   // conta_fixa_id -> input de valor real
  const [loading, setLoading] = useState(true)

  const competencia = format(mes, 'yyyy-MM')
  const ano = mes.getFullYear()
  const mesIdx = mes.getMonth()

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil, competencia])

  async function carregar() {
    setLoading(true)
    const gid = perfil.grupo_id
    const ini = format(startOfMonth(mes), 'yyyy-MM-dd')
    const fim = format(endOfMonth(mes), 'yyyy-MM-dd')

    const [cf, lanc, cartoes, gastos, parcelas, assinaturas, pagas] = await Promise.all([
      supabase.from('contas_fixas').select('id, nome, valor, categoria, dia_vencimento').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('fixas_lancamentos').select('*').eq('grupo_id', gid).eq('competencia', competencia),
      supabase.from('cartoes').select('id, nome, bandeira, dia_fechamento, dia_vencimento').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('gastos').select('valor, data, cartao_id').eq('grupo_id', gid).not('cartao_id', 'is', null),
      supabase.from('parcelas').select('valor, data_vencimento, numero, paga, id, parcelamentos!inner(descricao, categoria, num_parcelas, cartao_id)').eq('grupo_id', gid).gte('data_vencimento', ini).lte('data_vencimento', fim),
      supabase.from('assinaturas').select('id, nome, valor, dia_cobranca, cartao_id').eq('grupo_id', gid).eq('ativo', true),
      supabase.from('contas_pagas').select('*').eq('grupo_id', gid).eq('competencia', competencia),
    ])

    const lancMap = {}
    ;(lanc.data || []).forEach(l => { lancMap[l.conta_fixa_id] = l })
    const pagasMap = {}
    ;(pagas.data || []).forEach(p => { pagasMap[`${p.tipo}|${p.referencia_id}`] = p })

    const vals = {}
    ;(cf.data || []).forEach(c => { vals[c.id] = lancMap[c.id]?.valor_real != null ? String(lancMap[c.id].valor_real) : '' })
    setValores(vals)

    setDados({
      contas: cf.data || [], lancMap,
      cartoes: cartoes.data || [], gastos: gastos.data || [],
      parcelas: parcelas.data || [], assinaturas: assinaturas.data || [], pagasMap,
    })
    setLoading(false)
  }

  // ---- toggles de "pago" por tipo ----
  async function toggleFixa(conta) {
    const atual = dados.lancMap[conta.id] || {}
    const jaPago = atual.pago ?? false
    const payload = {
      grupo_id: perfil.grupo_id, conta_fixa_id: conta.id, competencia,
      valor_previsto: conta.valor, valor_real: atual.valor_real ?? null,
      pago: !jaPago, data_pagamento: !jaPago ? hojeISO() : null,
      atualizado_em: new Date().toISOString(),
    }
    const { data, error } = await run(
      supabase.from('fixas_lancamentos').upsert(payload, { onConflict: 'conta_fixa_id,competencia' }).select().single(),
      { ok: !jaPago ? 'Marcada como paga' : 'Pagamento desfeito' }
    )
    if (!error && data) setDados(d => ({ ...d, lancMap: { ...d.lancMap, [conta.id]: data } }))
  }

  async function salvarRealFixa(conta) {
    const raw = valores[conta.id]
    const novo = raw === '' ? null : parseFloat(raw)
    const antigo = dados.lancMap[conta.id]?.valor_real ?? null
    if (novo === antigo || (raw !== '' && Number.isNaN(novo))) return
    const atual = dados.lancMap[conta.id] || {}
    const payload = {
      grupo_id: perfil.grupo_id, conta_fixa_id: conta.id, competencia,
      valor_previsto: conta.valor, valor_real: novo,
      pago: atual.pago ?? false, data_pagamento: atual.data_pagamento ?? null,
      atualizado_em: new Date().toISOString(),
    }
    const { data, error } = await run(
      supabase.from('fixas_lancamentos').upsert(payload, { onConflict: 'conta_fixa_id,competencia' }).select().single(),
      { ok: 'Valor lançado' }
    )
    if (!error && data) setDados(d => ({ ...d, lancMap: { ...d.lancMap, [conta.id]: data } }))
  }

  async function toggleParcela(p) {
    const { error } = await run(
      supabase.from('parcelas').update({ paga: !p.paga }).eq('id', p.id),
      { ok: !p.paga ? 'Parcela paga' : 'Pagamento desfeito' }
    )
    if (!error) setDados(d => ({ ...d, parcelas: d.parcelas.map(x => x.id === p.id ? { ...x, paga: !p.paga } : x) }))
  }

  async function togglePaga(tipo, refId, valor) {
    const chave = `${tipo}|${refId}`
    const atual = dados.pagasMap[chave]
    const jaPago = atual?.pago ?? false
    const payload = {
      grupo_id: perfil.grupo_id, tipo, referencia_id: refId, competencia,
      valor, pago: !jaPago, data_pagamento: !jaPago ? hojeISO() : null,
    }
    const { data, error } = await run(
      supabase.from('contas_pagas').upsert(payload, { onConflict: 'tipo,referencia_id,competencia' }).select().single(),
      { ok: !jaPago ? 'Marcada como paga' : 'Pagamento desfeito' }
    )
    if (!error && data) setDados(d => ({ ...d, pagasMap: { ...d.pagasMap, [chave]: data } }))
  }

  // ---- monta as linhas (contas a pagar) ----
  function montarLinhas() {
    if (!dados) return []
    const linhas = []
    const inCycle = (d, abre, fecha) => d > abre && d <= fecha

    // 1) Contas fixas
    dados.contas.forEach(c => {
      const l = dados.lancMap[c.id]
      const valor = l?.valor_real != null ? Number(l.valor_real) : Number(c.valor)
      linhas.push({
        key: 'fixa-' + c.id, tipo: 'fixa', nome: c.nome, emoji: emojiDe(c.categoria),
        vencDia: c.dia_vencimento || 99, valor, pago: l?.pago ?? false,
        sub: 'Conta fixa', onToggle: () => toggleFixa(c), fixaConta: c,
        previsto: Number(c.valor), real: l?.valor_real != null ? Number(l.valor_real) : null,
      })
    })

    // 2) Faturas de cartão (gastos do ciclo + parcelas do mês no cartão + assinaturas vinculadas)
    dados.cartoes.forEach(card => {
      const { abre, fecha, vencDia } = cicloFatura(card, ano, mesIdx)
      const gCiclo = dados.gastos.filter(g => g.cartao_id === card.id && inCycle(parseDataLocal(g.data), abre, fecha)).reduce((s, g) => s + Number(g.valor), 0)
      const pCartao = dados.parcelas.filter(p => p.parcelamentos?.cartao_id === card.id).reduce((s, p) => s + Number(p.valor), 0)
      const aCartao = dados.assinaturas.filter(a => a.cartao_id === card.id).reduce((s, a) => s + Number(a.valor), 0)
      const valor = gCiclo + pCartao + aCartao
      if (valor <= 0) return
      const pg = dados.pagasMap[`fatura|${card.id}`]
      linhas.push({
        key: 'fatura-' + card.id, tipo: 'fatura', nome: `Fatura ${card.nome}`, emoji: '💳',
        vencDia, valor, pago: pg?.pago ?? false,
        sub: 'Cartão de crédito', onToggle: () => togglePaga('fatura', card.id, valor),
      })
    })

    // 3) Parcelas SEM cartão (as com cartão já entram na fatura)
    dados.parcelas.filter(p => !p.parcelamentos?.cartao_id).forEach(p => {
      linhas.push({
        key: 'parc-' + p.id, tipo: 'parcela', nome: p.parcelamentos?.descricao || 'Parcela',
        emoji: emojiDe(p.parcelamentos?.categoria), vencDia: parseDataLocal(p.data_vencimento).getDate(),
        valor: Number(p.valor), pago: p.paga,
        sub: `Parcela ${p.numero}/${p.parcelamentos?.num_parcelas}`, onToggle: () => toggleParcela(p),
      })
    })

    // 4) Assinaturas SEM cartão
    dados.assinaturas.filter(a => !a.cartao_id).forEach(a => {
      const pg = dados.pagasMap[`assinatura|${a.id}`]
      linhas.push({
        key: 'assin-' + a.id, tipo: 'assinatura', nome: a.nome, emoji: '📺',
        vencDia: a.dia_cobranca || 99, valor: Number(a.valor), pago: pg?.pago ?? false,
        sub: 'Assinatura', onToggle: () => togglePaga('assinatura', a.id, Number(a.valor)),
      })
    })

    return linhas.sort((a, b) => a.vencDia - b.vencDia)
  }

  const linhas = montarLinhas()
  const totalAPagar = linhas.reduce((s, l) => s + l.valor, 0)
  const pagas = linhas.filter(l => l.pago)
  const totalPago = pagas.reduce((s, l) => s + l.valor, 0)
  const falta = totalAPagar - totalPago
  const corDif = d => d > 0 ? 'var(--red)' : d < 0 ? 'var(--accent)' : 'var(--text2)'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <CalendarCheck size={20} color="var(--accent)" />
        <h2 style={{ fontSize: 20 }}>Contas do mês</h2>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        Tudo que vence no mês — contas fixas, faturas, parcelas e assinaturas. Marque o que já foi pago.
      </p>

      {/* Navegação de mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => setMes(m => subMonths(m, 1))}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h3 style={{ fontSize: 15, textTransform: 'capitalize' }}>{format(mes, "MMMM 'de' yyyy", { locale: ptBR })}</h3>
        <button onClick={() => setMes(m => addMonths(m, 1))}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      {loading ? <div className="empty-state">Carregando...</div>
        : linhas.length === 0 ? <div className="empty-state">Nada a pagar neste mês.</div>
        : (
          <>
            {/* Resumo */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text2)' }}>Total do mês</p>
                  <p style={{ fontSize: 18, fontFamily: 'Syne', fontWeight: 700 }}>{fmt(totalAPagar)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text2)' }}>Já pago {pagas.length}/{linhas.length}</p>
                  <p style={{ fontSize: 18, fontFamily: 'Syne', fontWeight: 700, color: 'var(--accent-text)' }}>{fmt(totalPago)}</p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Falta pagar</span>
                <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Syne', color: falta > 0 ? 'var(--red)' : 'var(--accent)' }}>{fmt(falta)}</span>
              </div>
            </div>

            {/* Lista */}
            {linhas.map(l => (
              <div key={l.key} className="card" style={{ marginBottom: 8, opacity: l.pago ? 0.72 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <button onClick={l.onToggle} title={l.pago ? 'Desmarcar' : 'Marcar como paga'}
                      style={{ width: 24, height: 24, borderRadius: '50%', border: `1.5px solid ${l.pago ? 'var(--accent)' : 'var(--border2)'}`, background: l.pago ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {l.pago && <Check size={14} color="var(--on-accent)" />}
                    </button>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, textDecoration: l.pago ? 'line-through' : 'none' }}>{l.emoji} {l.nome}</p>
                      <p style={{ fontSize: 11.5, color: 'var(--text2)' }}>
                        {l.sub}{l.vencDia < 99 ? ` · vence dia ${l.vencDia}` : ''}
                      </p>
                    </div>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Syne', flexShrink: 0 }}>{fmt(l.valor)}</span>
                </div>

                {/* Fixa: valor real + diferença */}
                {l.tipo === 'fixa' && (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                      <label style={{ fontSize: 11 }}>Valor real que veio</label>
                      <input type="number" inputMode="decimal" placeholder={`previsto ${l.previsto.toFixed(2)}`}
                        value={valores[l.fixaConta.id] ?? ''}
                        onChange={e => setValores(v => ({ ...v, [l.fixaConta.id]: e.target.value }))}
                        onBlur={() => salvarRealFixa(l.fixaConta)} />
                    </div>
                    {l.real != null && l.real !== l.previsto && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: corDif(l.real - l.previsto), paddingBottom: 10 }}>
                        {l.real - l.previsto > 0 ? '+' : ''}{fmt(l.real - l.previsto)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
    </div>
  )
}
