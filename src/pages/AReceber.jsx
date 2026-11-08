import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Check, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { useDb } from '../hooks/useDb'
import { fmt, fmtData, hojeISO } from '../lib/format'

// "A receber" — gastos marcados como de outra pessoa (ex.: o pai usou seu cartão).
// Eles entram na fatura do cartão, mas são neutros nos seus resumos; aqui você cobra
// e marca o que já foi acertado. A pessoa não precisa entrar no grupo.
export default function AReceber() {
  const { perfil } = useAuth()
  const run = useDb()
  const [itens, setItens] = useState([])
  const [loading, setLoading] = useState(true)
  const [verRecebidos, setVerRecebidos] = useState(false)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase
      .from('gastos')
      .select('id, descricao, valor, data, reembolso_status, reembolso_quitado_em, pessoas(nome), cartoes(nome)')
      .eq('grupo_id', perfil.grupo_id)
      .not('pessoa_id', 'is', null)
      .order('data', { ascending: false })
    setItens(data || [])
    setLoading(false)
  }

  async function alternar(g) {
    const recebendo = g.reembolso_status !== 'quitado'
    const patch = recebendo
      ? { reembolso_status: 'quitado', reembolso_quitado_em: hojeISO() }
      : { reembolso_status: 'pendente', reembolso_quitado_em: null }
    const { error } = await run(
      supabase.from('gastos').update(patch).eq('id', g.id),
      { ok: recebendo ? 'Marcado como recebido' : 'Reaberto' }
    )
    if (!error) carregar()
  }

  const pendentes = itens.filter(g => g.reembolso_status !== 'quitado')
  const recebidos = itens.filter(g => g.reembolso_status === 'quitado')

  // Agrupa os pendentes por pessoa.
  const porPessoa = {}
  for (const g of pendentes) {
    const nome = g.pessoas?.nome || 'Alguém'
    if (!porPessoa[nome]) porPessoa[nome] = { nome, total: 0, itens: [] }
    porPessoa[nome].total += Number(g.valor)
    porPessoa[nome].itens.push(g)
  }
  const grupos = Object.values(porPessoa).sort((a, b) => b.total - a.total)
  const totalReceber = pendentes.reduce((s, g) => s + Number(g.valor), 0)

  const Linha = ({ g, quitado }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 500, textDecoration: quitado ? 'line-through' : 'none', color: quitado ? 'var(--text3)' : 'var(--text)' }}>{g.descricao}</p>
        <p style={{ fontSize: 11, color: 'var(--text3)' }}>
          {fmtData(g.data, 'dd/MM')}{g.cartoes?.nome ? ` · ${g.cartoes.nome}` : ''}
          {quitado && g.reembolso_quitado_em ? ` · recebido ${fmtData(g.reembolso_quitado_em, 'dd/MM')}` : ''}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Syne', color: quitado ? 'var(--text3)' : 'var(--text)' }}>{fmt(g.valor)}</span>
        <button onClick={() => alternar(g)} title={quitado ? 'Reabrir' : 'Marcar como recebido'}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: quitado ? 'var(--text3)' : 'var(--accent-text)' }}>
          {quitado ? <><RotateCcw size={13} /> reabrir</> : <><Check size={14} /> recebi</>}
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 6 }}>A receber</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        Compras de outras pessoas que passaram pelo seu cartão. Entram na fatura, mas não contam como seu gasto — marque aqui quando acertar.
      </p>

      {loading ? <div className="empty-state">Carregando...</div> : itens.length === 0 ? (
        <div className="empty-state">Nada a receber por aqui. Pra marcar um gasto como de outra pessoa, use <strong>Gastos → Novo gasto</strong> e ligue “Foi de outra pessoa”.</div>
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
              {gp.itens.map(g => <Linha key={g.id} g={g} quitado={false} />)}
            </div>
          ))}

          {recebidos.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <button onClick={() => setVerRecebidos(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, fontFamily: 'Syne', color: 'var(--text2)', marginBottom: 8 }}>
                Já recebidos ({recebidos.length}) {verRecebidos ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              {verRecebidos && (
                <div className="card">
                  {recebidos.map(g => <Linha key={g.id} g={g} quitado={true} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
