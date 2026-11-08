import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, getDaysInMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Check, CalendarCheck, CreditCard, Repeat } from 'lucide-react'
import { useCategorias } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { fmt, hojeISO, parseDataLocal } from '../lib/format'
import { Tag, Meter, IconeCategoria, EmptyState } from '../components/ui'
import Joca from '../components/Joca'
import { copy } from '../copy/pt-BR'

const t = copy.contasMes

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

// Dias entre hoje e o vencimento (negativo = já venceu). Só o calendário, sem hora.
function diasAte(ano, mesIdx, vencDia) {
  const hoje = new Date()
  const h0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const v0 = new Date(ano, mesIdx, clampDay(ano, mesIdx, vencDia))
  return Math.round((v0 - h0) / 86400000)
}

const ddmm = d => format(d, 'dd/MM')

export default function ContasDoMes() {
  const { perfil } = useAuth()
  const { toast } = useToast()
  const { emojiDe } = useCategorias()
  const run = useDb()
  const [mes, setMes] = useState(startOfMonth(new Date()))
  const [dados, setDados] = useState(null)
  const [valores, setValores] = useState({})   // conta_fixa_id -> input de valor real
  const [loading, setLoading] = useState(true)

  const competencia = format(mes, 'yyyy-MM')
  const ano = mes.getFullYear()
  const mesIdx = mes.getMonth()

  // Estado "fresco" para o Desfazer do toast (o closure do toast fica velho).
  const dadosRef = useRef(null)
  const competenciaRef = useRef(competencia)
  dadosRef.current = dados
  competenciaRef.current = competencia

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

  // Aviso após marcar/desmarcar. Ao marcar como paga, o toast traz "Desfazer"
  // (chama o toggle com o alvo explícito `false`, então não depende do estado antigo).
  function avisar(pagou, msgPaga, desfazer) {
    if (!pagou) return toast(t.okDesfeito, 'ok')
    const compOrigem = competenciaRef.current
    toast(msgPaga, 'ok', {
      acao: {
        label: t.desfazer,
        onClick: () => {
          if (competenciaRef.current !== compOrigem) return toast(t.desfazerOutroMes, 'info')
          desfazer()
        },
      },
    })
  }

  // ---- toggles de "pago" por tipo ----
  // `alvo` (opcional) força o estado final; sem ele, inverte o atual.
  async function toggleFixa(conta, alvo) {
    const atual = dadosRef.current.lancMap[conta.id] || {}
    const pagar = alvo ?? !(atual.pago ?? false)
    const payload = {
      grupo_id: perfil.grupo_id, conta_fixa_id: conta.id, competencia,
      valor_previsto: conta.valor, valor_real: atual.valor_real ?? null,
      pago: pagar, data_pagamento: pagar ? hojeISO() : null,
      atualizado_em: new Date().toISOString(),
    }
    const { data, error } = await run(
      supabase.from('fixas_lancamentos').upsert(payload, { onConflict: 'conta_fixa_id,competencia' }).select().single(),
    )
    if (!error && data) {
      setDados(d => ({ ...d, lancMap: { ...d.lancMap, [conta.id]: data } }))
      avisar(pagar, t.okPaga, () => toggleFixa(conta, false))
    }
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
      { ok: t.okValor }
    )
    if (!error && data) setDados(d => ({ ...d, lancMap: { ...d.lancMap, [conta.id]: data } }))
  }

  async function toggleParcela(p, alvo) {
    const atual = dadosRef.current.parcelas.find(x => x.id === p.id)
    const pagar = alvo ?? !(atual?.paga ?? p.paga)
    const { error } = await run(supabase.from('parcelas').update({ paga: pagar }).eq('id', p.id))
    if (!error) {
      setDados(d => ({ ...d, parcelas: d.parcelas.map(x => x.id === p.id ? { ...x, paga: pagar } : x) }))
      avisar(pagar, t.okParcelaPaga, () => toggleParcela(p, false))
    }
  }

  async function togglePaga(tipo, refId, valor, alvo) {
    const chave = `${tipo}|${refId}`
    const atual = dadosRef.current.pagasMap[chave]
    const pagar = alvo ?? !(atual?.pago ?? false)
    const payload = {
      grupo_id: perfil.grupo_id, tipo, referencia_id: refId, competencia,
      valor, pago: pagar, data_pagamento: pagar ? hojeISO() : null,
    }
    const { data, error } = await run(
      supabase.from('contas_pagas').upsert(payload, { onConflict: 'tipo,referencia_id,competencia' }).select().single(),
    )
    if (!error && data) {
      setDados(d => ({ ...d, pagasMap: { ...d.pagasMap, [chave]: data } }))
      avisar(pagar, t.okPaga, () => togglePaga(tipo, refId, valor, false))
    }
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
        key: 'fixa-' + c.id, tipo: 'fixa', nome: c.nome,
        icone: <IconeCategoria slug={c.categoria} emoji={emojiDe(c.categoria)} />,
        vencDia: c.dia_vencimento || 99, valor, pago: l?.pago ?? false, dataPago: l?.data_pagamento,
        sub: t.tipoFixa, onToggle: alvo => toggleFixa(c, alvo), fixaConta: c,
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
        key: 'fatura-' + card.id, tipo: 'fatura', nome: `Fatura ${card.nome}`,
        icone: <CreditCard size={22} strokeWidth={1.75} aria-hidden="true" />,
        vencDia, valor, pago: pg?.pago ?? false, dataPago: pg?.data_pagamento,
        sub: t.tipoFatura, onToggle: alvo => togglePaga('fatura', card.id, valor, alvo),
      })
    })

    // 3) Parcelas SEM cartão (as com cartão já entram na fatura)
    dados.parcelas.filter(p => !p.parcelamentos?.cartao_id).forEach(p => {
      linhas.push({
        key: 'parc-' + p.id, tipo: 'parcela', nome: p.parcelamentos?.descricao || 'Parcela',
        icone: <IconeCategoria slug={p.parcelamentos?.categoria} emoji={emojiDe(p.parcelamentos?.categoria)} />,
        vencDia: parseDataLocal(p.data_vencimento).getDate(),
        valor: Number(p.valor), pago: p.paga,
        sub: t.tipoParcela(p.numero, p.parcelamentos?.num_parcelas), onToggle: alvo => toggleParcela(p, alvo),
      })
    })

    // 4) Assinaturas SEM cartão
    dados.assinaturas.filter(a => !a.cartao_id).forEach(a => {
      const pg = dados.pagasMap[`assinatura|${a.id}`]
      linhas.push({
        key: 'assin-' + a.id, tipo: 'assinatura', nome: a.nome,
        icone: <Repeat size={22} strokeWidth={1.75} aria-hidden="true" />,
        vencDia: a.dia_cobranca || 99, valor: Number(a.valor), pago: pg?.pago ?? false, dataPago: pg?.data_pagamento,
        sub: t.tipoAssinatura, onToggle: alvo => togglePaga('assinatura', a.id, Number(a.valor), alvo),
      })
    })

    return linhas.sort((a, b) => a.vencDia - b.vencDia)
  }

  // Status visual de cada linha: tag + subtítulo + se o ícone fica vermelho.
  function statusDe(l) {
    const temVenc = l.vencDia < 99
    const dd = temVenc ? ddmm(new Date(ano, mesIdx, clampDay(ano, mesIdx, l.vencDia))) : null
    if (l.pago) {
      const sub = l.dataPago ? t.pagoEm(ddmm(parseDataLocal(l.dataPago))) : (temVenc ? t.venceEm(dd) : null)
      return { tag: <Tag cor="verde">{t.tagPago}</Tag>, sub, vencida: false }
    }
    if (!temVenc) return { tag: null, sub: null, vencida: false }
    const dias = diasAte(ano, mesIdx, l.vencDia)
    if (dias < 0) return { tag: <Tag cor="vermelho">{t.tagVencida}</Tag>, sub: t.venceuEm(dd), vencida: true }
    if (dias === 0) return { tag: <Tag cor="amber">{t.tagHoje}</Tag>, sub: t.venceEm(dd), vencida: false }
    if (dias <= 7) return { tag: <Tag cor="amber">{t.tagEmDias(dias)}</Tag>, sub: t.venceEm(dd), vencida: false }
    return { tag: null, sub: t.venceEm(dd), vencida: false }
  }

  const linhas = montarLinhas()
  const totalAPagar = linhas.reduce((s, l) => s + l.valor, 0)
  const pagas = linhas.filter(l => l.pago)
  const abertas = linhas.filter(l => !l.pago)
  const totalPago = pagas.reduce((s, l) => s + l.valor, 0)
  const falta = totalAPagar - totalPago
  const pct = totalAPagar > 0 ? (totalPago / totalAPagar) * 100 : 0
  const corDif = d => d > 0 ? 'var(--red)' : d < 0 ? 'var(--accent)' : 'var(--text2)'

  function renderLinha(l, ultima) {
    const st = statusDe(l)
    const subtxt = [l.sub, st.sub].filter(Boolean).join(' · ')
    return (
      <div key={l.key} style={{ padding: '12px 0', borderBottom: ultima ? 'none' : '1px solid var(--border)', opacity: l.pago ? 0.72 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => l.onToggle()} title={l.pago ? t.desmarcar : t.marcarPaga} aria-label={l.pago ? t.desmarcar : t.marcarPaga} aria-pressed={l.pago}
            style={{ width: 24, height: 24, borderRadius: '50%', border: `1.5px solid ${l.pago ? 'var(--accent)' : 'var(--border2)'}`, background: l.pago ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}>
            {l.pago && <Check size={14} color="var(--on-accent)" />}
          </button>
          <span style={{ width: 40, height: 40, borderRadius: 'var(--radius)', background: st.vencida ? 'var(--red-dim)' : 'var(--bg3)', color: st.vencida ? 'var(--red-text)' : 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {l.icone}
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 500, color: l.pago ? 'var(--text2)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</span>
            <span style={{ fontSize: 13, color: st.vencida ? 'var(--red-text)' : 'var(--text2)' }}>{subtxt}</span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            <span style={{ fontFamily: 'Syne', fontWeight: 700, color: l.pago ? 'var(--text2)' : 'var(--text)' }}>{fmt(l.valor)}</span>
            {st.tag}
          </span>
        </div>

        {/* Fixa: valor real + diferença */}
        {l.tipo === 'fixa' && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <label style={{ fontSize: 11 }}>{t.valorRealLabel}</label>
              <input type="number" inputMode="decimal" placeholder={t.valorRealPh(l.previsto.toFixed(2))}
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
    )
  }

  const cabecalho = { margin: '4px 0 8px', fontSize: 13, fontWeight: 500, color: 'var(--text2)' }
  const lista = { padding: '4px 16px', marginBottom: 16 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <CalendarCheck size={20} color="var(--accent)" />
        <h2 style={{ fontSize: 20 }}>{t.titulo}</h2>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>{t.intro}</p>

      {/* Navegação de mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => setMes(m => subMonths(m, 1))} aria-label={t.mesAnterior}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h3 style={{ fontSize: 15, textTransform: 'capitalize' }}>{format(mes, "MMMM 'de' yyyy", { locale: ptBR })}</h3>
        <button onClick={() => setMes(m => addMonths(m, 1))} aria-label={t.proximoMes}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      {loading ? <div className="empty-state">{t.carregando}</div>
        : linhas.length === 0 ? <EmptyState ilustracao={<Joca pose="base" tamanho={150} />} titulo={copy.mascote.vazios.contasTitulo} texto={copy.mascote.vazios.contasTexto} />
        : (
          <>
            {/* Resumo com medidor */}
            <section className="card" aria-label={t.pagoAteAgora} style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t.pagoAteAgora}</span>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t.contasDe(pagas.length, linhas.length)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 26, color: 'var(--accent-text)' }}>{fmt(totalPago)}</span>
                <span style={{ fontSize: 14, color: 'var(--text2)' }}>{t.deTotal(fmt(totalAPagar))}</span>
              </div>
              <Meter valor={pct} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t.faltaPagar}</span>
                <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Syne', color: falta > 0 ? 'var(--red)' : 'var(--accent)' }}>{fmt(falta)}</span>
              </div>
            </section>

            {abertas.length === 0 && (
              <EmptyState ilustracao={<Joca pose="comemorando" tamanho={140} />} titulo={copy.mascote.tudoPago.titulo} texto={copy.mascote.tudoPago.texto} style={{ padding: 24 }} />
            )}

            {abertas.length > 0 && (
              <>
                <h3 style={cabecalho}>{t.aPagar}</h3>
                <section className="card" style={lista}>
                  {abertas.map((l, i) => renderLinha(l, i === abertas.length - 1))}
                </section>
              </>
            )}

            {pagas.length > 0 && (
              <>
                <h3 style={cabecalho}>{t.pagas}</h3>
                <section className="card" style={lista}>
                  {pagas.map((l, i) => renderLinha(l, i === pagas.length - 1))}
                </section>
              </>
            )}
          </>
        )}
    </div>
  )
}
