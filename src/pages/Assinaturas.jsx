import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Repeat } from 'lucide-react'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { useCategorias } from '../hooks/useCategorias'
import SwipeRow from '../components/SwipeRow'
import { useFlags } from '../hooks/useFlags'
import BuscaFiltros from '../components/BuscaFiltros'
import { filtrar, filtroVazio, temFiltro, distintos } from '../lib/busca'
import { fmt, fmtData, hojeISO } from '../lib/format'
import { copy } from '../copy/pt-BR'

const t = copy.assinaturasCasa
// "Cobrada desde": padrão = 1º dia do mês do cadastro (a assinatura entra nas faturas a partir daí).
const inicioDoMes = (iso) => `${String(iso || hojeISO()).slice(0, 7)}-01`
const novoForm = () => ({ nome: '', valor: '', dia_cobranca: '', cartao_id: '', categoria: 'outros', cobrada_desde: inicioDoMes() })

export default function Assinaturas() {
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const flags = useFlags()
  const buscaLigada = !!flags?.busca_filtros // busca e filtros (A3.1), no começo só o dono
  const [filtro, setFiltro] = useState(filtroVazio())
  const run = useDb()
  const { toast } = useToast()
  const { categorias, emojiDe } = useCategorias()
  const [itens, setItens] = useState([])
  const [cartoes, setCartoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(novoForm())
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    setLoading(true)
    const [{ data }, { data: cs }] = await Promise.all([
      supabase.from('assinaturas').select('*, cartoes(nome)').eq('grupo_id', perfil.grupo_id).eq('ativo', true).order('dia_cobranca'),
      supabase.from('cartoes').select('id, nome').eq('grupo_id', perfil.grupo_id).eq('ativo', true).order('nome'),
    ])
    setItens(data || [])
    setCartoes(cs || [])
    setLoading(false)
  }

  // A3.6: a assinatura nasce no Novo gasto (☑ É uma assinatura); a aba é o painel.
  // O "+ Nova" abre o Novo gasto já marcado e volta pra cá no fim.
  function abrirNovo() { navigate('/gastos?novo=assinatura&voltar=assinaturas') }
  function editar(a) {
    setEditando(a.id)
    setForm({
      nome: a.nome, valor: String(a.valor), dia_cobranca: String(a.dia_cobranca ?? ''), cartao_id: a.cartao_id || '', categoria: a.categoria || 'outros',
      cobrada_desde: a.cobrada_desde || inicioDoMes(a.criado_em),
    })
    setModal(true)
  }
  function fecharModal() { setModal(false); setEditando(null); setForm(novoForm()) }

  async function salvar() {
    if (!form.nome || !form.valor) { toast('Preencha nome e valor.', 'erro'); return }
    const payload = {
      nome: form.nome,
      valor: parseFloat(form.valor),
      dia_cobranca: form.dia_cobranca ? parseInt(form.dia_cobranca) : null,
      cartao_id: form.cartao_id || null,
      categoria: form.categoria || 'outros',
      cobrada_desde: form.cobrada_desde || null, // vazio = a partir do mês do cadastro
    }
    setSalvando(true)
    const op = editando
      ? run(supabase.from('assinaturas').update(payload).eq('id', editando), { ok: 'Assinatura atualizada' })
      : run(supabase.from('assinaturas').insert({ ...payload, grupo_id: perfil.grupo_id }), { ok: 'Assinatura criada' })
    const { error } = await op
    setSalvando(false)
    if (error) return
    fecharModal(); carregar()
  }

  // A8.3: tirar a assinatura pergunta se o serviço foi cancelado (mantém as cobranças antigas)
  // ou se foi lançada errado (some de tudo, como era antes).
  const [tirando, setTirando] = useState(null) // { id, nome, data }
  function excluir(id) {
    const a = itens.find(x => x.id === id)
    setTirando({ id, nome: a?.nome || '', data: hojeISO() })
  }
  async function confirmarTirar(cancelou) {
    if (!tirando) return
    if (cancelou && !tirando.data) { toast(copy.assinaturasCasa.canceladaEm, 'erro'); return }
    setSalvando(true)
    const payload = cancelou ? { ativo: false, cancelada_em: tirando.data } : { ativo: false, cancelada_em: null }
    const { error } = await run(supabase.from('assinaturas').update(payload).eq('id', tirando.id),
      { ok: cancelou ? copy.assinaturasCasa.okCancelada : copy.assinaturasCasa.okRemovida })
    setSalvando(false)
    if (error) return
    setTirando(null); carregar()
  }

  // Busca e filtros (A3.1) — só com a chave de recurso "busca_filtros".
  const tb = copy.busca
  const lerAss = a => ({
    texto: [a.nome, a.categoria, a.cartoes?.nome], categoria: a.categoria || 'outros',
    origem: a.cartoes?.nome || tb.semCartao, valor: Number(a.valor),
  })
  const filtrando = buscaLigada && temFiltro(filtro)
  const visiveis = filtrando ? filtrar(itens, filtro, lerAss) : itens
  const opcoesBusca = buscaLigada ? {
    categorias: distintos(itens.map(a => a.categoria || 'outros')).map(c => ({ valor: c, rotulo: `${emojiDe(c)} ${c}` })),
    origens: distintos(itens.map(a => a.cartoes?.nome || tb.semCartao)).map(o => ({ valor: o, rotulo: o })),
  } : null

  const total = itens.reduce((s, a) => s + Number(a.valor), 0)
  const porCategoria = Object.entries(
    itens.reduce((acc, a) => { const c = a.categoria || 'outros'; acc[c] = (acc[c] || 0) + Number(a.valor); return acc }, {})
  ).sort((a, b) => b[1] - a[1])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Repeat size={20} color="var(--accent)" />
          <h2 style={{ fontSize: 20 }}>Assinaturas</h2>
        </div>
        <button onClick={abrirNovo} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--on-accent)', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> Nova
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '-8px 0 16px', lineHeight: 1.45 }}>{copy.assinaturasCasa.comoCriar}</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>Total mensal em assinaturas</span>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: 'var(--purple-text)' }}>{fmt(total)}</span>
        </div>
        {porCategoria.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {porCategoria.map(([cat, val]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', textTransform: 'capitalize' }}>
                  <span style={{ fontSize: 16 }}>{emojiDe(cat)}</span> {cat}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{Math.round((val / total) * 100)}%</span>
                  <strong>{fmt(val)}</strong>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {buscaLigada && itens.length > 0 && (
        <BuscaFiltros filtro={filtro} onChange={setFiltro} opcoes={opcoesBusca} placeholder={tb.buscarAssinaturas}
          resumo={tb.resumoAssinaturas(visiveis.length, fmt(visiveis.reduce((s, a) => s + Number(a.valor), 0)))} />
      )}

      {loading ? <div className="empty-state">Carregando...</div>
        : itens.length === 0 ? <div className="empty-state">Nenhuma assinatura cadastrada</div>
        : filtrando && visiveis.length === 0 ? <div className="empty-state">{tb.nada}</div>
        : visiveis.map(a => (
          <SwipeRow key={a.id} style={{ marginBottom: 8 }} onEdit={() => editar(a)} onDelete={() => excluir(a.id)}>
          <div className="card" style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>{emojiDe(a.categoria)}</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{a.nome}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {a.dia_cobranca ? `Cobra dia ${a.dia_cobranca}` : 'Sem dia definido'}
                  {a.cartoes?.nome && ` · ${a.cartoes.nome}`}
                  {a.cobrada_desde && ` · ${t.desde(fmtData(a.cobrada_desde, 'MMM/yyyy'))}`}
                </p>
              </div>
            </div>
            <span style={{ color: 'var(--purple-text)', fontWeight: 700, fontFamily: 'Syne' }}>{fmt(a.valor)}</span>
          </div>
          </SwipeRow>
        ))}

      {tirando && (
        <div className="modal-overlay" onClick={() => setTirando(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 14 }}>{t.tirarTitulo(tirando.nome)}</h2>
            <div className="card" style={{ marginBottom: 12, background: 'var(--bg3)' }}>
              <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15, marginBottom: 4 }}>{t.cancelei}</p>
              <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45, marginBottom: 10 }}>{t.canceleiDica}</p>
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label>{t.canceladaEm}</label>
                <input type="date" value={tirando.data} max={hojeISO()} onChange={e => setTirando(x => ({ ...x, data: e.target.value }))} />
              </div>
              <button className="btn-primary" style={{ width: '100%', opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={() => confirmarTirar(true)}>{t.cancelei}</button>
            </div>
            <div className="card" style={{ marginBottom: 14 }}>
              <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15, marginBottom: 4 }}>{t.lanceiErrado}</p>
              <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45, marginBottom: 10 }}>{t.lanceiErradoDica}</p>
              <button className="btn-ghost" style={{ width: '100%', color: 'var(--red-text)', opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={() => confirmarTirar(false)}>{t.lanceiErrado}</button>
            </div>
            <button className="btn-ghost" style={{ width: '100%' }} onClick={() => setTirando(null)}>Voltar</button>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>{editando ? 'Editar assinatura' : 'Nova assinatura'}</h2>
            <div className="form-group"><label>Nome</label><input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Netflix, Spotify..." /></div>
            <div className="form-row">
              <div className="form-group"><label>Valor mensal</label><input type="number" inputMode="decimal" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>Dia da cobrança</label><input type="number" inputMode="numeric" pattern="[0-9]*" min="1" max="31" value={form.dia_cobranca} onChange={e => setForm(p => ({ ...p, dia_cobranca: e.target.value }))} placeholder="Opcional" /></div>
            </div>
            <div className="form-group">
              <label>{t.cobradaDesde}</label>
              <input type="date" value={form.cobrada_desde} onChange={e => setForm(p => ({ ...p, cobrada_desde: e.target.value }))} />
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.4 }}>{t.dicaCobradaDesde}</p>
            </div>
            <div className="form-group">
              <label>Categoria</label>
              <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                {categorias.map(c => <option key={c.nome} value={c.nome}>{c.emoji} {c.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Cobrada no cartão (opcional)</label>
              <select value={form.cartao_id} onChange={e => setForm(p => ({ ...p, cartao_id: e.target.value }))}>
                <option value="">Não vinculado a cartão</option>
                {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Se vincular, ela entra automaticamente na fatura do cartão — não precisa lançar como gasto.</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={fecharModal}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1, opacity: salvando ? 0.6 : 1 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
