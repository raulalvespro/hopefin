import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Trash2, Info } from 'lucide-react'
import { useCategorias } from '../hooks/useCategorias'

const fmt = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Parcelamentos() {
  const { perfil } = useAuth()
  const { emojiDe } = useCategorias()
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

  async function excluir(id) {
    if (!confirm('Cancelar este parcelamento? As parcelas futuras serão removidas.')) return
    await supabase.from('parcelamentos').delete().eq('id', id)
    carregar()
  }

  const hoje = format(new Date(), 'yyyy-MM-dd')
  // Separa ativos (têm parcela a vencer) dos quitados
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

  function Card(p) {
    const progresso = Math.round((p.pagas / p.total) * 100)
    return (
      <div key={p.id} className="card" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{emojiDe(p.categoria)}</span>
            <div>
              <p style={{ fontWeight: 600, fontSize: 15 }}>{p.descricao}</p>
              <p style={{ fontSize: 12, color: 'var(--text2)' }}>{p.cartoes?.nome || 'Sem cartão'}</p>
            </div>
          </div>
          <button onClick={() => excluir(p.id)}><Trash2 size={15} color="var(--text3)" /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12, marginBottom: 12 }}>
          <div><span style={{ color: 'var(--text2)' }}>Parcela</span><br /><strong>{fmt(p.valor_parcela)}</strong></div>
          <div><span style={{ color: 'var(--text2)' }}>{p.quitado ? 'Total' : 'Falta pagar'}</span><br /><strong style={{ color: p.quitado ? 'var(--text)' : 'var(--amber)' }}>{fmt(p.quitado ? p.valor_total : p.restante)}</strong></div>
          <div><span style={{ color: 'var(--text2)' }}>Progresso</span><br /><strong>{p.pagas}/{p.total}x</strong></div>
        </div>

        <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
          <div style={{ width: `${progresso}%`, height: '100%', background: progresso === 100 ? 'var(--accent)' : 'var(--blue)', borderRadius: 4, transition: 'width 0.3s' }} />
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
          {p.quitado
            ? `Quitado · ${p.total}x de ${fmt(p.valor_parcela)}`
            : p.proxima
              ? `Próxima parcela ${p.proxima.numero}/${p.total} em ${format(new Date(p.proxima.data_vencimento + 'T12:00:00'), "dd 'de' MMM", { locale: ptBR })}`
              : `1ª parcela: ${format(new Date(p.data_primeira_parcela + 'T12:00:00'), 'MMM/yyyy', { locale: ptBR })}`}
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 6 }}>Compras parceladas</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        Acompanhamento das suas compras no cartão em parcelas.
      </p>

      {/* Dica: onde criar */}
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
              {ativos.map(Card)}
            </>
          )}

          {quitados.length > 0 && (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Syne', margin: '20px 0 10px' }}>Quitados</p>
              {quitados.map(Card)}
            </>
          )}
        </>
      )}
    </div>
  )
}
