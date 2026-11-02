import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Trash2, Info, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { useCategorias } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { fmt, fmtData, hojeISO } from '../lib/format'

function CardParcelamento({ p, emojiDe, onToggleParcela, onExcluir }) {
  const [aberto, setAberto] = useState(false)
  const progresso = Math.round((p.pagas / p.total) * 100)
  const parcelasOrdenadas = [...(p.parcelas || [])].sort((a, b) => a.numero - b.numero)

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>{emojiDe(p.categoria)}</span>
          <div>
            <p style={{ fontWeight: 600, fontSize: 15 }}>{p.descricao}</p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>{p.cartoes?.nome || 'Sem cartão'}</p>
          </div>
        </div>
        <button onClick={() => onExcluir(p.id)}><Trash2 size={15} color="var(--text3)" /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12, marginBottom: 12 }}>
        <div><span style={{ color: 'var(--text2)' }}>Parcela</span><br /><strong>{fmt(p.valor_parcela)}</strong></div>
        <div><span style={{ color: 'var(--text2)' }}>{p.quitado ? 'Total' : 'Falta pagar'}</span><br /><strong style={{ color: p.quitado ? 'var(--text)' : 'var(--amber)' }}>{fmt(p.quitado ? p.valor_total : p.restante)}</strong></div>
        <div><span style={{ color: 'var(--text2)' }}>Progresso</span><br /><strong>{p.pagas}/{p.total}x</strong></div>
      </div>

      <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${progresso}%`, height: '100%', background: progresso === 100 ? 'var(--accent)' : 'var(--blue)', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>

      <button onClick={() => setAberto(a => !a)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
          {p.quitado
            ? `Quitado · ${p.total}x de ${fmt(p.valor_parcela)}`
            : p.proxima
              ? `Próxima ${p.proxima.numero}/${p.total} em ${fmtData(p.proxima.data_vencimento, "dd 'de' MMM")}`
              : `1ª parcela: ${fmtData(p.data_primeira_parcela, 'MMM/yyyy')}`}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--accent2)' }}>
          {aberto ? 'ocultar' : 'parcelas'} {aberto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {/* Lista de parcelas com marcar pago */}
      {aberto && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {parcelasOrdenadas.map(parc => (
            <div key={parc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => onToggleParcela(parc)} title={parc.paga ? 'Marcar como não paga' : 'Marcar como paga'}
                  style={{ width: 22, height: 22, borderRadius: '50%', border: `1.5px solid ${parc.paga ? 'var(--accent)' : 'var(--border2)'}`, background: parc.paga ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {parc.paga && <Check size={13} color="var(--on-accent)" />}
                </button>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, textDecoration: parc.paga ? 'line-through' : 'none', color: parc.paga ? 'var(--text3)' : 'var(--text)' }}>
                    Parcela {parc.numero}/{p.total}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text3)' }}>vence {fmtData(parc.data_vencimento, 'dd/MM/yyyy')}</p>
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: parc.paga ? 'var(--text3)' : 'var(--text)' }}>{fmt(parc.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Parcelamentos() {
  const { perfil } = useAuth()
  const { emojiDe } = useCategorias()
  const run = useDb()
  const [parcelamentos, setParcelamentos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase
      .from('parcelamentos')
      .select('*, cartoes(nome), parcelas(id, numero, valor, data_vencimento, paga)')
      .eq('grupo_id', perfil.grupo_id)
      .order('criado_em', { ascending: false })
    setParcelamentos(data || [])
    setLoading(false)
  }

  async function toggleParcela(parc) {
    const { error } = await run(
      supabase.from('parcelas').update({ paga: !parc.paga }).eq('id', parc.id),
      { ok: parc.paga ? 'Parcela reaberta' : 'Parcela marcada como paga' }
    )
    if (!error) carregar()
  }

  async function excluir(id) {
    if (!confirm('Cancelar este parcelamento? As parcelas serão removidas.')) return
    const { error } = await run(supabase.from('parcelamentos').delete().eq('id', id), { ok: 'Parcelamento cancelado' })
    if (!error) carregar()
  }

  const hoje = hojeISO()
  const comInfo = parcelamentos.map(p => {
    const parcelas = p.parcelas || []
    const pagas = parcelas.filter(x => x.paga).length
    const total = parcelas.length || p.num_parcelas
    const restante = parcelas.filter(x => !x.paga).reduce((s, x) => s + Number(x.valor), 0)
    const futuras = parcelas.filter(x => !x.paga && x.data_vencimento >= hoje).sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    const proxima = futuras[0]
    const quitado = pagas >= total
    return { ...p, pagas, total, restante, proxima, quitado }
  })
  const ativos = comInfo.filter(p => !p.quitado)
  const quitados = comInfo.filter(p => p.quitado)
  const totalRestante = ativos.reduce((s, p) => s + p.restante, 0)

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 6 }}>Compras parceladas</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        Acompanhe suas compras em parcelas e marque o que já foi pago.
      </p>

      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg3)' }}>
        <Info size={16} color="var(--text2)" style={{ flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: 'var(--text2)' }}>
          Para registrar uma compra parcelada, use <strong>Gastos → Novo gasto → Parcelado</strong>.
        </p>
      </div>

      {loading ? <div className="empty-state">Carregando...</div> : parcelamentos.length === 0 ? (
        <div className="empty-state">Nenhuma compra parcelada</div>
      ) : (
        <>
          {ativos.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Syne' }}>Em andamento</span>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>falta pagar {fmt(totalRestante)}</span>
              </div>
              {ativos.map(p => <CardParcelamento key={p.id} p={p} emojiDe={emojiDe} onToggleParcela={toggleParcela} onExcluir={excluir} />)}
            </>
          )}

          {quitados.length > 0 && (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Syne', margin: '20px 0 10px' }}>Quitados</p>
              {quitados.map(p => <CardParcelamento key={p.id} p={p} emojiDe={emojiDe} onToggleParcela={toggleParcela} onExcluir={excluir} />)}
            </>
          )}
        </>
      )}
    </div>
  )
}
