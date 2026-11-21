import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Sparkles, Loader, Check, Trash2 } from 'lucide-react'
import { MicButton } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useCategorias, rotuloCategoria } from '../hooks/useCategorias'
import { useVoz, textoErroIa } from '../hooks/useVoz'
import { useAssinatura } from '../hooks/useAssinatura'
import { supabase } from '../lib/supabase'
import { hojeISO, fmt } from '../lib/format'
import { primeiroVencimentoParcelado } from '../lib/motor'
import { copy } from '../copy/pt-BR'

const t = copy.lancarVarios

// Lançar vários de uma vez (A4.4, 21/11/2026): cola uma lista ou fala um áudio longo ("mercado 300,
// farmácia 80 no pix…") → a IA separa (interpretar-lancamento com varios: true) → prévia editável →
// salva só os marcados. Nada é salvo sem a pessoa conferir. Cada item conta 1 no limite de IA.
function itemDaIa(d, categorias) {
  return {
    marcado: true,
    tipo: d.tipo === 'entrada' ? 'entrada' : 'gasto',
    descricao: d.descricao || '',
    valor: d.valor ?? '',
    categoria: categorias.some(c => c.nome === d.categoria) ? d.categoria : 'outros',
    pagamento: d.cartao_id ? `cartao:${d.cartao_id}` : d.forma === 'dinheiro' ? 'dinheiro' : 'pix',
    parcelas: d.parcelas > 1 ? d.parcelas : 1,
    data: /^\d{4}-\d{2}-\d{2}$/.test(d.data) ? d.data : hojeISO(),
    ia: d,
  }
}

export default function LancarVarios() {
  const { perfil } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { categorias } = useCategorias()
  const { podeLancar, loading: carregandoPlano } = useAssinatura()
  const [texto, setTexto] = useState('')
  const [itens, setItens] = useState(null)
  const [logId, setLogId] = useState(null)
  const [interpretando, setInterpretando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [cartoes, setCartoes] = useState([])

  useEffect(() => {
    if (!perfil?.grupo_id) return
    supabase.from('cartoes').select('id, nome, dia_fechamento, dia_vencimento, compra_no_fechamento').eq('grupo_id', perfil.grupo_id).eq('ativo', true)
      .then(({ data }) => setCartoes(data || []))
  }, [perfil?.grupo_id])

  // A voz vai somando ao texto (dá pra falar em partes).
  const { gravando, parcial, suportado, iniciar, parar } = useVoz((falado) => setTexto(v => (v ? `${v}\n${falado}` : falado)))

  async function separar() {
    const limpo = texto.trim()
    if (!limpo) return
    setErro(''); setInterpretando(true); setItens(null)
    try {
      const { data, error } = await supabase.functions.invoke('interpretar-lancamento', { body: { texto: limpo, origem: 'texto', varios: true } })
      let corpo = data
      if (error) { try { corpo = await error.context?.json?.() } catch { corpo = null } }
      if (!corpo?.ok) { setErro(corpo?.erro === 'nao_entendi' ? t.naoEntendi : textoErroIa(corpo?.erro, t.erro)); return }
      setItens(corpo.itens.map(d => itemDaIa(d, categorias)))
      setLogId(corpo.log_id || null)
    } catch {
      setErro(t.erro)
    } finally {
      setInterpretando(false)
    }
  }

  const mudar = (i, campo, valor) => setItens(l => l.map((it, k) => (k === i ? { ...it, [campo]: valor } : it)))
  const marcados = (itens || []).filter(it => it.marcado && parseFloat(it.valor) > 0)
  const total = marcados.reduce((s, it) => s + (it.tipo === 'gasto' ? parseFloat(it.valor) : 0), 0)

  async function salvarUm(it) {
    const valor = parseFloat(it.valor)
    const base = { grupo_id: perfil.grupo_id, usuario_id: perfil.id }
    if (it.tipo === 'entrada') {
      return supabase.from('entradas').insert({ ...base, descricao: it.descricao || t.semNome, valor, tipo: 'avulso', recorrente: false, data: it.data, recebido: it.data <= hojeISO() })
    }
    const [forma, cartaoId] = it.pagamento.split(':')
    const n = Number(it.parcelas) || 1
    if (forma === 'cartao' && n > 1) {
      const cartao = cartoes.find(c => c.id === cartaoId)
      const dataPrimeira = cartao ? primeiroVencimentoParcelado(cartao, it.data) : it.data
      return supabase.from('parcelamentos').insert({ ...base, descricao: it.descricao || t.semNome, valor_total: valor, num_parcelas: n,
        valor_parcela: parseFloat((valor / n).toFixed(2)), cartao_id: cartaoId, categoria: it.categoria, data_primeira_parcela: dataPrimeira })
    }
    return supabase.from('gastos').insert({ ...base, descricao: it.descricao || t.semNome, valor, categoria: it.categoria,
      tipo_pagamento: forma, cartao_id: forma === 'cartao' ? cartaoId : null, data: it.data, origem: 'texto' })
  }

  async function salvarTodos() {
    if (!marcados.length) return
    setSalvando(true)
    let ok = 0
    for (const it of marcados) {
      const { error } = await salvarUm(it)
      if (!error) ok++
    }
    setSalvando(false)
    if (logId) {
      supabase.from('interpretacoes_log').update({ json_final: { itens: marcados.map(({ ia, ...r }) => r) }, salvo: ok > 0 }).eq('id', logId).then(() => {}, () => {})
    }
    if (ok === marcados.length) {
      toast(t.salvos(ok), 'ok')
      navigate('/gastos')
    } else {
      toast(t.salvosParcial(ok, marcados.length), 'erro')
    }
  }

  const travado = !carregandoPlano && !podeLancar

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <Link to="/gastos" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, color: 'var(--text2)', marginBottom: 10, minHeight: 36 }}>
        <ChevronLeft size={18} /> {t.voltar}
      </Link>
      <h2 style={{ fontSize: 22, marginBottom: 6 }}>{t.titulo}</h2>
      <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.5 }}>{t.subtitulo}</p>

      {travado ? (
        <div className="card"><p style={{ fontSize: 14, lineHeight: 1.5 }}>{copy.voz.erroAssinatura}</p></div>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={6} maxLength={2000} placeholder={t.placeholder}
            style={{ width: '100%', resize: 'vertical', fontSize: 15, lineHeight: 1.5 }} />
          {gravando && parcial && <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>{parcial}…</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            {suportado && <MicButton ouvindo={gravando} onClick={gravando ? parar : iniciar} size={48} aria-label={t.falar} />}
            <button className="btn-primary" onClick={separar} disabled={!texto.trim() || interpretando}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48 }}>
              {interpretando ? <><Loader size={16} className="spin" /> {t.separando}</> : <><Sparkles size={16} /> {t.separar}</>}
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>{t.dica}</p>
          {erro && <p style={{ fontSize: 13, color: 'var(--red-text)', marginTop: 8 }}>{erro}</p>}
        </div>
      )}

      {itens && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 4px 10px' }}>{t.confira(itens.length)}</p>
          {itens.map((it, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, opacity: it.marcado ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <input type="checkbox" checked={it.marcado} onChange={e => mudar(i, 'marcado', e.target.checked)} aria-label={t.incluir} style={{ width: 20, height: 20 }} />
                <input value={it.descricao} onChange={e => mudar(i, 'descricao', e.target.value)} placeholder={t.descricao} style={{ flex: 1, minWidth: 0 }} />
                <button type="button" onClick={() => setItens(l => l.filter((_, k) => k !== i))} aria-label={t.remover} style={{ minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={16} color="var(--text2)" />
                </button>
              </div>
              <div className="form-row">
                <div className="form-group"><label>{t.valor}</label>
                  <input type="number" inputMode="decimal" step="0.01" value={it.valor} onChange={e => mudar(i, 'valor', e.target.value)} />
                </div>
                <div className="form-group"><label>{t.tipo}</label>
                  <select value={it.tipo} onChange={e => mudar(i, 'tipo', e.target.value)}>
                    <option value="gasto">{t.gasto}</option>
                    <option value="entrada">{t.entrada}</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>{t.data}</label>
                  <input type="date" value={it.data} onChange={e => mudar(i, 'data', e.target.value)} />
                </div>
                {it.tipo === 'gasto' && (
                  <div className="form-group"><label>{t.categoria}</label>
                    <select value={it.categoria} onChange={e => mudar(i, 'categoria', e.target.value)}>
                      {categorias.map(c => <option key={c.nome} value={c.nome}>{c.emoji} {rotuloCategoria(c.nome)}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {it.tipo === 'gasto' && (
                <div className="form-row">
                  <div className="form-group"><label>{t.pagamento}</label>
                    <select value={it.pagamento} onChange={e => mudar(i, 'pagamento', e.target.value)}>
                      <option value="pix">PIX</option>
                      <option value="dinheiro">{t.dinheiro}</option>
                      {cartoes.map(c => <option key={c.id} value={`cartao:${c.id}`}>{t.cartao(c.nome)}</option>)}
                    </select>
                  </div>
                  {it.pagamento.startsWith('cartao') && (
                    <div className="form-group"><label>{t.parcelas}</label>
                      <input type="number" inputMode="numeric" min="1" max="48" value={it.parcelas} onChange={e => mudar(i, 'parcelas', e.target.value)} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div style={{ position: 'sticky', bottom: 84, paddingTop: 8, paddingBottom: 8 }}>
            <button className="btn-primary" onClick={salvarTodos} disabled={!marcados.length || salvando}
              style={{ width: '100%', minHeight: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {salvando ? <><Loader size={16} className="spin" /> {t.salvando}</> : <><Check size={18} /> {t.salvar(marcados.length, fmt(total))}</>}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
