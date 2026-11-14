import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Check, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { useDb } from '../hooks/useDb'
import { fmt, fmtData, hojeISO } from '../lib/format'

// "A receber" — gastos E parcelas marcados como de outra pessoa (ex.: o pai usou seu cartão).
// Entram na fatura do cartão, mas são neutros nos seus resumos; aqui você cobra e marca o que
// já foi acertado. Parcelado: cada parcela aparece no mês em que vence. A pessoa não entra no grupo.
export default function AReceber() {
  const { perfil } = useAuth()
  const run = useDb()
  const [itens, setItens] = useState([])
  const [loading, setLoading] = useState(true)
  const [verRecebidos, setVerRecebidos] = useState(false)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    setLoading(true)
    const gid = perfil.grupo_id
    const [{ data: gs }, { data: ps }] = await Promise.all([
      supabase.from('gastos')
        .select('id, descricao, valor, data, reembolso_status, reembolso_quitado_em, pessoas(nome), cartoes(nome)')
        .eq('grupo_id', gid).not('pessoa_id', 'is', null).order('data', { ascending: false }),
      supabase.from('parcelas')
        .select('id, numero, valor, data_vencimento, recebido, parcelamentos!inner(descricao, num_parcelas, pessoa_id, pessoas(nome), cartoes(nome))')
        .eq('grupo_id', gid).not('parcelamentos.pessoa_id', 'is', null).order('data_vencimento', { ascending: false }),
    ])
    const deGastos = (gs || []).map(g => ({
      kind: 'gasto', id: g.id, descricao: g.descricao, valor: Number(g.valor), data: g.data,
      recebido: g.reembolso_status === 'quitado', recebidoEm: g.reembolso_quitado_em,
      pessoa: g.pessoas?.nome || 'Alguém', cartao: g.cartoes?.nome || '',
    }))
    const deParcelas = (ps || []).map(p => ({
      kind: 'parcela', id: p.id,
      descricao: `${p.parcelamentos?.descricao || 'Parcelado'} · ${p.numero}/${p.parcelamentos?.num_parcelas}x`,
      valor: Number(p.valor), data: p.data_vencimento, recebido: !!p.recebido, recebidoEm: null,
      pessoa: p.parcelamentos?.pessoas?.nome || 'Alguém', cartao: p.parcelamentos?.cartoes?.nome || '',
    }))
    setItens([...deGastos, ...deParcelas].sort((a, b) => (b.data || '').localeCompare(a.data || '')))
    setLoading(false)
  }

  async function alternar(it) {
    const recebendo = !it.recebido
    let q
    if (it.kind === 'gasto') {
      const patch = recebendo
        ? { reembolso_status: 'quitado', reembolso_quitado_em: hojeISO() }
        : { reembolso_status: 'pendente', reembolso_quitado_em: null }
      q = supabase.from('gastos').update(patch).eq('id', it.id)
    } else {
      q = supabase.from('parcelas').update({ recebido: recebendo }).eq('id', it.id)
    }
    const { error } = await run(q, { ok: recebendo ? 'Marcado como recebido' : 'Reaberto' })
    if (!error) carregar()
  }

  const pendentes = itens.filter(g => !g.recebido)
  const recebidos = itens.filter(g => g.recebido)

  const porPessoa = {}
  for (const g of pendentes) {
    if (!porPessoa[g.pessoa]) porPessoa[g.pessoa] = { nome: g.pessoa, total: 0, itens: [] }
    porPessoa[g.pessoa].total += g.valor
    porPessoa[g.pessoa].itens.push(g)
  }
  const grupos = Object.values(porPessoa).sort((a, b) => b.total - a.total)
  const totalReceber = pendentes.reduce((s, g) => s + g.valor, 0)

  const Linha = ({ g }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 500, textDecoration: g.recebido ? 'line-through' : 'none', color: g.recebido ? 'var(--text3)' : 'var(--text)' }}>{g.descricao}</p>
        <p style={{ fontSize: 11, color: 'var(--text3)' }}>
          {fmtData(g.data, 'dd/MM')}{g.cartao ? ` · ${g.cartao}` : ''}
          {g.recebido && g.recebidoEm ? ` · recebido ${fmtData(g.recebidoEm, 'dd/MM')}` : ''}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Syne', color: g.recebido ? 'var(--text3)' : 'var(--text)' }}>{fmt(g.valor)}</span>
        <button onClick={() => alternar(g)} title={g.recebido ? 'Reabrir' : 'Marcar como recebido'}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: g.recebido ? 'var(--text3)' : 'var(--accent-text)' }}>
          {g.recebido ? <><RotateCcw size={13} /> reabrir</> : <><Check size={14} /> recebi</>}
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 6 }}>A receber</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        Compras de outras pessoas que passaram pelo seu cartão. Entram na fatura, mas não contam como seu gasto — marque aqui quando acertar. Parcelado: cada parcela aparece no mês que vence.
      </p>

      {loading ? <div className="empty-state">Carregando...</div> : itens.length === 0 ? (
        <div className="empty-state">Nada a receber por aqui. Pra marcar algo como de outra pessoa, use <strong>Gastos → Novo gasto</strong> e ligue “Foi de outra pessoa”.</div>
      ) : (
        <>
          {pendentes.length > 0 && (
            <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg3)' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Total a receber</span>
              <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Syne', color: 'var(--amber-text)' }}>{fmt(totalReceber)}</span>
            </div>
          )}

          {grupos.map(gp => (
            <div key={gp.nome} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600, fontFamily: 'Syne' }}>{gp.nome}</span>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{fmt(gp.total)}</span>
              </div>
              {gp.itens.map(g => <Linha key={`${g.kind}-${g.id}`} g={g} />)}
            </div>
          ))}

          {recebidos.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <button onClick={() => setVerRecebidos(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, fontFamily: 'Syne', color: 'var(--text2)', marginBottom: 8 }}>
                Já recebidos ({recebidos.length}) {verRecebidos ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              {verRecebidos && (
                <div className="card">
                  {recebidos.map(g => <Linha key={`${g.kind}-${g.id}`} g={g} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
