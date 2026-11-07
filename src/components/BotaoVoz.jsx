import { useState, useCallback, useEffect } from 'react'
import { Mic, MicOff, X, Check, Loader, Sparkles, Send, AlertTriangle } from 'lucide-react'
import { MicButton } from './ui'
import { useVoz } from '../hooks/useVoz'
import { useAuth } from '../contexts/AuthContext'
import { useCategorias } from '../hooks/useCategorias'
import { useDb } from '../hooks/useDb'
import { supabase } from '../lib/supabase'
import { hojeISO } from '../lib/format'

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
          setErro('Você atingiu o limite de lançamentos por IA deste mês. Lance manualmente ou tente no próximo ciclo.')
        } else {
          setErro(corpo?.erro || 'Não consegui interpretar agora. Tente de novo ou lance manualmente.')
        }
        return
      }
      if (!data?.ok) { setErro(data?.erro || 'Não entendi. Tente reformular.'); return }

      const d = data.dados
      setJsonIa(d)
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
          setAvisoLimite(`Restam ${restam} lançamentos por IA neste mês (de ${lim.limite_mes}).`)
        }
      }
    } catch (e) {
      setErro('Falha de conexão. Tente de novo.')
    } finally {
      setInterpretando(false)
    }
  }, [categorias])

  const { gravando, suportado, iniciar, parar } = useVoz((t) => interpretar(t, 'voz'))

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

    const { error } = await run(op, { ok: form.tipo === 'entrada' ? 'Entrada registrada' : 'Gasto registrado' })
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
    setLogId(null); setErro(''); setAvisoLimite(''); setSucesso(false); setInterpretando(false)
  }

  const ehGasto = form?.tipo === 'gasto'

  return (
    <>
      {!aberto && (
        <div style={{ position: 'fixed', bottom: 78, left: '50%', transform: 'translateX(-50%)', zIndex: 50 }}>
          <MicButton onClick={() => setAberto(true)} aria-label="Lançar por voz ou texto" />
        </div>
      )}

      {aberto && (
        <div className="modal-overlay" onClick={fechar}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="var(--accent)" /> Lançar rápido
              </h2>
              <button onClick={fechar} aria-label="Fechar"><X size={20} color="var(--text2)" /></button>
            </div>

            {/* Entrada por voz + texto, no mesmo fluxo */}
            {!form && (
              <>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                  <button
                    onClick={gravando ? parar : iniciar}
                    disabled={!suportado || interpretando}
                    style={{ width: 52, height: 52, flexShrink: 0, borderRadius: '50%', background: gravando ? 'var(--red-dim)' : 'var(--accent-dim)', border: `2px solid ${gravando ? 'var(--red)' : 'var(--accent)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', animation: gravando ? 'pulse 1s infinite' : 'none' }}
                    aria-label={gravando ? 'Parar' : 'Falar'}
                  >
                    {gravando ? <MicOff size={24} color="var(--red)" /> : <Mic size={24} color="var(--accent)" />}
                  </button>
                  <form
                    style={{ flex: 1, display: 'flex', gap: 8 }}
                    onSubmit={e => { e.preventDefault(); interpretar(digitado, 'texto') }}
                  >
                    <input
                      value={digitado}
                      onChange={e => setDigitado(e.target.value)}
                      placeholder="Ex: mercado 87 no Nubank"
                      disabled={interpretando}
                      style={{ flex: 1 }}
                      autoFocus
                    />
                    <button type="submit" className="btn-primary" disabled={interpretando || !digitado.trim()} style={{ padding: '0 14px', display: 'flex', alignItems: 'center' }} aria-label="Interpretar">
                      {interpretando ? <Loader size={18} className="spin" /> : <Send size={18} />}
                    </button>
                  </form>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                  {gravando ? '🔴 Ouvindo... fale o lançamento' : 'Fale ou digite. Entende gasto, entrada, parcelas e datas ("ontem", "dia 5").'}
                </p>
                {!suportado && (
                  <p style={{ fontSize: 12, color: 'var(--text3)' }}>
                    Seu navegador não captura voz — use o campo de texto (ou o Chrome no Android).
                  </p>
                )}
                {interpretando && <p style={{ fontSize: 13, color: 'var(--accent2)', marginTop: 10 }}>Interpretando…</p>}
                {erro && <p style={{ color: 'var(--red-text)', fontSize: 13, marginTop: 12 }}>{erro}</p>}
              </>
            )}

            {/* Formulário pré-preenchido para confirmar/corrigir */}
            {form && (
              <div>
                {texto && (
                  <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 14 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>Você disse: </span>
                    <span style={{ fontSize: 13, fontStyle: 'italic' }}>"{texto}"</span>
                  </div>
                )}

                {/* Tipo */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {['gasto', 'entrada'].map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(p => ({ ...p, tipo: t }))}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 600, textTransform: 'capitalize', border: `1.5px solid ${form.tipo === t ? 'var(--accent)' : 'var(--border)'}`, background: form.tipo === t ? 'var(--accent-dim)' : 'transparent', color: form.tipo === t ? 'var(--accent)' : 'var(--text2)' }}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="form-group">
                  <label>Descrição</label>
                  <input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Valor</label>
                    <input type="number" step="0.01" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Data</label>
                    <input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} />
                  </div>
                </div>

                {ehGasto ? (
                  <>
                    <div className="form-group">
                      <label>Categoria</label>
                      <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                        {categorias.map(c => <option key={c.nome} value={c.nome}>{c.emoji} {c.nome}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Pagamento</label>
                      <select value={form.cartao_id || form.tipo_pagamento} onChange={e => {
                        const v = e.target.value
                        if (v === 'pix' || v === 'dinheiro') setForm(p => ({ ...p, cartao_id: '', tipo_pagamento: v, parcelas: 1 }))
                        else setForm(p => ({ ...p, cartao_id: v, tipo_pagamento: 'cartao' }))
                      }}>
                        <option value="pix">PIX</option>
                        <option value="dinheiro">Dinheiro</option>
                        {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </div>
                    {form.cartao_id && (
                      <div className="form-group">
                        <label>Parcelas {Number(form.parcelas) > 1 ? `(${Number(form.parcelas)}x de ${(parseFloat(form.valor || 0) / Number(form.parcelas)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : '(à vista)'}</label>
                        <input type="number" min="1" value={form.parcelas} onChange={e => setForm(p => ({ ...p, parcelas: e.target.value }))} />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="form-group">
                    <label>Tipo de entrada</label>
                    <select value={form.entrada_tipo} onChange={e => setForm(p => ({ ...p, entrada_tipo: e.target.value }))}>
                      <option value="fixo">Fixo (salário)</option>
                      <option value="avulso">Avulso</option>
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
                    onClick={() => { setForm(null); setTexto(''); setDigitado(''); setErro('') }}
                    style={{ padding: '0 16px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', color: 'var(--text2)', background: 'transparent' }}
                  >
                    Refazer
                  </button>
                  <button
                    className="btn-primary"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    onClick={salvar}
                    disabled={salvando || sucesso || !(parseFloat(form.valor) > 0)}
                  >
                    {sucesso ? <><Check size={18} /> Salvo!</> : salvando ? <><Loader size={18} className="spin" /> Salvando…</> : 'Confirmar e salvar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </>
  )
}
