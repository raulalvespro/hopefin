import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, subMonths, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, ChevronDown, Target } from 'lucide-react'
import SwipeRow from '../components/SwipeRow'
import { useCategorias } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { fmt, fmtData } from '../lib/format'
import { carregarMotor, meuGastoDoMes, pagoComResolvido, addMeses, hojeBRT } from '../lib/motor'

const ROT_TIPO = { gasto: 'compra', parcela: 'parcela', fixa: 'conta fixa', assinatura: 'assinatura' }
const ROT_PAGO = { auto: 'automático', cartao: 'no cartão', avista: 'à vista' }

export default function Orcamento() {
  const { perfil } = useAuth()
  const { categorias, emojiDe } = useCategorias()
  const run = useDb()
  const { toast } = useToast()
  const [mes, setMes] = useState(new Date())
  const [orcamentos, setOrcamentos] = useState([])
  const [porCat, setPorCat] = useState({})       // categoria -> { total, itens }
  const [gastosJanela, setGastosJanela] = useState([])
  const [aberta, setAberta] = useState(null)      // categoria com a lista aberta
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { categoria, valor, pago_com }

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil, mes])

  async function carregar() {
    setLoading(true)
    try {
      const comp = format(mes, 'yyyy-MM')
      const dados = await carregarMotor(perfil.grupo_id, { compIni: addMeses(comp, -1), compFim: comp })
      // Realizado = MEU gasto no mês (compra, conta fixa, parcela e assinatura — sem o que é de outra pessoa)
      setPorCat(meuGastoDoMes(comp, dados).porCategoria)
      setOrcamentos(dados.orcamentos || [])
      setGastosJanela(dados.gastos || [])
    } catch (e) {
      console.error('[orcamento]', e); toast('Não foi possível carregar o orçamento.', 'erro')
    }
    setLoading(false)
  }

  async function salvar() {
    if (!modal?.categoria || !modal.valor) return
    const { error } = await run(
      supabase.from('orcamentos').upsert(
        { grupo_id: perfil.grupo_id, categoria: modal.categoria, valor: parseFloat(modal.valor), pago_com: modal.pago_com || 'auto' },
        { onConflict: 'grupo_id,categoria' }
      ),
      { ok: 'Teto definido' }
    )
    if (error) return
    setModal(null); carregar()
  }

  async function excluir(categoria) {
    const { error } = await run(
      supabase.from('orcamentos').delete().eq('grupo_id', perfil.grupo_id).eq('categoria', categoria),
      { ok: 'Teto removido' }
    )
    if (!error) carregar()
  }

  const gastoDe = c => porCat[c]?.total || 0
  const mapOrc = Object.fromEntries(orcamentos.map(o => [o.categoria, o]))
  const totalOrcado = orcamentos.reduce((s, o) => s + Number(o.valor), 0)
  const totalGastoOrcado = orcamentos.reduce((s, o) => s + gastoDe(o.categoria), 0)
  // categorias a exibir: as orçadas + as que tiveram gasto
  const cats = Array.from(new Set([...orcamentos.map(o => o.categoria), ...Object.keys(porCat)]))
    .sort((a, b) => gastoDe(b) - gastoDe(a))
  const semOrcamento = categorias.map(c => c.nome).filter(c => !(c in mapOrc))
  const hoje = hojeBRT()

  function corBarra(pct) {
    if (pct >= 100) return 'var(--red)'
    if (pct >= 80) return 'var(--amber)'
    return 'var(--accent)'
  }

  if (loading) return <div className="empty-state">Carregando...</div>

  return (
    <div>
      {/* Navegação de mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={() => setMes(m => subMonths(m, 1))}><ChevronLeft size={20} color="var(--text2)" /></button>
        <h2 style={{ fontSize: 16, textTransform: 'capitalize' }}>{format(mes, 'MMMM yyyy', { locale: ptBR })}</h2>
        <button onClick={() => setMes(m => addMonths(m, 1))}><ChevronRight size={20} color="var(--text2)" /></button>
      </div>

      {/* Resumo do orçamento */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Target size={18} color="var(--accent)" />
          <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15 }}>Orçamento do mês</p>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
          O realizado de cada categoria soma compra, conta fixa, parcela e assinatura — só o que é seu (compra de outra pessoa não entra). Toque numa categoria pra ver o que está nela.
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>Gasto {fmt(totalGastoOrcado)} de {fmt(totalOrcado)}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: totalGastoOrcado > totalOrcado ? 'var(--red)' : 'var(--accent)' }}>
            {totalOrcado > 0 ? Math.round((totalGastoOrcado / totalOrcado) * 100) : 0}%
          </span>
        </div>
        <div style={{ background: 'var(--bg3)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, totalOrcado > 0 ? (totalGastoOrcado / totalOrcado) * 100 : 0)}%`, height: '100%', background: corBarra(totalOrcado > 0 ? (totalGastoOrcado / totalOrcado) * 100 : 0), borderRadius: 6, transition: 'width 0.4s' }} />
        </div>
        {totalOrcado > 0 && totalGastoOrcado <= totalOrcado && (
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>Sobra {fmt(totalOrcado - totalGastoOrcado)} no orçamento</p>
        )}
        {totalGastoOrcado > totalOrcado && totalOrcado > 0 && (
          <p style={{ fontSize: 12, color: 'var(--red-text)', marginTop: 8 }}>Estourou {fmt(totalGastoOrcado - totalOrcado)}</p>
        )}
      </div>

      {/* Por categoria */}
      {cats.length === 0 && <div className="empty-state">Defina um teto por categoria para começar</div>}
      {cats.map(cat => {
        const o = mapOrc[cat]
        const limite = o ? Number(o.valor) : null
        const gasto = gastoDe(cat)
        const pct = limite ? Math.round((gasto / limite) * 100) : null
        const itens = (porCat[cat]?.itens || []).slice().sort((a, b) => Number(b.valor) - Number(a.valor))
        const pagoCom = o ? pagoComResolvido(o, gastosJanela, hoje) : null
        const estaAberta = aberta === cat
        return (
          <SwipeRow key={cat} style={{ marginBottom: 10 }}
            onEdit={() => setModal({ categoria: cat, valor: limite ? String(limite) : '', pago_com: o?.pago_com || 'auto' })}
            onDelete={limite ? () => excluir(cat) : undefined}>
          <div className="card" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: limite ? 10 : 0 }}>
              <button onClick={() => setAberta(estaAberta ? null : cat)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'var(--text)', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 20 }}>{emojiDe(cat)}</span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {cat} <ChevronDown size={14} color="var(--text3)" style={{ transform: estaAberta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {fmt(gasto)}{limite ? ` de ${fmt(limite)}` : ' · sem teto'}
                    {o && <span style={{ color: 'var(--text3)' }}> · pago {ROT_PAGO[pagoCom]}{o.pago_com === 'auto' || !o.pago_com ? ' (auto)' : ''}</span>}
                  </p>
                </div>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {limite && <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Syne', color: corBarra(pct) }}>{pct}%</span>}
              </div>
            </div>
            {limite && (
              <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 7, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: corBarra(pct), borderRadius: 4, transition: 'width 0.4s' }} />
              </div>
            )}
            {/* O que está enchendo esse limite */}
            {estaAberta && (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                {itens.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text3)', padding: '6px 0' }}>Nada lançado nesta categoria no mês.</p>
                  : itens.map((it, i) => (
                    <div key={`${it.tipo}-${it.id}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.descricao}</p>
                        <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {[it.data ? fmtData(it.data, 'dd/MM') : null, ROT_TIPO[it.tipo], it.tipo === 'parcela' ? `${it.numero}/${it.total}` : null].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(it.valor)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
          </SwipeRow>
        )
      })}

      {/* Adicionar teto para categorias sem orçamento */}
      {semOrcamento.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>Definir teto para:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {semOrcamento.map(c => (
              <button key={c} onClick={() => setModal({ categoria: c, valor: '', pago_com: 'auto' })}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 20, border: '1px solid var(--border2)', background: 'var(--bg2)', fontSize: 13 }}>
                {emojiDe(c)} {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal definir teto */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 4, textTransform: 'capitalize' }}>{emojiDe(modal.categoria)} {modal.categoria}</h2>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Teto mensal para esta categoria</p>
            <div className="form-group">
              <label>Limite mensal (R$)</label>
              <input type="number" inputMode="decimal" autoFocus value={modal.valor} onChange={e => setModal(m => ({ ...m, valor: e.target.value }))} placeholder="0,00" />
            </div>
            <div className="form-group">
              <label>Costuma pagar como?</label>
              <select value={modal.pago_com || 'auto'} onChange={e => setModal(m => ({ ...m, pago_com: e.target.value }))}>
                <option value="auto">Automático (o app vê pelo que você lança)</option>
                <option value="avista">À vista (pix, débito, dinheiro)</option>
                <option value="cartao">No cartão de crédito</option>
              </select>
              <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>
                À vista: o que falta do teto já fica separado no "Quanto posso gastar". No cartão: vai pra fatura do mês seguinte, e o Início mostra até onde ela deve chegar.
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={salvar}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
