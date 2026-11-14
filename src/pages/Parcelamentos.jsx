import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Info, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { addMonths } from 'date-fns'
import { useCategorias } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import SwipeRow from '../components/SwipeRow'
import { fmt, fmtData, hojeISO, parseDataLocal } from '../lib/format'

const isoDe = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function CardParcelamento({ p, emojiDe, onToggleParcela, onExcluir, onEditar }) {
  const [aberto, setAberto] = useState(false)
  const progresso = Math.round((p.pagas / p.total) * 100)
  const parcelasOrdenadas = [...(p.parcelas || [])].sort((a, b) => a.numero - b.numero)

  return (
    <SwipeRow style={{ marginBottom: 10 }} onEdit={() => onEditar(p)} onDelete={() => onExcluir(p.id)}>
    <div className="card" style={{ margin: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>{emojiDe(p.categoria)}</span>
          <div>
            <p style={{ fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
              {p.descricao}
              {p.pessoa_id && <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg3)', color: 'var(--amber-text)', padding: '1px 7px', borderRadius: 10 }}>a receber{p.pessoas?.nome ? ` · ${p.pessoas.nome}` : ''}</span>}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>{p.cartoes?.nome || 'Sem cartão'}</p>
          </div>
        </div>
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
    </SwipeRow>
  )
}

const novaEdicao = () => ({ descricao: '', categoria: 'outros', cartao_id: '', valor_total: '', num_parcelas: '', data_primeira_parcela: hojeISO(), parcelas_pagas: '', de_terceiro: false, pessoa_nome: '' })

export default function Parcelamentos() {
  const { perfil } = useAuth()
  const { categorias, emojiDe } = useCategorias()
  const run = useDb()
  const { toast } = useToast()
  const [parcelamentos, setParcelamentos] = useState([])
  const [cartoes, setCartoes] = useState([])
  const [pessoas, setPessoas] = useState([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(novaEdicao())
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (perfil?.grupo_id) { carregar(); carregarCartoes(); carregarPessoas() } }, [perfil])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase
      .from('parcelamentos')
      .select('*, cartoes(nome), pessoas(nome), parcelas(id, numero, valor, data_vencimento, paga)')
      .eq('grupo_id', perfil.grupo_id)
      .order('criado_em', { ascending: false })
    setParcelamentos(data || [])
    setLoading(false)
  }
  async function carregarCartoes() {
    const { data } = await supabase.from('cartoes').select('id, nome').eq('grupo_id', perfil.grupo_id).eq('ativo', true).order('nome')
    setCartoes(data || [])
  }
  async function carregarPessoas() {
    const { data } = await supabase.from('pessoas').select('id, nome').eq('grupo_id', perfil.grupo_id).order('nome')
    setPessoas(data || [])
  }

  async function resolverPessoaId(nome) {
    const n = (nome || '').trim()
    if (!n) return null
    const existe = pessoas.find(p => p.nome.toLowerCase() === n.toLowerCase())
    if (existe) return existe.id
    const { data } = await run(supabase.from('pessoas').insert({ grupo_id: perfil.grupo_id, nome: n }).select('id').single(), { erro: 'Não foi possível salvar a pessoa' })
    if (data?.id) carregarPessoas()
    return data?.id || null
  }

  function abrirEdicao(p) {
    setEditando(p.id)
    setForm({
      descricao: p.descricao, categoria: p.categoria || 'outros', cartao_id: p.cartao_id || '',
      valor_total: String(p.valor_total), num_parcelas: String(p.num_parcelas),
      data_primeira_parcela: p.data_primeira_parcela, parcelas_pagas: String(p.parcelas_pagas || 0),
      de_terceiro: !!p.pessoa_id, pessoa_nome: p.pessoas?.nome || '',
    })
  }
  function fecharEdicao() { setEditando(null); setForm(novaEdicao()) }

  async function salvarEdicao() {
    if (!form.descricao.trim()) { toast('Informe a descrição.', 'erro'); return }
    const n = parseInt(form.num_parcelas)
    if (!n || n < 1) { toast('Informe o número de parcelas.', 'erro'); return }
    const valor = parseFloat(String(form.valor_total).replace(',', '.'))
    if (!(valor > 0)) { toast('Informe um valor total válido.', 'erro'); return }
    let pagas = parseInt(form.parcelas_pagas) || 0
    if (pagas < 0) pagas = 0
    if (pagas > n) pagas = n
    if (!form.data_primeira_parcela) { toast('Informe a data da 1ª parcela.', 'erro'); return }

    setSalvando(true)
    const pessoaId = form.de_terceiro ? await resolverPessoaId(form.pessoa_nome) : null
    const vParcela = parseFloat((valor / n).toFixed(2))
    const { error } = await run(
      supabase.from('parcelamentos').update({
        descricao: form.descricao.trim(), categoria: form.categoria, cartao_id: form.cartao_id || null,
        valor_total: valor, num_parcelas: n, valor_parcela: vParcela,
        data_primeira_parcela: form.data_primeira_parcela, parcelas_pagas: pagas, pessoa_id: pessoaId,
      }).eq('id', editando),
      { ok: 'Parcelamento atualizado' }
    )
    if (error) { setSalvando(false); return }

    // Regenera as parcelas (o trigger só roda no INSERT do parcelamento).
    await supabase.from('parcelas').delete().eq('parcelamento_id', editando)
    const base = parseDataLocal(form.data_primeira_parcela)
    const rows = Array.from({ length: n }, (_, k) => {
      const i = k + 1
      return { grupo_id: perfil.grupo_id, parcelamento_id: editando, numero: i, valor: vParcela, data_vencimento: isoDe(addMonths(base, i - 1)), paga: i <= pagas }
    })
    await supabase.from('parcelas').insert(rows)

    setSalvando(false)
    fecharEdicao(); carregar()
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
  const nEdit = parseInt(form.num_parcelas)

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 6 }}>Compras parceladas</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        Acompanhe suas compras em parcelas e marque o que já foi pago.
      </p>

      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg3)' }}>
        <Info size={16} color="var(--text2)" style={{ flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: 'var(--text2)' }}>
          Para registrar uma compra parcelada, use <strong>Gastos → Novo gasto → Parcelado</strong>. Arraste um card pra esquerda pra editar ou excluir.
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
              {ativos.map(p => <CardParcelamento key={p.id} p={p} emojiDe={emojiDe} onToggleParcela={toggleParcela} onExcluir={excluir} onEditar={abrirEdicao} />)}
            </>
          )}

          {quitados.length > 0 && (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Syne', margin: '20px 0 10px' }}>Quitados</p>
              {quitados.map(p => <CardParcelamento key={p.id} p={p} emojiDe={emojiDe} onToggleParcela={toggleParcela} onExcluir={excluir} onEditar={abrirEdicao} />)}
            </>
          )}
        </>
      )}

      {/* Modal de edição — permite ajustar TUDO (recria as parcelas) */}
      {editando && (
        <div className="modal-overlay" onClick={fecharEdicao}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>Editar parcelamento</h2>
            <div className="form-group"><label>Descrição</label><input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Geladeira" /></div>
            <div className="form-row">
              <div className="form-group"><label>Valor total</label><input type="number" inputMode="decimal" value={form.valor_total} onChange={e => setForm(p => ({ ...p, valor_total: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>Nº de parcelas</label><input type="number" inputMode="decimal" min="1" value={form.num_parcelas} onChange={e => setForm(p => ({ ...p, num_parcelas: e.target.value }))} placeholder="Ex: 12" /></div>
            </div>
            {form.valor_total && nEdit >= 1 && (
              <p style={{ fontSize: 13, color: 'var(--accent2)', marginTop: -4, marginBottom: 12 }}>{nEdit}x de {fmt(parseFloat(String(form.valor_total).replace(',', '.')) / nEdit)}</p>
            )}
            <div className="form-row">
              <div className="form-group"><label>1ª parcela em</label><input type="date" value={form.data_primeira_parcela} onChange={e => setForm(p => ({ ...p, data_primeira_parcela: e.target.value }))} /></div>
              <div className="form-group"><label>Já paguei</label><input type="number" inputMode="decimal" min="0" max={nEdit || undefined} value={form.parcelas_pagas} onChange={e => setForm(p => ({ ...p, parcelas_pagas: e.target.value }))} placeholder="0" /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Categoria</label>
                <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                  {categorias.map(c => <option key={c.nome} value={c.nome}>{c.emoji} {c.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Cartão</label>
                <select value={form.cartao_id} onChange={e => setForm(p => ({ ...p, cartao_id: e.target.value }))}>
                  <option value="">Sem cartão</option>
                  {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>
                <input type="checkbox" checked={form.de_terceiro} onChange={e => setForm(p => ({ ...p, de_terceiro: e.target.checked }))} />
                É de outra pessoa (vão me pagar)
              </label>
              {form.de_terceiro && (
                <div className="form-group" style={{ marginTop: 10 }}>
                  <input list="pessoas-parc" value={form.pessoa_nome} onChange={e => setForm(p => ({ ...p, pessoa_nome: e.target.value }))} placeholder="Quem vai pagar (ex: Pai)" />
                  <datalist id="pessoas-parc">{pessoas.map(p => <option key={p.id} value={p.nome} />)}</datalist>
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>Cada parcela vira um “A receber” no mês em que vence.</span>
                </div>
              )}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text3)', margin: '0 0 16px', lineHeight: 1.4 }}>
              Ao salvar, as parcelas são recriadas com estes valores e datas. As primeiras <strong>{parseInt(form.parcelas_pagas) || 0}</strong> entram como já pagas.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={fecharEdicao}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1, opacity: salvando ? 0.6 : 1 }} onClick={salvarEdicao} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
