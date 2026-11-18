import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Check, RotateCcw, ChevronDown, ChevronUp, Plus, Send, Trash2, X } from 'lucide-react'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { fmt, fmtData, hojeISO } from '../lib/format'
import { addMeses, compDe, diasNoMes, nomeMes, garantirSeries, hojeBRT } from '../lib/motor'

// "A receber" — o que outras pessoas te devem:
//  • compras delas no seu cartão/pix (Gastos → "Foi de outra pessoa") — à vista e parcelado;
//  • valores lançados aqui à mão (ex.: parte da Jacqueline no aluguel), com "repete todo mês".
// "Receber de Fulano" marca o que a pessoa pagou e lança UMA entrada com o total (decisão do
// Raul, 16/11/2026: parar de lançar reembolso à mão). Nada disso conta como seu gasto.
const novoManual = () => ({ pessoaId: '', pessoaNome: '', descricao: '', valor: '', data: hojeISO(), recorrente: false })

export default function AReceber() {
  const { perfil } = useAuth()
  const run = useDb()
  const { toast } = useToast()
  const [itens, setItens] = useState([])
  const [pessoas, setPessoas] = useState([])
  const [loading, setLoading] = useState(true)
  const [verRecebidos, setVerRecebidos] = useState(false)
  const [verFuturos, setVerFuturos] = useState({})
  const [manual, setManual] = useState(null)      // form do "a receber" manual
  const [receber, setReceber] = useState(null)    // { pessoaId, nome, selecionados:Set, criarEntrada, data }
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])

  async function carregar() {
    setLoading(true)
    await garantirSeries()
    const gid = perfil.grupo_id
    const [{ data: gs }, { data: ps }, { data: ms }, { data: pe }] = await Promise.all([
      supabase.from('gastos')
        .select('id, descricao, valor, data, pessoa_id, reembolso_status, reembolso_quitado_em, reembolso_entrada_id, pessoas(nome), cartoes(nome)')
        .eq('grupo_id', gid).not('pessoa_id', 'is', null).order('data', { ascending: false }),
      supabase.from('parcelas')
        .select('id, numero, valor, data_vencimento, recebido, reembolso_entrada_id, parcelamentos!inner(descricao, num_parcelas, pessoa_id, pessoas(nome), cartoes(nome))')
        .eq('grupo_id', gid).not('parcelamentos.pessoa_id', 'is', null).order('data_vencimento', { ascending: false }),
      supabase.from('a_receber')
        .select('id, descricao, valor, data, recebido, recebido_em, entrada_id, recorrente, serie_id, pessoa_id, pessoas(nome)')
        .eq('grupo_id', gid).order('data', { ascending: false }),
      supabase.from('pessoas').select('id, nome').eq('grupo_id', gid).order('nome'),
    ])
    const deGastos = (gs || []).map(g => ({
      kind: 'gasto', id: g.id, descricao: g.descricao, valor: Number(g.valor), data: g.data,
      recebido: g.reembolso_status === 'quitado', recebidoEm: g.reembolso_quitado_em, entradaId: g.reembolso_entrada_id,
      pessoaId: g.pessoa_id, pessoa: g.pessoas?.nome || 'Alguém', origem: g.cartoes?.nome || 'à vista',
    }))
    const deParcelas = (ps || []).map(p => ({
      kind: 'parcela', id: p.id,
      descricao: `${p.parcelamentos?.descricao || 'Parcelado'} · ${p.numero}/${p.parcelamentos?.num_parcelas}x`,
      valor: Number(p.valor), data: p.data_vencimento, recebido: !!p.recebido, recebidoEm: null, entradaId: p.reembolso_entrada_id,
      pessoaId: p.parcelamentos?.pessoa_id, pessoa: p.parcelamentos?.pessoas?.nome || 'Alguém', origem: p.parcelamentos?.cartoes?.nome || 'parcelado',
    }))
    const deManuais = (ms || []).map(m => ({
      kind: 'manual', id: m.id, descricao: m.descricao, valor: Number(m.valor), data: m.data,
      recebido: !!m.recebido, recebidoEm: m.recebido_em, entradaId: m.entrada_id, recorrente: m.recorrente, serieId: m.serie_id,
      pessoaId: m.pessoa_id, pessoa: m.pessoas?.nome || 'Alguém', origem: m.recorrente ? 'todo mês' : 'lançado à mão',
    }))
    setItens([...deGastos, ...deParcelas, ...deManuais].sort((a, b) => (b.data || '').localeCompare(a.data || '')))
    setPessoas(pe || [])
    setLoading(false)
  }

  // ---------------------------------------------------------- derivados
  const hoje = hojeBRT()
  const compHoje = compDe(hoje)
  const fimDoMes = `${compHoje}-${String(diasNoMes(compHoje)).padStart(2, '0')}`
  const pendentes = itens.filter(g => !g.recebido)
  const recebidos = itens.filter(g => g.recebido)

  const porPessoa = {}
  for (const g of pendentes) {
    const k = g.pessoaId || g.pessoa
    if (!porPessoa[k]) porPessoa[k] = { id: g.pessoaId, nome: g.pessoa, agora: [], futuros: [] }
    if ((g.data || '') <= fimDoMes) porPessoa[k].agora.push(g); else porPessoa[k].futuros.push(g)
  }
  const grupos = Object.values(porPessoa).map(gp => ({
    ...gp, totalAgora: gp.agora.reduce((s, x) => s + x.valor, 0), totalFuturo: gp.futuros.reduce((s, x) => s + x.valor, 0),
    futuros: gp.futuros.sort((a, b) => a.data.localeCompare(b.data)),
  })).sort((a, b) => b.totalAgora - a.totalAgora)
  const totalAgora = grupos.reduce((s, g) => s + g.totalAgora, 0)

  // ---------------------------------------------------------- ações
  async function confirmarRecebimento() {
    const sel = itens.filter(i => receber.selecionados.has(`${i.kind}:${i.id}`))
    if (!sel.length) { toast('Escolha o que a pessoa pagou.', 'erro'); return }
    setSalvando(true)
    const { data, error } = await run(supabase.rpc('receber_de_pessoa', {
      p_pessoa: receber.pessoaId,
      p_gastos: sel.filter(i => i.kind === 'gasto').map(i => i.id),
      p_parcelas: sel.filter(i => i.kind === 'parcela').map(i => i.id),
      p_a_receber: sel.filter(i => i.kind === 'manual').map(i => i.id),
      p_criar_entrada: receber.criarEntrada,
      p_data: receber.data || hojeISO(),
    }))
    setSalvando(false)
    if (error) return
    toast(receber.criarEntrada ? `Recebido ${fmt(data?.total)} — entrada lançada` : `Marcado como recebido (${fmt(data?.total)})`, 'ok')
    setReceber(null); carregar()
  }

  async function reabrir(it) {
    if (it.entradaId) {
      if (!confirm('Esse valor foi recebido junto com outros itens. Reabrir desfaz o recebimento inteiro e apaga a entrada de reembolso. Continuar?')) return
      const { error } = await run(supabase.rpc('desfazer_recebimento', { p_entrada: it.entradaId }), { ok: 'Recebimento desfeito' })
      if (!error) carregar()
      return
    }
    // Recebimentos antigos (antes do reembolso automático): só desmarca
    let q
    if (it.kind === 'gasto') q = supabase.from('gastos').update({ reembolso_status: 'pendente', reembolso_quitado_em: null }).eq('id', it.id)
    else if (it.kind === 'parcela') q = supabase.from('parcelas').update({ recebido: false }).eq('id', it.id)
    else q = supabase.from('a_receber').update({ recebido: false, recebido_em: null }).eq('id', it.id)
    const { error } = await run(q, { ok: 'Reaberto' })
    if (!error) carregar()
  }

  async function excluirManual(it) {
    if (it.serieId && it.recorrente) {
      const todos = confirm('Esse valor repete todo mês.\n\nOK = apagar este e os próximos (para de repetir)\nCancelar = apagar só este mês')
      if (todos) {
        const { error } = await run(supabase.from('a_receber').delete().eq('serie_id', it.serieId).eq('recebido', false).gte('data', it.data), { ok: 'Apagado (não repete mais)' })
        if (error) return
        await supabase.from('a_receber').update({ recorrente: false }).eq('serie_id', it.serieId)
        carregar(); return
      }
    } else if (!confirm('Apagar este valor a receber?')) return
    const { error } = await run(supabase.from('a_receber').delete().eq('id', it.id), { ok: 'Apagado' })
    if (!error) carregar()
  }

  async function salvarManual() {
    const valor = parseFloat(String(manual.valor).replace(',', '.'))
    if (!manual.descricao.trim() || !(valor > 0)) { toast('Preencha descrição e valor.', 'erro'); return }
    let pessoaId = manual.pessoaId
    const nomeNovo = manual.pessoaNome.trim()
    if (!pessoaId && !nomeNovo) { toast('Escolha ou escreva quem vai pagar.', 'erro'); return }
    setSalvando(true)
    if (!pessoaId) {
      const existe = pessoas.find(p => p.nome.toLowerCase() === nomeNovo.toLowerCase())
      if (existe) pessoaId = existe.id
      else {
        const { data, error } = await run(supabase.from('pessoas').insert({ grupo_id: perfil.grupo_id, nome: nomeNovo }).select('id').single())
        if (error) { setSalvando(false); return }
        pessoaId = data.id
      }
    }
    const { error } = await run(supabase.from('a_receber').insert({
      grupo_id: perfil.grupo_id, pessoa_id: pessoaId, descricao: manual.descricao.trim(), valor, data: manual.data || hojeISO(),
      recorrente: !!manual.recorrente, serie_id: manual.recorrente ? crypto.randomUUID() : null,
    }), { ok: manual.recorrente ? 'Lançado — vai aparecer todo mês' : 'Lançado' })
    setSalvando(false)
    if (error) return
    if (manual.recorrente) await supabase.rpc('garantir_series')
    setManual(null); carregar()
  }

  function enviarCobranca(gp) {
    const linhas = gp.agora.slice().sort((a, b) => a.data.localeCompare(b.data))
      .map(i => `• ${i.descricao} — ${fmt(i.valor)}`)
    const texto = `Oi, ${gp.nome.split(' ')[0]}! Fechando ${nomeMes(compHoje)}:\n${linhas.join('\n')}\n\nTotal: ${fmt(gp.totalAgora)}`
    if (navigator.share) navigator.share({ text: texto }).catch(() => {})
    else window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
  }

  function abrirReceber(gp) {
    setReceber({ pessoaId: gp.id, nome: gp.nome, selecionados: new Set(gp.agora.map(i => `${i.kind}:${i.id}`)), criarEntrada: true, data: hojeISO() })
  }

  // ---------------------------------------------------------- UI
  const Linha = ({ g, acao }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 500, textDecoration: g.recebido ? 'line-through' : 'none', color: g.recebido ? 'var(--text3)' : 'var(--text)' }}>{g.descricao}</p>
        <p style={{ fontSize: 11, color: 'var(--text3)' }}>
          {fmtData(g.data, 'dd/MM')} · {g.origem}
          {g.recebido && g.recebidoEm ? ` · recebido ${fmtData(g.recebidoEm, 'dd/MM')}` : ''}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Syne', color: g.recebido ? 'var(--text3)' : 'var(--text)' }}>{fmt(g.valor)}</span>
        {acao}
      </div>
    </div>
  )

  const selTotal = receber ? itens.filter(i => receber.selecionados.has(`${i.kind}:${i.id}`)).reduce((s, i) => s + i.valor, 0) : 0
  const itensDaPessoa = receber ? pendentes.filter(i => (i.pessoaId || i.pessoa) === (receber.pessoaId || receber.nome)).sort((a, b) => a.data.localeCompare(b.data)) : []

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ fontSize: 20 }}>A receber</h2>
        <button onClick={() => setManual(novoManual())} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--on-accent)', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> Lançar
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.5 }}>
        O que outras pessoas te devem: compras delas no seu cartão ou pix e valores que você lança aqui (ex.: a parte de alguém no aluguel). Quando a pessoa pagar, toque em <strong>Receber</strong> — o app lança a entrada sozinho. Nada disso conta como seu gasto.
      </p>

      {loading ? <div className="empty-state">Carregando...</div> : itens.length === 0 ? (
        <div className="empty-state">Nada a receber por aqui. Use <strong>Lançar</strong> ou, num gasto, ligue “Foi de outra pessoa”.</div>
      ) : (
        <>
          {grupos.length > 0 && (
            <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg3)' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Pra cobrar até o fim de {nomeMes(compHoje)}</span>
              <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Syne', color: 'var(--amber-text)' }}>{fmt(totalAgora)}</span>
            </div>
          )}

          {grupos.map(gp => (
            <div key={gp.id || gp.nome} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 600, fontFamily: 'Syne' }}>{gp.nome}</span>
                <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Syne', color: 'var(--amber-text)' }}>{fmt(gp.totalAgora)}</span>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 8 }}>
                cobrar agora · {gp.agora.length} {gp.agora.length === 1 ? 'item' : 'itens'}{gp.totalFuturo > 0 ? ` · mais ${fmt(gp.totalFuturo)} nos próximos meses` : ''}
              </p>
              {gp.agora.map(g => (
                <Linha key={`${g.kind}-${g.id}`} g={g} acao={g.kind === 'manual'
                  ? <button onClick={() => excluirManual(g)} title="Apagar"><Trash2 size={14} color="var(--text3)" /></button>
                  : null} />
              ))}
              {gp.agora.length > 0 && gp.id && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => abrirReceber(gp)}>
                    <Check size={15} /> Receber de {gp.nome.split(' ')[0]}
                  </button>
                  <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => enviarCobranca(gp)} title="Mandar a cobrança">
                    <Send size={15} /> Cobrar
                  </button>
                </div>
              )}
              {gp.futuros.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => setVerFuturos(v => ({ ...v, [gp.nome]: !v[gp.nome] }))} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
                    Próximos meses ({gp.futuros.length}) {verFuturos[gp.nome] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {verFuturos[gp.nome] && gp.futuros.map(g => (
                    <Linha key={`${g.kind}-${g.id}`} g={g} acao={g.kind === 'manual' ? <button onClick={() => excluirManual(g)} title="Apagar"><Trash2 size={14} color="var(--text3)" /></button> : null} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {recebidos.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <button onClick={() => setVerRecebidos(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, fontFamily: 'Syne', color: 'var(--text2)', marginBottom: 8 }}>
                Já recebidos ({recebidos.length}) {verRecebidos ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              {verRecebidos && (
                <div className="card">
                  {recebidos.map(g => (
                    <Linha key={`${g.kind}-${g.id}`} g={g} acao={
                      <button onClick={() => reabrir(g)} title="Reabrir" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>
                        <RotateCcw size={13} /> reabrir
                      </button>} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Receber de Fulano */}
      {receber && (
        <div className="modal-overlay" onClick={() => setReceber(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '86vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 18 }}>Receber de {receber.nome}</h2>
              <button onClick={() => setReceber(null)}><X size={20} color="var(--text2)" /></button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 12 }}>Marque o que a pessoa pagou.</p>
            {itensDaPessoa.map(i => {
              const k = `${i.kind}:${i.id}`
              const on = receber.selecionados.has(k)
              return (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => setReceber(r => { const s = new Set(r.selecionados); on ? s.delete(k) : s.add(k); return { ...r, selecionados: s } })} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.descricao}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtData(i.data, 'dd/MM/yy')} · {i.origem}</span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt(i.valor)}</span>
                </label>
              )
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '12px 0' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Total recebido</span>
              <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Syne', color: 'var(--accent-text)' }}>{fmt(selTotal)}</span>
            </div>
            <div className="form-group">
              <label>Data em que recebeu</label>
              <input type="date" value={receber.data} onChange={e => setReceber(r => ({ ...r, data: e.target.value }))} />
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text2)', marginBottom: 16, cursor: 'pointer', lineHeight: 1.4 }}>
              <input type="checkbox" checked={receber.criarEntrada} onChange={e => setReceber(r => ({ ...r, criarEntrada: e.target.checked }))} style={{ marginTop: 2 }} />
              <span>Lançar a entrada de {fmt(selTotal)} em Entradas (desmarque só se você já lançou esse dinheiro à mão)</span>
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setReceber(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1, opacity: salvando ? 0.6 : 1 }} disabled={salvando || selTotal <= 0} onClick={confirmarRecebimento}>
                {salvando ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lançar a receber manual */}
      {manual && (
        <div className="modal-overlay" onClick={() => setManual(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Lançar a receber</h2>
            <p style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 14 }}>Um valor que alguém vai te pagar (que não é compra no seu cartão).</p>
            <div className="form-group">
              <label>Quem vai pagar</label>
              {pessoas.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {pessoas.map(p => (
                    <button key={p.id} type="button" onClick={() => setManual(m => ({ ...m, pessoaId: m.pessoaId === p.id ? '' : p.id, pessoaNome: '' }))}
                      style={{ padding: '6px 12px', borderRadius: 16, fontSize: 13, border: `1px solid ${manual.pessoaId === p.id ? 'var(--accent)' : 'var(--border2)'}`, background: manual.pessoaId === p.id ? 'var(--accent-dim)' : 'var(--bg2)', color: 'var(--text)' }}>
                      {p.nome}
                    </button>
                  ))}
                </div>
              )}
              {!manual.pessoaId && (
                <input value={manual.pessoaNome} onChange={e => setManual(m => ({ ...m, pessoaNome: e.target.value }))} placeholder={pessoas.length ? 'Ou escreva um nome novo' : 'Nome (ex.: Jacqueline)'} />
              )}
            </div>
            <div className="form-group"><label>Descrição</label><input value={manual.descricao} onChange={e => setManual(m => ({ ...m, descricao: e.target.value }))} placeholder="Ex.: parte do aluguel" /></div>
            <div className="form-row">
              <div className="form-group"><label>Valor</label><input type="number" inputMode="decimal" value={manual.valor} onChange={e => setManual(m => ({ ...m, valor: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>Cobrar em</label><input type="date" value={manual.data} onChange={e => setManual(m => ({ ...m, data: e.target.value }))} /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={manual.recorrente} onChange={e => setManual(m => ({ ...m, recorrente: e.target.checked }))} />
              Repete todo mês (aparece de novo no mês seguinte; você ajusta o valor se mudar)
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setManual(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1, opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={salvarManual}>{salvando ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
