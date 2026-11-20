import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAtualizarSozinho } from '../hooks/useAtualizarSozinho'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown, ChevronUp, FileText, Layers, CreditCard, Repeat } from 'lucide-react'
import { parseDataLocal } from '../lib/format'
import { carregarMotor, resumoMes, addMeses, compsEntre, compDe, hojeBRT } from '../lib/motor'

const fmt = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const bandeiras = { Visa: '💙', Mastercard: '🔴', Elo: '🟡', Amex: '🟢', Hipercard: '🔵' }

export default function Projecao() {
  const { perfil } = useAuth()
  const [meses, setMeses] = useState([])
  const [abertos, setAbertos] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])
  useAtualizarSozinho(perfil?.grupo_id ? carregar : null) // aba abre na hora e se atualiza sozinha

  // Próximos 6 meses pelo MOTOR ÚNICO: entradas já lançadas (recorrentes entram mês a mês,
  // pendentes), faturas que vencem em cada mês, contas fixas, parcelas e assinaturas sem cartão.
  async function carregar(opcoes) {
    if (!opcoes?.silencioso) setLoading(true) // atualizando sozinha: sem "Carregando"
    try {
      const hoje = hojeBRT()
      const compIni = compDe(hoje)
      const compFim = addMeses(compIni, 5)
      const dados = await carregarMotor(perfil.grupo_id, { compIni, compFim, parcelasAte: compFim })
      const porId = Object.fromEntries(dados.cartoes.map(c => [c.id, c]))

      const resultado = compsEntre(compIni, compFim).map((comp, i) => {
        const r = resumoMes(comp, dados, { hoje })
        const fixas = r.fixas.map(f => ({ id: f.id, nome: f.descricao, dia_vencimento: f.data ? Number(f.data.slice(8, 10)) : '—', efetivo: f.valor, temReal: f.temReal }))
        const parcelasFora = r.parcelasAvulsas.map(p => ({ id: p.id, descricao: `${p.descricao} ${p.numero}/${p.total}`, valor: p.valor }))
        const faturas = r.faturas.map(f => ({
          cartao: porId[f.cartaoId] || { id: f.cartaoId, nome: f.cartaoNome },
          total: f.total, venc: parseDataLocal(f.vencimento),
          compras: f.itens.filter(x => x.tipo !== 'parcela').reduce((s, x) => s + x.valor, 0),
          parcelas: f.itens.filter(x => x.tipo === 'parcela').map(x => ({ id: x.id, descricao: `${x.descricao} ${x.numero}/${x.total}`, valor: x.valor })),
        }))
        const assinaturas = r.assinaturasAvulsas.map(a => ({ id: a.id, descricao: a.descricao, valor: a.valor }))
        const outras = [...r.aVista, ...r.cofrinhos].reduce((s, x) => s + x.valor, 0)
        return {
          mes: parseDataLocal(`${comp}-01`),
          label: format(parseDataLocal(`${comp}-01`), "MMMM 'de' yyyy", { locale: ptBR }),
          entradas: r.entradasPrevistas,
          fixas, totalFixas: fixas.reduce((s, f) => s + f.efetivo, 0),
          parcelasFora, totalParcelasFora: parcelasFora.reduce((s, p) => s + p.valor, 0),
          faturas, totalCartoes: faturas.reduce((s, f) => s + f.total, 0),
          assinaturas, totalAssinaturas: assinaturas.reduce((s, a) => s + a.valor, 0),
          outras,
          totalSaidas: r.totalSaidas,
          saldo: r.sobraDoMes,
          isAtual: i === 0,
        }
      })
      setMeses(resultado)
    } catch (e) {
      console.error('[projecao]', e)
    }
    setLoading(false)
  }

  function toggleMes(i) {
    setAbertos(p => ({ ...p, [i]: !p[i] }))
  }

  if (loading) return <div className="empty-state">Carregando projeção...</div>

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 6 }}>Projeção</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Próximos 6 meses pelo que já está lançado: entradas (as recorrentes entram todo mês), faturas pelo vencimento, contas fixas, parcelas e assinaturas</p>

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

              {/* Assinaturas sem cartão */}
              {m.assinaturas.length > 0 && (
                <>
                  <div className="divider" style={{ margin: '10px 0' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Repeat size={13} color="var(--purple)" /> Assinaturas sem cartão
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple-text)' }}>{fmt(m.totalAssinaturas)}</span>
                  </div>
                  {m.assinaturas.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span>{a.descricao}</span>
                      <span style={{ color: 'var(--text2)' }}>{fmt(a.valor)}</span>
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
