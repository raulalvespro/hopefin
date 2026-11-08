import { useState, useCallback, useEffect } from 'react'
import { X, Check, Loader, Sparkles, Send, AlertTriangle } from 'lucide-react'
import { MicButton, Tag } from './ui'
import { useVoz } from '../hooks/useVoz'
import { useAuth } from '../contexts/AuthContext'
import { useCategorias } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { supabase } from '../lib/supabase'
import { hojeISO, fmt, fmtData } from '../lib/format'
import { copy } from '../copy/pt-BR'

const t = copy.voz

// Alturas das barrinhas da onda e atrasos (só enfeite enquanto ouve).
const ONDA = [0, .1, .25, .05, .3, .15, .4, .2, .35, .1, .25, .05, .3]

// Lançamento rápido por voz OU texto, interpretado pela IA (Edge Function
// interpretar-lancamento → Claude Haiku). Nada é salvo sem o usuário confirmar
// no formulário já preenchido — ele pode corrigir qualquer campo antes.
export default function BotaoVoz({ onSalvo }) {
  const { perfil } = useAuth()
  const { categorias } = useCategorias()
  const run = useDb()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [digitado, setDigitado] = useState('')
  const [interpretando, setInterpretando] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState(null)   // dados editáveis já preenchidos
  const [jsonIa, setJsonIa] = useState(null) // o que a IA devolveu (p/ medir correção)
  const [logId, setLogId] = useState(null)
  const [avisoLimite, setAvisoLimite] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [corrigindo, setCorrigindo] = useState(false) // false = card "Entendi assim"; true = formulário completo
  const [cartoes, setCartoes] = useState([])
  const [origemLanc, setOrigemLanc] = useState('app') // 'voz' | 'texto' — como o lançamento começou

  // Carrega os cartões do grupo ao abrir (para o select).
  useEffect(() => {
    if (!aberto || !perfil?.grupo_id) return
    supabase.from('cartoes').select('id, nome').eq('grupo_id', perfil.grupo_id).eq('ativo', true)
      .then(({ data }) => setCartoes(data || []))
  }, [aberto, perfil])

  // Chama a IA com o texto (falado ou digitado).
  const interpretar = useCallback(async (txt, origem) => {
    const limpo = (txt || '').trim()
    if (!limpo) return
    setTexto(limpo); setErro(''); setForm(null); setInterpretando(true)
    setOrigemLanc(origem === 'voz' ? 'voz' : 'texto')
    try {
      const { data, error } = await supabase.functions.invoke('interpretar-lancamento', {
        body: { texto: limpo, origem },
      })
      if (error) {
        // A Edge Function devolve erro estruturado no corpo (inclui limite).
        let corpo = null
        try { corpo = await error.context?.json?.() } catch { /* ignore */ }
        if (corpo?.erro === 'limite_atingido') {
          setErro(t.erroLimite)
        } else {
          setErro(corpo?.erro || t.erroInterpretar)
        }
        return
      }
      if (!data?.ok) { setErro(data?.erro || t.erroNaoEntendi); return }

      const d = data.dados
      setJsonIa(d)
      setCorrigindo(!(Number(d.valor) > 0)) // sem valor entendido: já abre o formulário pra preencher
      setLogId(data.log_id || null)
      setForm({
        tipo: d.tipo === 'entrada' ? 'entrada' : 'gasto',
        descricao: d.descricao || limpo,
        valor: d.valor ?? '',
        categoria: categorias.some(c => c.nome === d.categoria) ? d.categoria : 'outros',
        cartao_id: d.cartao_id || '',
        tipo_pagamento: d.cartao_id ? 'cartao' : 'pix',
        parcelas: d.parcelas && d.parcelas > 1 ? d.parcelas : 1,
        data: /^\d{4}-\d{2}-\d{2}$/.test(d.data) ? d.data : hojeISO(),
        entrada_tipo: 'avulso',
      })

      // Aviso quando o uso mensal passa de 80% (já contando este lançamento).
      const lim = data.limite
      if (lim?.limite_mes) {
        const usados = (lim.usados_mes || 0) + 1
        const restam = Math.max(0, lim.limite_mes - usados)
        if (usados >= lim.limite_mes * 0.8) {
          setAvisoLimite(t.avisoRestam(restam, lim.limite_mes))
        }
      }
    } catch (e) {
      setErro(t.erroConexao)
    } finally {
      setInterpretando(false)
    }
  }, [categorias])

  const { gravando, parcial, suportado, iniciar, parar } = useVoz((t) => interpretar(t, 'voz'))

  // true se o usuário mexeu em algo em relação ao que a IA sugeriu.
  function houveCorrecao(f) {
    if (!jsonIa) return false
    const iaCat = categorias.some(c => c.nome === jsonIa.categoria) ? jsonIa.categoria : 'outros'
    return (
      (jsonIa.tipo === 'entrada' ? 'entrada' : 'gasto') !== f.tipo ||
      Number(jsonIa.valor) !== Number(f.valor) ||
      (jsonIa.descricao || '') !== f.descricao ||
      iaCat !== f.categoria ||
      (jsonIa.cartao_id || '') !== f.cartao_id ||
      (jsonIa.parcelas && jsonIa.parcelas > 1 ? jsonIa.parcelas : 1) !== Number(f.parcelas)
    )
  }

  async function salvar() {
    const valor = parseFloat(form.valor)
    if (!valor || valor <= 0 || !perfil?.grupo_id) return
    setSalvando(true)

    let op
    if (form.tipo === 'entrada') {
      op = supabase.from('entradas').insert({
        descricao: form.descricao, valor, tipo: form.entrada_tipo,
        recorrente: false, data: form.data, recebido: form.data <= hojeISO(),
        grupo_id: perfil.grupo_id, usuario_id: perfil.id,
      })
    } else if (form.cartao_id && Number(form.parcelas) > 1) {
      const n = Number(form.parcelas)
      op = supabase.from('parcelamentos').insert({
        descricao: form.descricao, valor_total: valor, num_parcelas: n,
        valor_parcela: parseFloat((valor / n).toFixed(2)), cartao_id: form.cartao_id,
        categoria: form.categoria, data_primeira_parcela: form.data,
        grupo_id: perfil.grupo_id, usuario_id: perfil.id,
      })
    } else {
      op = supabase.from('gastos').insert({
        grupo_id: perfil.grupo_id, usuario_id: perfil.id, descricao: form.descricao,
        valor, categoria: form.categoria,
        tipo_pagamento: form.cartao_id ? 'cartao' : form.tipo_pagamento,
        cartao_id: form.cartao_id || null, data: form.data, origem: origemLanc,
      })
    }

    const { error } = await run(op, { ok: form.tipo === 'entrada' ? t.okEntrada : t.okGasto })
    if (error) { setSalvando(false); return }

    // Marca o log como salvo (e se o usuário corrigiu) — alimenta a taxa de acerto no /admin.
    if (logId) {
      supabase.from('interpretacoes_log')
        .update({ json_final: form, corrigido: houveCorrecao(form), salvo: true })
        .eq('id', logId).then(() => {}, () => {})
    }

    setSalvando(false); setSucesso(true)
    setTimeout(() => { fechar(); onSalvo?.() }, 1100)
  }

  function fechar() {
    if (gravando) parar()
    setAberto(false); setTexto(''); setDigitado(''); setForm(null); setJsonIa(null)
    setLogId(null); setErro(''); setAvisoLimite(''); setSucesso(false); setInterpretando(false); setCorrigindo(false)
  }

  const ehGasto = form?.tipo === 'gasto'

  // Resumo do card "Entendi assim" (só leitura; "Corrigir" abre o formulário completo).
  function resumo() {
    if (!form) return []
    const dataTxt = form.data === hojeISO() ? t.hoje : fmtData(form.data)
    if (!ehGasto) {
      return [
        [t.colDescricao, form.descricao || '—'],
        [t.colTipo, form.entrada_tipo === 'fixo' ? t.entradaFixo : t.entradaAvulso],
        [t.colData, dataTxt],
      ]
    }
    const cartao = cartoes.find(c => c.id === form.cartao_id)
    let pag = form.cartao_id ? (cartao?.nome || 'Cartão') : form.tipo_pagamento === 'dinheiro' ? t.dinheiro : t.pix
    if (form.cartao_id && Number(form.parcelas) > 1) pag += ` · ${t.parcelasN(Number(form.parcelas))}`
    const cat = categorias.find(c => c.nome === form.categoria)
    return [
      [t.colCategoria, `${cat?.emoji || ''} ${form.categoria}`.trim()],
      [t.colPagamento, pag],
      [t.colData, dataTxt],
    ]
  }

  const valorOk = parseFloat(form?.valor) > 0

  return (
    <>
      {!aberto && (
        <div style={{ position: 'fixed', bottom: 78, left: 16, zIndex: 50 }}>
          <MicButton onClick={() => setAberto(true)} aria-label={t.abrirBotao} />
        </div>
      )}

      {aberto && (
        <div className="modal-overlay" onClick={fechar}>
          <div className="modal voz-sheet" role="dialog" aria-label={t.titulo} onClick={e => e.stopPropagation()}>
            {/* Barrinha de arraste (visual) */}
            <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border2)', margin: '0 auto 12px' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="var(--accent)" /> {t.titulo}
              </h2>
              <button onClick={fechar} aria-label={t.fechar} style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} color="var(--text2)" /></button>
            </div>

            {/* Passo 1: ouvir (voz) ou digitar */}
            {!form && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <span aria-live="polite" style={{ fontSize: 13, color: 'var(--text2)' }}>
                  {interpretando ? t.interpretar : gravando ? t.ouvindo : t.toqueParaFalar}
                </span>

                <div style={{ position: 'relative', width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {gravando && [0, 0.9].map(d => (
                    <span key={d} aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--accent)', animation: `hf-ring 1.8s ease-out ${d}s infinite` }} />
                  ))}
                  <MicButton
                    size={80}
                    onClick={gravando ? parar : iniciar}
                    disabled={!suportado || interpretando}
                    aria-label={gravando ? t.parar : t.falar}
                    style={{ opacity: !suportado || interpretando ? 0.5 : 1 }}
                  />
                </div>

                {gravando && (
                  <svg width="200" height="40" viewBox="0 0 200 40" aria-hidden="true">
                    {ONDA.map((atraso, i) => (
                      <rect key={i} className="hf-wave" x={i * 16} y="4" width="8" height="32" rx="4" fill="var(--accent)" style={{ animationDelay: `${atraso}s` }} />
                    ))}
                  </svg>
                )}

                {/* Transcrição ao vivo enquanto a pessoa fala */}
                {gravando && (
                  <p aria-live="polite" style={{ margin: 0, fontSize: 18, lineHeight: '26px', textAlign: 'center', minHeight: 52, color: parcial ? 'var(--text)' : 'var(--text3)' }}>
                    {parcial ? <>“{parcial}”</> : t.falePerto}
                  </p>
                )}

                <form style={{ width: '100%', display: 'flex', gap: 8 }} onSubmit={e => { e.preventDefault(); interpretar(digitado, 'texto') }}>
                  <input
                    value={digitado}
                    onChange={e => setDigitado(e.target.value)}
                    placeholder={t.phTexto}
                    disabled={interpretando}
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn-primary" disabled={interpretando || !digitado.trim()} style={{ padding: '0 14px', display: 'flex', alignItems: 'center' }} aria-label={t.interpretarAria}>
                    {interpretando ? <Loader size={18} className="spin" /> : <Send size={18} />}
                  </button>
                </form>

                <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>{t.dica}</p>
                {!suportado && <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>{t.semSuporte}</p>}
                {erro && <p role="alert" style={{ color: 'var(--red-text)', fontSize: 13, textAlign: 'center' }}>{erro}</p>}
              </div>
            )}

            {/* Passo 2: confirmar o que a IA entendeu */}
            {form && (
              <div>
                {texto && (
                  <p style={{ fontSize: 18, lineHeight: '26px', textAlign: 'center', marginBottom: 16 }}>
                    “<span style={{ fontStyle: 'italic' }}>{texto}</span>”
                  </p>
                )}

                {!corrigindo ? (
                  <div className="hf-slide" style={{ border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t.entendiAssim}</span>
                      <Tag cor={ehGasto ? 'vermelho' : 'verde'}>{ehGasto ? t.tagGasto : t.tagEntrada}</Tag>
                    </div>
                    <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 28 }}>{fmt(form.valor)}</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, fontSize: 13 }}>
                      {resumo().map(([rot, val]) => (
                        <div key={rot} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ color: 'var(--text2)' }}>{rot}</span>
                          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                        </div>
                      ))}
                    </div>
                    {avisoLimite && (
                      <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--amber-text)' }}>
                        <AlertTriangle size={14} /> {avisoLimite}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setCorrigindo(true)}
                        style={{ flex: 1, minHeight: 44, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', color: 'var(--text2)', background: 'transparent', fontSize: 14 }}>
                        {t.corrigir}
                      </button>
                      <button className="btn-primary" onClick={salvar} disabled={salvando || sucesso || !valorOk}
                        style={{ flex: 2, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        {sucesso ? <><Check size={18} /> {t.salvo}</> : salvando ? <><Loader size={18} className="spin" /> {t.salvando}</> : (ehGasto ? t.salvarGasto : t.salvarEntrada)}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* Tipo */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                      {['gasto', 'entrada'].map(tp => (
                        <button
                          key={tp}
                          onClick={() => setForm(p => ({ ...p, tipo: tp }))}
                          style={{ flex: 1, padding: '8px 0', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 600, textTransform: 'capitalize', border: `1.5px solid ${form.tipo === tp ? 'var(--accent)' : 'var(--border)'}`, background: form.tipo === tp ? 'var(--accent-dim)' : 'transparent', color: form.tipo === tp ? 'var(--accent)' : 'var(--text2)' }}
                        >
                          {tp}
                        </button>
                      ))}
                    </div>

                    <div className="form-group">
                      <label>{t.labelDescricao}</label>
                      <input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>{t.labelValor}</label>
                        <input type="number" step="0.01" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label>{t.labelData}</label>
                        <input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} />
                      </div>
                    </div>

                    {ehGasto ? (
                      <>
                        <div className="form-group">
                          <label>{t.labelCategoria}</label>
                          <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                            {categorias.map(c => <option key={c.nome} value={c.nome}>{c.emoji} {c.nome}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>{t.labelPagamento}</label>
                          <select value={form.cartao_id || form.tipo_pagamento} onChange={e => {
                            const v = e.target.value
                            if (v === 'pix' || v === 'dinheiro') setForm(p => ({ ...p, cartao_id: '', tipo_pagamento: v, parcelas: 1 }))
                            else setForm(p => ({ ...p, cartao_id: v, tipo_pagamento: 'cartao' }))
                          }}>
                            <option value="pix">{t.pix}</option>
                            <option value="dinheiro">{t.dinheiro}</option>
                            {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                          </select>
                        </div>
                        {form.cartao_id && (
                          <div className="form-group">
                            <label>{t.labelParcelas} {Number(form.parcelas) > 1 ? `(${Number(form.parcelas)}x de ${fmt(parseFloat(form.valor || 0) / Number(form.parcelas))})` : t.aVista}</label>
                            <input type="number" min="1" value={form.parcelas} onChange={e => setForm(p => ({ ...p, parcelas: e.target.value }))} />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="form-group">
                        <label>{t.labelTipoEntrada}</label>
                        <select value={form.entrada_tipo} onChange={e => setForm(p => ({ ...p, entrada_tipo: e.target.value }))}>
                          <option value="fixo">{t.entradaFixoOpt}</option>
                          <option value="avulso">{t.entradaAvulso}</option>
                        </select>
                      </div>
                    )}

                    {avisoLimite && (
                      <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--amber-text)', marginBottom: 12 }}>
                        <AlertTriangle size={14} /> {avisoLimite}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <button
                        onClick={() => { setForm(null); setTexto(''); setDigitado(''); setErro(''); setCorrigindo(false) }}
                        style={{ padding: '0 16px', minHeight: 44, borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', color: 'var(--text2)', background: 'transparent' }}
                      >
                        {t.refazer}
                      </button>
                      <button
                        className="btn-primary"
                        style={{ flex: 1, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                        onClick={salvar}
                        disabled={salvando || sucesso || !valorOk}
                      >
                        {sucesso ? <><Check size={18} /> {t.salvo}</> : salvando ? <><Loader size={18} className="spin" /> {t.salvando}</> : t.confirmarSalvar}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </>
  )
}
