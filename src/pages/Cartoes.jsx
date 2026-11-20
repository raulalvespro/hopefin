import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { paramsVoltarFatura, faturaPedida } from '../lib/voltar'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useAtualizarSozinho } from '../hooks/useAtualizarSozinho'
import { Plus, X, ArrowRight, ArrowLeft, Undo2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useDb } from '../hooks/useDb'
import { useToast } from '../contexts/ToastContext'
import { useCategorias } from '../hooks/useCategorias'
import SwipeRow from '../components/SwipeRow'
import FaturasDoMes from '../components/FaturasDoMes'
import { fmt, fmtData, hojeISO } from '../lib/format'
import { copy } from '../copy/pt-BR'
import {
  carregarMotor, faturaDoCartao, faturasDoCartaoAgora, limiteComprometido,
  addMeses, compDe, compsEntre, hojeBRT, nomeMesCurto, diaDe, planoMoverParcelas,
  compDaCompra, vencimentoDaComp, fechamentoDaComp, dataDeCompraNaFatura, nomeMes,
} from '../lib/motor'

const bandeiras = { Visa: '💙', Mastercard: '🔴', Elo: '🟡', Amex: '🟢', Hipercard: '🔵' }
const CORES = ['#8B5CF6', '#3B82F6', '#14B8A6', '#10B981', '#F97316', '#EF4444', '#EC4899', '#64748B']
const novoForm = () => ({ nome: '', bandeira: 'Visa', cor: '', dia_fechamento: '', dia_vencimento: '', limite: '', alerta_dias: 3, fatura_fechada: '', fatura_inicial: '', compra_no_fechamento: 'proxima' })
const tc = copy.cartoes
const valorNum = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return n > 0 ? Math.round(n * 100) / 100 : 0 }

// Faturas do cartão que está sendo criado (A2.7): a fechada que ainda não venceu (se houver)
// e a aberta, pelos dias do formulário. null enquanto os dias não estão preenchidos.
function faturasIniciais(form, hoje) {
  const f = Number(form.dia_fechamento), v = Number(form.dia_vencimento)
  if (!(f >= 1 && f <= 31 && v >= 1 && v <= 31)) return null
  const cfg = { dia_fechamento: f, dia_vencimento: v, compra_no_fechamento: form.compra_no_fechamento }
  const compAberta = compDaCompra(cfg, hoje)
  const compFechada = addMeses(compAberta, -1)
  const vencFechada = vencimentoDaComp(cfg, compFechada)
  return {
    cfg,
    aberta: { comp: compAberta, fechamento: fechamentoDaComp(cfg, compAberta) },
    fechada: vencFechada >= hoje ? { comp: compFechada, vencimento: vencFechada } : null,
  }
}

// Cores do histórico: paga (verde), fechada no prazo (âmbar), atrasada (vermelho), aberta (azul claro)
const COR_STATUS = { paga: 'var(--accent)', fechada: 'var(--amber)', atrasada: 'var(--red)', aberta: 'var(--blue)' }
const ROTULO_STATUS = { paga: 'paga ✓', fechada: 'fechada · a pagar', atrasada: 'vencida · não paga', aberta: 'aberta' }
const ddmm = iso => fmtData(iso, 'dd/MM')

export default function Cartoes() {
  const { perfil } = useAuth()
  const run = useDb()
  const { toast } = useToast()
  const navigate = useNavigate()

  // Tocar num item da fatura abre o editar dele e, no fim, volta pra MESMA fatura (A8.7).
  function abrirItemFatura(it) {
    const volta = paramsVoltarFatura(detalhe)
    if (it.tipo === 'gasto') navigate(`/gastos?editar=${it.id}&${volta}`)
    else if (it.tipo === 'parcela' && it.parcelamentoId) navigate(`/parcelamentos?editar=${it.parcelamentoId}&${volta}`)
    else if (it.tipo === 'assinatura') navigate('/assinaturas')
  }
  const { emojiDe } = useCategorias()
  const [detalhe, setDetalhe] = useState(null)   // { cardId, comp }
  const [cartoes, setCartoes] = useState([])
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(novoForm())
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (perfil?.grupo_id) carregar() }, [perfil])
  useAtualizarSozinho(perfil?.grupo_id ? carregar : null) // aba abre na hora e se atualiza sozinha

  // Voltando do editar de um item (?cartao=&comp=): reabre a mesma fatura (A8.7).
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const pedida = faturaPedida(params)
    if (!pedida || !dados) return
    setParams({}, { replace: true })
    if (cartoes.some(c => c.id === pedida.cardId)) setDetalhe(pedida)
  }, [params, dados, cartoes]) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar(opcoes) {
    if (!opcoes?.silencioso) setLoading(true) // atualizando sozinha: sem "Carregando"
    try {
      const comp = compDe(hojeBRT())
      const d = await carregarMotor(perfil.grupo_id, { compIni: addMeses(comp, -10), compFim: addMeses(comp, 2), parcelasAte: addMeses(comp, 60) })
      setDados(d)
      setCartoes([...d.cartoes].sort((a, b) => a.nome.localeCompare(b.nome)))
    } catch (e) {
      console.error('[cartoes]', e); toast('Não foi possível carregar os cartões.', 'erro')
    }
    setLoading(false)
  }

  // Marca uma fatura (competência) como paga e conclui as parcelas que vencem nela.
  async function pagarFatura(card, f) {
    if (!confirm(`Marcar a fatura que vence em ${ddmm(f.vencimento)} (${fmt(f.total)}) como paga?\nAs parcelas dessa fatura entram como pagas.`)) return
    const { error } = await run(
      supabase.from('contas_pagas').upsert(
        { grupo_id: perfil.grupo_id, tipo: 'fatura', referencia_id: card.id, competencia: f.comp, valor: f.total, pago: true, data_pagamento: hojeISO() },
        { onConflict: 'tipo,referencia_id,competencia' }
      ),
      { ok: 'Fatura marcada como paga' }
    )
    if (error) return
    const ids = f.itens.filter(i => i.tipo === 'parcela' && !i.paga).map(i => i.id)
    if (ids.length) await supabase.from('parcelas').update({ paga: true }).in('id', ids)
    carregar()
  }

  // Desfaz o pagamento de uma fatura e reabre as parcelas dela: parcela de cartão "paga" =
  // fatura paga. O pagarFatura marca as parcelas; sem desmarcar aqui, elas ficavam riscadas
  // numa fatura em aberto (caso das 2 da Renner, 19/11).
  async function desfazerPagamento(card, comp) {
    const row = (dados?.contasPagas || []).find(p => p.tipo === 'fatura' && p.referencia_id === card.id && p.competencia === comp)
    if (!row?.id) return
    const { error } = await run(supabase.from('contas_pagas').delete().eq('id', row.id), { ok: tc.pagamentoDesfeito })
    if (error) return
    const { data: parcs } = await supabase.from('parcelamentos').select('id').eq('cartao_id', card.id)
    const idsParc = (parcs || []).map(p => p.id)
    if (idsParc.length) {
      const { error: e2 } = await supabase.from('parcelas').update({ paga: false })
        .in('parcelamento_id', idsParc).eq('paga', true)
        .gte('data_vencimento', `${comp}-01`).lt('data_vencimento', `${addMeses(comp, 1)}-01`)
      if (e2) toast(tc.reabrirParcelasErro, 'erro')
    }
    carregar()
  }

  // Move uma parcela ±1 fatura e leva junto as SEGUINTES da mesma compra (A2.9). Parcela de
  // fatura já paga não sai, e nenhuma entra numa fatura já paga. "Desfazer" volta tudo.
  async function moverParcela(parcelaId, delta) {
    const p = (dados?.parcelas || []).find(x => x.id === parcelaId)
    const card = p && cartoes.find(c => c.id === p.cartao_id)
    if (!p || !card) return
    // As parcelas da compra direto do banco (as mais distantes podem não estar carregadas)
    const [{ data: irmas, error }, { data: parc }] = await Promise.all([
      supabase.from('parcelas').select('id, numero, data_vencimento').eq('parcelamento_id', p.parcelamento_id),
      supabase.from('parcelamentos').select('data_primeira_parcela').eq('id', p.parcelamento_id).maybeSingle(),
    ])
    if (error || !irmas?.length) { toast(tc.moverErro, 'erro'); return }
    const plano = planoMoverParcelas({
      cartao: card, parcelas: irmas, parcelaId, delta, contasPagas: dados.contasPagas,
      diaBase: parc?.data_primeira_parcela ? diaDe(parc.data_primeira_parcela) : null,
    })
    if (!plano.ok) {
      if (plano.motivo === 'fatura_paga') toast(tc.parcelaEmFaturaPaga, 'erro')
      else if (plano.motivo === 'destino_pago') toast(tc.destinoPago, 'erro')
      return
    }
    if (!plano.mudancas.length) return
    const gravar = lado => Promise.all(plano.mudancas.map(m => supabase.from('parcelas').update({ data_vencimento: m[lado] }).eq('id', m.id)))
    // Moveu a 1ª parcela: o começo do parcelamento anda junto (editar depois não desfaz o ajuste)
    const primeira = parc ? plano.mudancas.find(m => m.numero === 1) : null
    const gravarInicio = data => supabase.from('parcelamentos').update({ data_primeira_parcela: data }).eq('id', p.parcelamento_id)
    const res = await gravar('para')
    if (res.some(r => r.error)) { await gravar('de'); toast(tc.moverErro, 'erro'); carregar(); return }
    if (primeira) await gravarInicio(primeira.para)
    carregar()
    const msg = tc.parcelaMovida(`${p.numero}/${p.num_parcelas}`, plano.mudancas.length - 1, delta > 0) + (plano.ficaram ? tc.ficaramNaPaga(plano.ficaram) : '')
    toast(msg, 'ok', {
      acao: { label: tc.desfazer, onClick: async () => { await gravar('de'); if (primeira) await gravarInicio(parc.data_primeira_parcela); carregar() } },
    })
  }

  // Move uma compra ±1 fatura (a data real da compra não muda). Com "Desfazer".
  async function moverGasto(gastoId, ajusteAtual, delta) {
    const novo = (ajusteAtual || 0) + delta
    const { error } = await supabase.from('gastos').update({ fatura_ajuste: novo }).eq('id', gastoId)
    if (error) { toast('Não foi possível mover a compra.', 'erro'); return }
    carregar()
    toast(delta > 0 ? 'Compra jogada pra próxima fatura' : 'Compra voltou pra fatura anterior', 'ok', {
      acao: { label: 'Desfazer', onClick: async () => { await supabase.from('gastos').update({ fatura_ajuste: ajusteAtual || 0 }).eq('id', gastoId); carregar() } },
    })
  }

  function abrirNovo() { setEditando(null); setForm(novoForm()); setModal(true) }
  function editar(c) {
    setEditando(c.id)
    setForm({
      nome: c.nome, bandeira: c.bandeira || 'Visa', cor: c.cor || '',
      dia_fechamento: String(c.dia_fechamento ?? ''), dia_vencimento: String(c.dia_vencimento ?? ''),
      limite: c.limite != null ? String(c.limite) : '', alerta_dias: c.alerta_dias ?? 3, fatura_fechada: '', fatura_inicial: '',
      compra_no_fechamento: c.compra_no_fechamento || 'proxima',
    })
    setModal(true)
  }
  function fecharModal() { setModal(false); setEditando(null); setForm(novoForm()) }

  async function salvar() {
    if (!form.nome || !form.dia_fechamento || !form.dia_vencimento) { toast('Preencha nome, fechamento e vencimento.', 'erro'); return }
    const payload = {
      nome: form.nome, bandeira: form.bandeira, cor: form.cor || null,
      dia_fechamento: parseInt(form.dia_fechamento), dia_vencimento: parseInt(form.dia_vencimento),
      limite: form.limite ? parseFloat(form.limite) : null, alerta_dias: parseInt(form.alerta_dias),
      compra_no_fechamento: form.compra_no_fechamento === 'atual' ? 'atual' : 'proxima',
    }
    setSalvando(true)
    if (editando) {
      const { error } = await run(supabase.from('cartoes').update(payload).eq('id', editando), { ok: 'Cartão atualizado' })
      if (error) { setSalvando(false); return }
    } else {
      const { data, error } = await run(
        supabase.from('cartoes').insert({ ...payload, grupo_id: perfil.grupo_id }).select('id').single(),
        { ok: 'Cartão criado' }
      )
      if (error) { setSalvando(false); return }
      // Valores iniciais (A2.7): cada um entra numa data que cai na fatura certa —
      // a fechada a pagar na véspera do fechamento dela, a aberta hoje.
      const hojeAgora = hojeBRT()
      const ini = faturasIniciais(form, hojeAgora)
      if (data?.id && ini) {
        const base = { grupo_id: perfil.grupo_id, usuario_id: perfil.id, cartao_id: data.id, tipo_pagamento: 'cartao', categoria: 'outros' }
        const vFechada = ini.fechada ? valorNum(form.fatura_fechada) : 0
        const vAberta = valorNum(form.fatura_inicial)
        const linhas = []
        if (vFechada > 0) linhas.push({ ...base, descricao: tc.descFechada, valor: vFechada, data: dataDeCompraNaFatura(ini.cfg, ini.fechada.comp) })
        if (vAberta > 0) linhas.push({ ...base, descricao: tc.descAberta, valor: vAberta, data: hojeAgora })
        if (linhas.length) await run(supabase.from('gastos').insert(linhas), { ok: tc.okInicial })
      }
    }
    setSalvando(false)
    fecharModal(); carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir este cartão?')) return
    const { error } = await run(supabase.from('cartoes').delete().eq('id', id), { ok: 'Cartão excluído' })
    if (!error) carregar()
  }

  const hoje = hojeBRT()
  const compHoje = compDe(hoje)

  // Bloco de uma fatura no card (a pagar ou aberta)
  function BlocoFatura({ card, f, rotulo, destaque }) {
    const vencEsteMes = compDe(f.vencimento) === compHoje
    const cor = COR_STATUS[f.status]
    return (
      <button onClick={() => setDetalhe({ cardId: card.id, comp: f.comp })}
        style={{ width: '100%', textAlign: 'left', marginTop: 10, padding: destaque ? '12px 14px' : '10px 14px', borderRadius: 'var(--radius-sm)', background: destaque ? 'var(--bg3)' : 'transparent', border: destaque ? `1px solid ${cor}` : '1px solid var(--border)', color: 'var(--text)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <strong style={{ color: cor, fontWeight: 700, textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '.04em' }}>{rotulo}</strong>
            {f.status === 'aberta' ? `fecha ${ddmm(f.fechamento)} · vence ${ddmm(f.vencimento)}` : `vence ${ddmm(f.vencimento)}`}
            {vencEsteMes && !f.paga && f.status !== 'atrasada' && <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--bg2)', color: 'var(--amber-text)', padding: '1px 7px', borderRadius: 10 }}>você paga este mês</span>}
          </span>
          <span style={{ fontSize: destaque ? 20 : 16, fontWeight: 700, fontFamily: 'Syne' }}>{fmt(f.total)}</span>
        </div>
        {f.totalTerceiros > 0 && <p style={{ fontSize: 11, color: 'var(--amber-text)', marginTop: 4 }}>{fmt(f.totalTerceiros)} é de outras pessoas</p>}
      </button>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20 }}>Cartões</h2>
        <button onClick={abrirNovo} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: 'var(--on-accent)', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 700, fontFamily: 'Syne' }}>
          <Plus size={16} /> Novo
        </button>
      </div>

      {/* P17: as faturas que vencem neste mês, de todos os cartões (toque abre a fatura) */}
      {dados && cartoes.length > 0 && (
        <FaturasDoMes faturas={cartoes.map(c => faturaDoCartao(c, compHoje, dados, hoje))} nomeMes={nomeMes(compHoje)} hoje={hoje}
          onAbrir={f => setDetalhe({ cardId: f.cartaoId, comp: f.comp })} style={{ marginBottom: 14 }} />
      )}

      {loading && !dados ? <div className="empty-state">Carregando...</div>
        : cartoes.length === 0 ? <div className="empty-state">Nenhum cartão cadastrado</div>
        : cartoes.map(c => {
          const { aPagar, aberta } = faturasDoCartaoAgora(c, dados, hoje)
          const comprometido = limiteComprometido(c, dados, hoje)
          const usoPct = c.limite ? Math.min(100, Math.round((comprometido / Number(c.limite)) * 100)) : null
          const disponivel = c.limite ? Math.round((Number(c.limite) - comprometido) * 100) / 100 : null // A8.25
          // Botão de pagar: na fatura a pagar; sem ela, na aberta só se vence este mês
          const alvoPagar = aPagar || (compDe(aberta.vencimento) === compHoje && !aberta.paga && aberta.total > 0 ? aberta : null)

          // Histórico: só meses com movimento, desde que o grupo começou a usar o app
          const piso = dados.inicioComp && dados.inicioComp > addMeses(aberta.comp, -9) ? dados.inicioComp : addMeses(aberta.comp, -9)
          const barras = compsEntre(piso, aberta.comp).map(cp => faturaDoCartao(c, cp, dados, hoje)).filter(f => f.total > 0 || f.comp === aberta.comp)

          return (
            <SwipeRow key={c.id} style={{ marginBottom: 10 }} onEdit={() => editar(c)} onDelete={() => excluir(c.id)}>
            <div className="card" style={{ margin: 0, borderLeft: c.cor ? `4px solid ${c.cor}` : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20, width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.cor ? c.cor + '22' : 'var(--bg3)', flexShrink: 0 }}>{bandeiras[c.bandeira] || '💳'}</span>
                <div>
                  <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 16 }}>{c.nome}</p>
                  <p style={{ fontSize: 12, color: 'var(--text2)' }}>{c.bandeira} · fecha dia {c.dia_fechamento} · vence dia {c.dia_vencimento}</p>
                </div>
              </div>

              {aPagar && <BlocoFatura card={c} f={aPagar} rotulo={aPagar.status === 'atrasada' ? 'Vencida' : 'A pagar'} destaque />}
              <BlocoFatura card={c} f={aberta} rotulo="Aberta" destaque={!aPagar} />

              {c.limite ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{disponivel < 0 ? tc.limiteEstourado : tc.limiteDisponivel}</span>
                    <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: disponivel < 0 ? 'var(--red-text)' : 'var(--text)' }}>{fmt(Math.abs(disponivel))}</span>
                  </div>
                  <div style={{ background: 'var(--border2)', borderRadius: 4, height: 5, overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ width: `${usoPct}%`, height: '100%', background: usoPct >= 90 ? 'var(--red)' : usoPct >= 70 ? 'var(--amber)' : 'var(--accent)', borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {tc.limiteUso(usoPct, fmt(c.limite), fmt(comprometido))}
                  </span>
                </div>
              ) : (
                <button type="button" onClick={() => editar(c)} style={{ marginTop: 10, fontSize: 12, fontWeight: 500, color: 'var(--accent-text)' }}>{tc.informarLimite}</button>
              )}

              {alvoPagar && (
                <button onClick={() => pagarFatura(c, alvoPagar)}
                  style={{ width: '100%', marginTop: 12, padding: '9px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', background: 'transparent', color: 'var(--accent-text)', fontSize: 13, fontWeight: 600 }}>
                  Marcar como paga a fatura que vence {ddmm(alvoPagar.vencimento)}
                </button>
              )}

              {barras.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Histórico de faturas · toque pra abrir</p>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 34 }}>
                    {barras.map(h => (
                      <button key={h.comp} onClick={() => setDetalhe({ cardId: c.id, comp: h.comp })} title={`vence ${ddmm(h.vencimento)} · ${fmt(h.total)} · ${ROTULO_STATUS[h.status]}`}
                        style={{ flex: 1, height: h.status === 'paga' ? 30 : h.status === 'aberta' ? 18 : 26, background: COR_STATUS[h.status], borderRadius: 3, opacity: h.status === 'aberta' ? 0.55 : 0.9 }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                    {barras.map(h => <span key={h.comp} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text3)' }}>{nomeMesCurto(h.comp)}</span>)}
                  </div>
                  <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                    {['paga', 'fechada', 'atrasada', 'aberta'].map(s => (
                      <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: COR_STATUS[s], opacity: s === 'aberta' ? 0.55 : 1 }} />{ROTULO_STATUS[s]}
                      </span>
                    ))}
                  </p>
                </div>
              )}
            </div>
            </SwipeRow>
          )
        })}

      {/* Modal: composição de UMA fatura (com navegação entre meses) */}
      {detalhe && dados && (() => {
        const card = cartoes.find(c => c.id === detalhe.cardId)
        if (!card) return null
        const f = faturaDoCartao(card, detalhe.comp, dados, hoje)
        const irMes = delta => setDetalhe({ cardId: card.id, comp: addMeses(f.comp, delta) })
        return (
          <div className="modal-overlay" onClick={() => setDetalhe(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '82vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h2 style={{ fontSize: 18 }}>{bandeiras[card.bandeira] || '💳'} {card.nome}</h2>
                <button onClick={() => setDetalhe(null)}><X size={20} color="var(--text2)" /></button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                <button onClick={() => irMes(-1)} aria-label="Fatura anterior"><ChevronLeft size={20} color="var(--text2)" /></button>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Syne' }}>Fatura que vence {fmtData(f.vencimento, 'dd/MM/yyyy')}</p>
                  <p style={{ fontSize: 11, color: COR_STATUS[f.status] }}>fecha {ddmm(f.fechamento)} · {ROTULO_STATUS[f.status]}</p>
                </div>
                <button onClick={() => irMes(1)} aria-label="Próxima fatura"><ChevronRight size={20} color="var(--text2)" /></button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Total da fatura</span>
                <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Syne' }}>{fmt(f.total)}</span>
              </div>
              {f.totalTerceiros > 0 && <p style={{ fontSize: 11.5, color: 'var(--amber-text)', marginBottom: 8 }}>{fmt(f.totalTerceiros)} desta fatura é de outras pessoas (está em A Receber)</p>}

              {f.itens.length > 0 && <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 2px' }}>{tc.dicaTocarItem}</p>}
              {f.itens.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--text3)', padding: '10px 0' }}>Nada lançado nesta fatura.</p>
              ) : f.itens.map((it, i) => (
                <div key={`${it.tipo}-${it.id}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <button type="button" onClick={() => abrirItemFatura(it)} title={tc.tocarEditar} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, textAlign: 'left', padding: 0, color: 'var(--text)' }}>
                    <span style={{ fontSize: 16 }}>{it.tipo === 'parcela' ? '💳' : it.tipo === 'assinatura' ? '📺' : emojiDe(it.categoria)}</span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {it.descricao || 'Sem descrição'}
                        {it.tipo === 'parcela' && <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg3)', color: 'var(--blue-text)', padding: '1px 6px', borderRadius: 10 }}>{it.numero}/{it.total}x</span>}
                        {it.tipo === 'assinatura' && <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--bg3)', color: 'var(--purple-text)', padding: '1px 6px', borderRadius: 10 }}>assinatura</span>}
                        {it.pessoaId && <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--amber-dim)', color: 'var(--amber-text)', padding: '1px 6px', borderRadius: 10 }}>de {it.pessoaNome || 'outra pessoa'}</span>}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text3)' }}>{ddmm(it.data)}{it.ajuste ? ` · movida ${it.ajuste > 0 ? '+' : ''}${it.ajuste} fatura` : ''}</p>
                    </div>
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: it.pessoaId ? 'var(--text3)' : 'var(--red-text)' }}>{fmt(it.valor)}</span>
                    {(it.tipo === 'parcela' || it.tipo === 'gasto') && (
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button onClick={() => it.tipo === 'parcela' ? moverParcela(it.id, -1) : moverGasto(it.id, it.ajuste, -1)} title="Jogar pra fatura anterior"
                          style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg3)' }}>
                          <ArrowLeft size={13} color="var(--text2)" />
                        </button>
                        <button onClick={() => it.tipo === 'parcela' ? moverParcela(it.id, 1) : moverGasto(it.id, it.ajuste, 1)} title="Jogar pra próxima fatura"
                          style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg3)' }}>
                          <ArrowRight size={13} color="var(--text2)" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div style={{ marginTop: 16 }}>
                {f.paga ? (
                  <button onClick={() => desfazerPagamento(card, f.comp)}
                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Undo2 size={15} /> Desfazer pagamento desta fatura
                  </button>
                ) : (
                  <button className="btn-primary" style={{ width: '100%' }} onClick={() => pagarFatura(card, f)} disabled={f.total <= 0}>
                    Marcar esta fatura como paga
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {modal && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>{editando ? 'Editar cartão' : 'Novo cartão'}</h2>
            <div className="form-group"><label>Nome do cartão</label><input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Nubank, Inter..." /></div>
            <div className="form-group">
              <label>Bandeira</label>
              <select value={form.bandeira} onChange={e => setForm(p => ({ ...p, bandeira: e.target.value }))}>
                {Object.keys(bandeiras).map(b => <option key={b} value={b}>{bandeiras[b]} {b}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Cor do cartão</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {CORES.map(cor => (
                  <button key={cor} type="button" title="Cor do cartão"
                    onClick={() => setForm(p => ({ ...p, cor: p.cor === cor ? '' : cor }))}
                    style={{
                      width: 30, height: 30, borderRadius: '50%', background: cor, flexShrink: 0,
                      border: form.cor === cor ? '3px solid var(--text)' : '2px solid var(--border)',
                      boxShadow: form.cor === cor ? '0 0 0 2px var(--bg2)' : 'none',
                    }} />
                ))}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Dia de fechamento</label><input type="number" inputMode="numeric" pattern="[0-9]*" min="1" max="31" value={form.dia_fechamento} onChange={e => setForm(p => ({ ...p, dia_fechamento: e.target.value }))} placeholder="Ex: 20" /></div>
              <div className="form-group"><label>Dia de vencimento</label><input type="number" inputMode="numeric" pattern="[0-9]*" min="1" max="31" value={form.dia_vencimento} onChange={e => setForm(p => ({ ...p, dia_vencimento: e.target.value }))} placeholder="Ex: 27" /></div>
            </div>
            <div className="form-group">
              <label>Compra feita no dia do fechamento vai para</label>
              <select value={form.compra_no_fechamento} onChange={e => setForm(p => ({ ...p, compra_no_fechamento: e.target.value }))}>
                <option value="proxima">a próxima fatura (o normal dos bancos)</option>
                <option value="atual">a fatura que está fechando</option>
              </select>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Limite (opcional)</label><input type="number" inputMode="decimal" value={form.limite} onChange={e => setForm(p => ({ ...p, limite: e.target.value }))} placeholder="0,00" /></div>
              <div className="form-group"><label>Alertar X dias antes</label><input type="number" inputMode="numeric" pattern="[0-9]*" min="1" max="15" value={form.alerta_dias} onChange={e => setForm(p => ({ ...p, alerta_dias: e.target.value }))} /></div>
            </div>
            {!editando && (() => {
              // Valor inicial (A2.7): a fatura fechada que ainda vai ser paga + o que já está na aberta
              const ini = faturasIniciais(form, hoje)
              const dica = { fontSize: 11, color: 'var(--text3)', marginTop: 4, marginBottom: 14, display: 'block', lineHeight: 1.4 }
              return (
                <div style={{ marginBottom: 4 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>{tc.inicialTitulo}</p>
                  {!ini ? <span style={dica}>{tc.inicialPreencha}</span> : (
                    <>
                      {ini.fechada && (
                        <div className="form-group">
                          <label>{tc.faturaFechada(ddmm(ini.fechada.vencimento))}</label>
                          <input type="number" inputMode="decimal" value={form.fatura_fechada} onChange={e => setForm(p => ({ ...p, fatura_fechada: e.target.value }))} placeholder="0,00" />
                        </div>
                      )}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>{tc.faturaAberta(ddmm(ini.aberta.fechamento))}</label>
                        <input type="number" inputMode="decimal" value={form.fatura_inicial} onChange={e => setForm(p => ({ ...p, fatura_inicial: e.target.value }))} placeholder="0,00" />
                      </div>
                      <span style={dica}>{tc.inicialDica}</span>
                    </>
                  )}
                </div>
              )
            })()}
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
