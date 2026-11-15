import { useState, useEffect, useCallback } from 'react'
import {
  CreditCard, Users, Clock, AlertTriangle, Gift, Rocket, Sparkles, Ticket, Webhook,
  Pause, Play, Check, Loader, X, Mail, Send, Shield, UserPlus, Trash2, Hammer,
  Wallet, Package, TrendingUp, TrendingDown, Plus, Pencil, ExternalLink, Bell,
  Inbox, Archive, CornerUpLeft, Activity, CheckCircle2, XCircle, Database, Timer, Ban, Zap,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useMascote, atualizarConfigMascote } from '../lib/mascote'

export const reais = (c) => ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const dolares = (c) => ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })

// Cotação USD→BRL do dia (AwesomeAPI, pública e sem chave). Fallback conservador
// se a rede falhar — é só pra converter os custos em dólar na tela, não é cobrança.
const COTACAO_FALLBACK = 5.4
function useCotacaoUsd() {
  const [cotacao, setCotacao] = useState(null)
  useEffect(() => {
    let vivo = true
    fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
      .then(r => r.json())
      .then(d => { if (vivo) setCotacao({ valor: Number(d?.USDBRL?.bid) || COTACAO_FALLBACK, real: true }) })
      .catch(() => { if (vivo) setCotacao({ valor: COTACAO_FALLBACK, real: false }) })
    return () => { vivo = false }
  }, [])
  return cotacao
}
export const dataCurta = (s) => s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
export const dataHora = (s) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const STATUS = {
  trial: ['Trial', 'tag-blue'], active: ['Ativo', 'tag-green'], past_due: ['Inadimplente', 'tag-red'],
  canceled: ['Cancelado', 'tag-red'], expired: ['Expirado', 'tag-amber'],
}

function Mini({ label, valor, sub }) {
  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 20, fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>{valor}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</p>}
    </div>
  )
}

/* ============================ VISÃO GERAL ============================ */
// Mini gráfico de barras (sem dependência): recebe [{dia, n}].
function BarMini({ dados }) {
  const max = Math.max(1, ...dados.map(d => Number(d.n) || 0))
  const total = dados.reduce((a, d) => a + (Number(d.n) || 0), 0)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90, marginTop: 4 }}>
        {dados.map((d, i) => {
          const n = Number(d.n) || 0
          const h = Math.round((n / max) * 100)
          return (
            <div key={i} title={`${dataCurta(d.dia)}: ${n}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ height: `${Math.max(h, n > 0 ? 6 : 2)}%`, background: n > 0 ? 'var(--accent)' : 'var(--border)', borderRadius: 3, minHeight: 2, opacity: n > 0 ? 1 : .6 }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text3)', marginTop: 6 }}>
        <span>{dataCurta(dados[0]?.dia)}</span>
        <span>{total} no período</span>
        <span>{dataCurta(dados[dados.length - 1]?.dia)}</span>
      </div>
    </div>
  )
}

export function VisaoGeral({ metr, consumo, recarregar, ir }) {
  const { toast } = useToast()
  const cfgMascote = useMascote()
  const [at, setAt] = useState(null)
  const [serie, setSerie] = useState(null)
  useEffect(() => {
    supabase.rpc('admin_atencao').then(({ data }) => setAt(data || null))
    supabase.rpc('admin_series', { p_dias: 14 }).then(({ data }) => setSerie(data || null))
  }, [])

  // Pendências que viram linhas acionáveis no topo.
  const pend = at ? [
    at.trials_vencendo?.length > 0 && { k: 'tv', txt: `${at.trials_vencendo.length} trial(s) vencendo em 3 dias`, aba: 'grupos', cor: 'var(--amber)' },
    at.inadimplentes?.length > 0 && { k: 'in', txt: `${at.inadimplentes.length} assinatura(s) inadimplente(s)`, aba: 'grupos', cor: 'var(--red)' },
    at.suporte_novos > 0 && { k: 'su', txt: `${at.suporte_novos} e-mail(s) de suporte sem ler`, aba: 'suporte', cor: 'var(--blue)' },
    at.servicos_saldo_baixo?.length > 0 && { k: 'sv', txt: `${at.servicos_saldo_baixo.length} serviço(s) com saldo baixo`, aba: 'servicos', cor: 'var(--amber)' },
    at.ia_falhas_24h > 0 && { k: 'ia', txt: `${at.ia_falhas_24h} falha(s) de IA nas últimas 24h`, aba: 'custos', cor: 'var(--red)' },
  ].filter(Boolean) : []

  const cards = metr ? [
    { label: 'MRR', valor: reais(metr.mrr_centavos), icon: CreditCard, cor: 'var(--accent)' },
    { label: 'Assinantes ativos', valor: metr.assinantes_ativos, icon: Users, cor: 'var(--accent)' },
    { label: 'Em trial', valor: metr.em_trial, icon: Clock, cor: 'var(--blue)' },
    { label: 'Trials vencendo (7d)', valor: metr.trials_vencendo_7d, icon: AlertTriangle, cor: 'var(--amber)' },
    { label: 'Inadimplentes', valor: metr.past_due, icon: AlertTriangle, cor: 'var(--red)' },
    { label: 'Cortesias', valor: metr.cortesias, icon: Gift, cor: 'var(--purple)' },
    { label: 'No lançamento', valor: metr.em_lancamento, icon: Rocket, cor: 'var(--accent)' },
    { label: 'Grupos / usuários', valor: `${metr.total_grupos} / ${metr.total_usuarios}`, icon: Users, cor: 'var(--text2)' },
  ] : []

  async function togglePausaWhatsapp() {
    const { error } = await supabase.rpc('admin_set_whatsapp', { p_pausado: !consumo.whatsapp_pausado, p_teto_centavos: consumo.whatsapp_teto_centavos })
    if (error) return toast('Falhou.', 'erro')
    toast(consumo.whatsapp_pausado ? 'WhatsApp retomado' : 'WhatsApp pausado', 'ok'); recarregar()
  }
  async function mudarMascote(k) {
    const novo = { mascote: cfgMascote.mascote, figurinhas: cfgMascote.figurinhas, [k]: !cfgMascote[k] }
    const { error } = await supabase.rpc('admin_set_mascote', { p_mascote: novo.mascote, p_figurinhas: novo.figurinhas })
    if (error) return toast('Falhou.', 'erro')
    atualizarConfigMascote(novo); toast(novo[k] ? 'Ligado' : 'Desligado', 'ok')
  }

  return (
    <>
      {at && (
        <section className="adm-sec" style={{ borderColor: pend.length ? 'var(--amber)' : undefined }}>
          <h2><Bell size={16} color={pend.length ? 'var(--amber)' : 'var(--accent)'} /> Precisa de atenção</h2>
          {pend.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontSize: 14, padding: '4px 0' }}>
              <CheckCircle2 size={16} /> Tudo em dia — nada pendente agora.
            </div>
          ) : pend.map((p, i) => (
            <button key={p.k} onClick={() => ir && ir(p.aba)} style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left', padding: '11px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: p.cor, flexShrink: 0 }} />{p.txt}
              </span>
              <span style={{ fontSize: 12, color: 'var(--accent)', whiteSpace: 'nowrap' }}>ver →</span>
            </button>
          ))}
        </section>
      )}

      <div className="adm-cards">
        {cards.map(c => (
          <div key={c.label} className="adm-card">
            <div className="k"><c.icon size={14} color={c.cor} /> {c.label}</div>
            <div className="v">{c.valor}</div>
          </div>
        ))}
      </div>

      {serie?.cadastros?.length > 0 && (
        <section className="adm-sec">
          <h2><TrendingUp size={16} color="var(--accent)" /> Cadastros <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>· últimos 14 dias</span></h2>
          <BarMini dados={serie.cadastros} />
        </section>
      )}

      {consumo && (
        <section className="adm-sec">
          <h2><Sparkles size={16} color="var(--accent)" /> Uso de IA / WhatsApp (mês)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 14, marginBottom: 16 }}>
            <Mini label="Interações" valor={consumo.usos_mes} />
            <Mini label={`Cobráveis (>${consumo.gratis_mes})`} valor={consumo.billable} />
            <Mini label="Custo estimado" valor={reais(consumo.custo_centavos)} />
            <Mini label="Acerto da voz" valor={consumo.voz?.acerto_pct != null ? `${consumo.voz.acerto_pct}%` : '—'} sub={consumo.voz?.total ? `${consumo.voz.total} lanç.` : 'sem dados'} />
          </div>
          {consumo.top_consumidores?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Top consumidores</p>
              {consumo.top_consumidores.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{t.nome}</span><strong>{t.usos}</strong>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600 }}>WhatsApp {consumo.whatsapp_pausado ? 'pausado' : 'ativo'}</p>
              <p style={{ fontSize: 12, color: 'var(--text2)' }}>Teto mensal: {reais(consumo.whatsapp_teto_centavos)}</p>
            </div>
            <button onClick={togglePausaWhatsapp} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, color: consumo.whatsapp_pausado ? 'var(--accent)' : 'var(--red)' }}>
              {consumo.whatsapp_pausado ? <><Play size={15} /> Retomar</> : <><Pause size={15} /> Pausar</>}
            </button>
          </div>
        </section>
      )}

      <section className="adm-sec">
        <h2><Sparkles size={16} color="var(--amber)" /> Mascote (Joca)</h2>
        {[['mascote', 'Mascote no app'], ['figurinhas', 'Figurinhas']].map(([k, rotulo]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 8 }}>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{rotulo}</p>
            <button role="switch" aria-checked={cfgMascote[k]} aria-label={rotulo} onClick={() => mudarMascote(k)}
              style={{ width: 46, height: 26, borderRadius: 13, background: cfgMascote[k] ? 'var(--accent)' : 'var(--text3)', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
              <span style={{ position: 'absolute', top: 3, left: cfgMascote[k] ? 23 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left .2s' }} />
            </button>
          </div>
        ))}
      </section>
    </>
  )
}

/* ============================ CLIENTES (GRUPOS) ============================ */
export function Grupos() {
  const { toast } = useToast()
  const [grupos, setGrupos] = useState(null)
  const [busca, setBusca] = useState('')
  const [acao, setAcao] = useState(null)
  const [emailGrupo, setEmailGrupo] = useState(null)
  const [ficha, setFicha] = useState(null)

  const [filtroS, setFiltroS] = useState(null)

  const carregar = useCallback((q = '') => {
    supabase.rpc('admin_grupos', { p_busca: q || null }).then(({ data, error }) => {
      if (error) { toast('Falhou ao carregar grupos.', 'erro'); setGrupos([]) } else setGrupos(data || [])
    })
  }, [toast])
  useEffect(() => { carregar() }, [carregar])

  // Contagem por status (+ cortesia e sem plano) para os chips.
  const conta = (grupos || []).reduce((a, g) => {
    const k = g.is_cortesia ? 'cortesia' : (g.status || 'sem')
    a[k] = (a[k] || 0) + 1; return a
  }, {})
  const chips = [['Todos', null], ['Ativos', 'active'], ['Trial', 'trial'], ['Inadimplentes', 'past_due'], ['Cortesia', 'cortesia'], ['Sem plano', 'sem']]
  const visiveis = (grupos || []).filter(g => {
    if (!filtroS) return true
    if (filtroS === 'cortesia') return g.is_cortesia
    if (filtroS === 'sem') return !g.is_cortesia && !g.status
    return !g.is_cortesia && g.status === filtroS
  })

  function exportarCsv() {
    const linhas = [['Grupo', 'Membros', 'Status', 'Plano', 'Cortesia', 'Lançamento', 'Trial/Período']]
    visiveis.forEach(g => linhas.push([
      g.nome, g.membros, g.status || 'sem plano', g.ciclo || '', g.is_cortesia ? 'sim' : '', g.is_lancamento ? 'sim' : '',
      dataCurta(g.status === 'trial' ? g.trial_ends_at : g.current_period_end),
    ]))
    const csv = linhas.map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="adm-sec">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}><Users size={16} color="var(--blue)" /> Clientes (grupos)</h2>
        <div style={{ display: 'flex', gap: 8, flex: '1 1 180px', maxWidth: 360, justifyContent: 'flex-end' }}>
          <form onSubmit={e => { e.preventDefault(); carregar(busca) }} style={{ flex: '1 1 160px', maxWidth: 240 }}>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome…" />
          </form>
          <button className="btn-ghost" style={{ padding: '0 12px', fontSize: 12, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={exportarCsv} disabled={!visiveis.length}><ExternalLink size={14} /> CSV</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {chips.map(([rot, st]) => {
          const n = st === null ? (grupos || []).length : (st === 'sem' ? (conta.sem || 0) : (conta[st] || 0))
          return (
            <button key={rot} onClick={() => setFiltroS(st)} className={`tag ${filtroS === st ? 'tag-green' : ''}`}
              style={{ cursor: 'pointer', border: filtroS === st ? 'none' : '1px solid var(--border)', background: filtroS === st ? undefined : 'transparent', color: filtroS === st ? undefined : 'var(--text2)' }}>
              {rot} {n > 0 && <strong>· {n}</strong>}
            </button>
          )
        })}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>Só o status — nunca os lançamentos das famílias (LGPD).</p>
      <div className="adm-tbl-wrap">
        <table className="adm-tbl">
          <thead><tr><th>Grupo</th><th>Membros</th><th>Status</th><th>Plano</th><th>Trial/Período</th><th></th></tr></thead>
          <tbody>
            {grupos === null && <tr><td colSpan={6} className="adm-vazio">Carregando…</td></tr>}
            {visiveis.map(g => {
              const [rot, cls] = STATUS[g.status] || [g.status || 'sem plano', 'tag-amber']
              return (
                <tr key={g.id}>
                  <td>
                    <button onClick={() => setFicha(g)} style={{ color: 'var(--accent)', fontWeight: 600, textAlign: 'left' }}>{g.nome}</button>
                    {g.is_cortesia && <span className="tag tag-green" style={{ marginLeft: 6 }}>cortesia</span>}
                    {g.is_lancamento && <span className="tag tag-blue" style={{ marginLeft: 6 }}>lançamento</span>}
                  </td>
                  <td>{g.membros}</td>
                  <td><span className={`tag ${cls}`}>{rot}</span></td>
                  <td style={{ color: 'var(--text2)' }}>{g.ciclo || '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>{dataCurta(g.status === 'trial' ? g.trial_ends_at : g.current_period_end)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12, marginRight: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => setEmailGrupo(g)}><Mail size={14} /> e-mail</button>
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }} onClick={() => setAcao({ tipo: 'trial', grupo: g })}>+ trial</button>
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setAcao({ tipo: 'cortesia', grupo: g })}>{g.is_cortesia ? 'tirar cortesia' : 'cortesia'}</button>
                  </td>
                </tr>
              )
            })}
            {grupos && visiveis.length === 0 && <tr><td colSpan={6} className="adm-vazio">Nenhum grupo {filtroS ? 'neste filtro' : ''}.</td></tr>}
          </tbody>
        </table>
      </div>
      {acao && <ModalAcao acao={acao} onFechar={() => setAcao(null)} onFeito={() => { setAcao(null); carregar(busca) }} />}
      {emailGrupo && <ModalEmail grupo={emailGrupo} onFechar={() => setEmailGrupo(null)} />}
      {ficha && <ModalCliente grupo={ficha} onFechar={() => setFicha(null)} />}
    </section>
  )
}

function ModalAcao({ acao, onFechar, onFeito }) {
  const { toast } = useToast()
  const [dias, setDias] = useState(7)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const ehTrial = acao.tipo === 'trial'
  const ativarCortesia = !acao.grupo.is_cortesia
  async function confirmar() {
    if (!motivo.trim()) return toast('Informe o motivo (fica no log).', 'erro')
    setSalvando(true)
    const { error } = ehTrial
      ? await supabase.rpc('admin_estender_trial', { p_grupo_id: acao.grupo.id, p_dias: Number(dias), p_motivo: motivo.trim() })
      : await supabase.rpc('admin_marcar_cortesia', { p_grupo_id: acao.grupo.id, p_ativar: ativarCortesia, p_motivo: motivo.trim() })
    setSalvando(false)
    if (error) return toast(error.message || 'Falhou.', 'erro')
    toast('Feito.', 'ok'); onFeito()
  }
  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 17 }}>{ehTrial ? 'Estender trial' : ativarCortesia ? 'Marcar cortesia' : 'Tirar cortesia'}</h2>
          <button onClick={onFechar}><X size={20} color="var(--text2)" /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Grupo: <strong>{acao.grupo.nome}</strong></p>
        {ehTrial && <div className="form-group"><label>Dias a adicionar</label><input type="number" inputMode="decimal" min="1" max="365" value={dias} onChange={e => setDias(e.target.value)} /></div>}
        <div className="form-group"><label>Motivo (auditoria)</label><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex: parceria com a igreja" autoFocus /></div>
        <button className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={confirmar} disabled={salvando}>
          {salvando ? <><Loader size={18} className="spin" /> Salvando…</> : <><Check size={18} /> Confirmar</>}
        </button>
      </div>
    </div>
  )
}

function ModalEmail({ grupo, onFechar }) {
  const { toast } = useToast()
  const [membros, setMembros] = useState(null)
  const [enviando, setEnviando] = useState(null)
  useEffect(() => {
    supabase.rpc('admin_membros', { p_grupo_id: grupo.id }).then(({ data, error }) => {
      if (error) { toast('Não consegui carregar os membros.', 'erro'); setMembros([]) } else setMembros(data || [])
    })
  }, [grupo.id, toast])
  async function reenviar(m, tipo) {
    setEnviando(`${m.id}:${tipo}`)
    const { data, error } = await supabase.functions.invoke('admin-reenviar-email', { body: { user_id: m.id, tipo } })
    setEnviando(null)
    if (error || data?.erro) return toast(data?.erro || 'Não consegui enviar.', 'erro')
    toast(tipo === 'recuperar' ? 'E-mail de redefinição enviado.' : 'E-mail de acesso enviado.', 'ok')
  }
  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ fontSize: 17 }}>Reenviar e-mail</h2>
          <button onClick={onFechar} aria-label="Fechar"><X size={20} color="var(--text2)" /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>Grupo: <strong>{grupo.nome}</strong></p>
        {membros === null ? <div className="adm-vazio">Carregando membros…</div>
          : membros.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>Nenhum membro.</p>
          : membros.map(m => (
            <div key={m.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{m.nome || 'Sem nome'} {m.is_dono && <span className="tag tag-blue" style={{ marginLeft: 4 }}>dono</span>}</p>
              <p style={{ fontSize: 12, color: 'var(--text2)', wordBreak: 'break-all' }}>{m.email}</p>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>{m.ultimo_acesso ? `Último acesso: ${dataCurta(m.ultimo_acesso)}` : 'Nunca entrou'}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => reenviar(m, 'acesso')} disabled={enviando === `${m.id}:acesso`}>
                  {enviando === `${m.id}:acesso` ? <Loader size={14} className="spin" /> : <Send size={14} />} Enviar acesso
                </button>
                <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => reenviar(m, 'recuperar')} disabled={enviando === `${m.id}:recuperar`}>
                  {enviando === `${m.id}:recuperar` ? <Loader size={14} className="spin" /> : <Mail size={14} />} Redefinir senha
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

/* ============================ ADMINISTRADORES ============================ */
export function Administradores() {
  const { toast } = useToast()
  const [admins, setAdmins] = useState(null)
  const [email, setEmail] = useState('')
  const [salvando, setSalvando] = useState(false)
  const carregar = useCallback(() => {
    supabase.rpc('admin_listar_admins').then(({ data, error }) => {
      if (error) { toast('Falhou ao listar.', 'erro'); setAdmins([]) } else setAdmins(data || [])
    })
  }, [toast])
  useEffect(() => { carregar() }, [carregar])

  async function conceder(e) {
    e.preventDefault()
    if (!email.trim()) return
    setSalvando(true)
    const { data, error } = await supabase.rpc('admin_conceder_admin', { p_email: email.trim() })
    setSalvando(false)
    if (error) {
      const m = error.message || ''
      return toast(m.includes('sem_conta') ? 'Esse e-mail ainda não tem conta no HopeFin.' : 'Não consegui conceder.', 'erro')
    }
    toast(`${data.nome || data.email} agora é admin.`, 'ok'); setEmail(''); carregar()
  }
  async function revogar(a) {
    const { error } = await supabase.rpc('admin_revogar_admin', { p_user_id: a.id })
    if (error) {
      const m = error.message || ''
      return toast(m.includes('ultimo_admin') ? 'Não dá pra tirar o último admin.' : m.includes('a_si_mesmo') ? 'Você não pode se remover.' : 'Falhou.', 'erro')
    }
    toast('Acesso de admin removido.', 'ok'); carregar()
  }

  return (
    <section className="adm-sec">
      <h2><Shield size={16} color="var(--accent)" /> Administradores</h2>
      <p style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14 }}>
        Só estes e-mails entram no painel. Conceda só a quem já tem conta no HopeFin.
      </p>
      <form onSubmit={conceder} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@da-pessoa.com" style={{ flex: '1 1 200px' }} />
        <button className="btn-primary" disabled={salvando} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          {salvando ? <Loader size={16} className="spin" /> : <UserPlus size={16} />} Dar acesso
        </button>
      </form>
      {admins === null ? <div className="adm-vazio">Carregando…</div> : admins.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{a.nome || 'Sem nome'} {a.sou_eu && <span className="tag tag-green" style={{ marginLeft: 4 }}>você</span>}</p>
            <p style={{ fontSize: 12, color: 'var(--text2)', wordBreak: 'break-all' }}>{a.email}</p>
            <p style={{ fontSize: 11, color: 'var(--text3)' }}>{a.ultimo_acesso ? `Último acesso: ${dataCurta(a.ultimo_acesso)}` : 'Nunca entrou'}</p>
          </div>
          {!a.sou_eu && (
            <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => revogar(a)}>
              <Trash2 size={14} /> Remover
            </button>
          )}
        </div>
      ))}
    </section>
  )
}

/* ============================ CUPONS ============================ */
export function Cupons({ cupons, recarregar }) {
  const { toast } = useToast()
  const [novo, setNovo] = useState(false)
  const [form, setForm] = useState({ codigo: '', max_usos: 50, resgate_ate: '', whatsapp_limite_mes: 100 })
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    if (!form.codigo.trim()) return toast('Informe o código.', 'erro')
    setSalvando(true)
    const { error } = await supabase.rpc('admin_salvar_cupom', { p_codigo: form.codigo, p_max_usos: Number(form.max_usos), p_resgate_ate: form.resgate_ate || null, p_whatsapp_limite_mes: Number(form.whatsapp_limite_mes), p_ativo: true })
    setSalvando(false)
    if (error) return toast(error.message || 'Falhou.', 'erro')
    toast('Cupom salvo.', 'ok'); setNovo(false); setForm({ codigo: '', max_usos: 50, resgate_ate: '', whatsapp_limite_mes: 100 }); recarregar()
  }
  async function toggle(c) {
    const { error } = await supabase.rpc('admin_salvar_cupom', { p_codigo: c.codigo, p_max_usos: c.max_usos, p_resgate_ate: c.resgate_ate, p_whatsapp_limite_mes: c.whatsapp_limite_mes, p_ativo: !c.ativo })
    if (error) return toast('Falhou.', 'erro'); recarregar()
  }
  return (
    <section className="adm-sec">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}><Ticket size={16} color="var(--amber)" /> Cupons</h2>
        <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setNovo(v => !v)}>{novo ? 'Cancelar' : '+ Novo'}</button>
      </div>
      {novo && (
        <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 14 }}>
          <div className="form-row">
            <div className="form-group"><label>Código</label><input value={form.codigo} onChange={e => setForm(p => ({ ...p, codigo: e.target.value.toUpperCase() }))} placeholder="IGREJA2026" /></div>
            <div className="form-group"><label>Máx. usos</label><input type="number" inputMode="decimal" min="1" value={form.max_usos} onChange={e => setForm(p => ({ ...p, max_usos: e.target.value }))} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Resgate até</label><input type="date" value={form.resgate_ate} onChange={e => setForm(p => ({ ...p, resgate_ate: e.target.value }))} /></div>
            <div className="form-group"><label>WhatsApp/mês</label><input type="number" inputMode="decimal" min="0" value={form.whatsapp_limite_mes} onChange={e => setForm(p => ({ ...p, whatsapp_limite_mes: e.target.value }))} /></div>
          </div>
          <button className="btn-primary" onClick={salvar} disabled={salvando} style={{ width: '100%' }}>{salvando ? 'Salvando…' : 'Salvar cupom'}</button>
        </div>
      )}
      {!cupons || cupons.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>Nenhum cupom.</p> : cupons.map(c => (
        <div key={c.codigo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 14 }}>
          <div><strong>{c.codigo}</strong><span style={{ color: 'var(--text2)', fontSize: 12, marginLeft: 8 }}>{c.usos}/{c.max_usos} usos · até {dataCurta(c.resgate_ate)}</span></div>
          <button className={`tag ${c.ativo ? 'tag-green' : 'tag-red'}`} onClick={() => toggle(c)} style={{ cursor: 'pointer' }}>{c.ativo ? 'ativo' : 'inativo'}</button>
        </div>
      ))}
    </section>
  )
}

/* ============================ WEBHOOKS ============================ */
export function Webhooks({ webhooks }) {
  return (
    <section className="adm-sec">
      <h2><Webhook size={16} color="var(--purple)" /> Webhooks do Asaas</h2>
      {!webhooks || webhooks.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>Nenhum webhook recebido ainda.</p> : webhooks.map(w => (
        <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 600 }}>{w.evento || '—'}</span>
          <span style={{ color: (w.status || '').startsWith('erro') ? 'var(--red)' : 'var(--text2)' }}>{w.status}</span>
          <span style={{ color: 'var(--text3)' }}>{dataHora(w.recebido_em)}</span>
        </div>
      ))}
    </section>
  )
}

/* ============================ CUSTOS (receita x saída) ============================ */
export function Custos() {
  const { toast } = useToast()
  const [d, setD] = useState(null)
  const [ia, setIa] = useState(null)   // custo real de IA por operação (admin_custos_ia)
  const cot = useCotacaoUsd()
  const carregar = useCallback(() => {
    supabase.rpc('admin_custos_mes').then(({ data, error }) => {
      if (error) { toast('Falhou ao carregar custos.', 'erro'); setD(false) } else setD(data)
    })
    supabase.rpc('admin_custos_ia', { p_dias: 30 }).then(({ data }) => setIa(data || false))
  }, [toast])
  useEffect(() => { carregar() }, [carregar])

  if (d === null || cot === null) return <section className="adm-sec"><div className="adm-vazio">Carregando…</div></section>
  if (d === false) return <section className="adm-sec"><div className="adm-vazio">Não consegui carregar.</div></section>

  // Custo de IA REAL do mês (medido por tokens), convertido US$ -> R$. Estimativa fica só como comparação.
  const iaRealUsdCent = d.ia_custo_real_usd_centavos || 0
  const iaRealBrl = Math.round(iaRealUsdCent * cot.valor)                        // US$¢ × R$/US$ = R$¢
  const temReal = (d.ia_chamadas_mes || 0) > 0
  const iaUsadoBrl = temReal ? iaRealBrl : (d.ia_custo_centavos || 0)            // usa o real quando já há chamadas
  const fixosUsdEmBrl = Math.round((d.fixos_usd_centavos || 0) * cot.valor)      // US$¢ × R$/US$ = R$¢
  const saidaTotal = iaUsadoBrl + (d.fixos_brl_centavos || 0) + fixosUsdEmBrl
  const resultado = (d.mrr_centavos || 0) - saidaTotal
  const positivo = resultado >= 0

  return (
    <>
      <div className="adm-cards">
        <div className="adm-card">
          <div className="k"><TrendingUp size={14} color="var(--accent)" /> Receita (MRR)</div>
          <div className="v">{reais(d.mrr_centavos)}</div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{d.assinantes_ativos} assinante(s)</p>
        </div>
        <div className="adm-card">
          <div className="k"><TrendingDown size={14} color="var(--red)" /> Saída no mês</div>
          <div className="v">{reais(saidaTotal)}</div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>IA + ferramentas</p>
        </div>
        <div className="adm-card" style={{ borderColor: positivo ? 'var(--accent)' : 'var(--red)' }}>
          <div className="k"><Wallet size={14} color={positivo ? 'var(--accent)' : 'var(--red)'} /> Resultado</div>
          <div className="v" style={{ color: positivo ? 'var(--accent)' : 'var(--red)' }}>{reais(resultado)}</div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{positivo ? 'no azul' : 'no vermelho'}</p>
        </div>
      </div>

      <section className="adm-sec">
        <h2><Wallet size={16} color="var(--accent)" /> De onde vem e pra onde vai (mês)</h2>
        <Linha rotulo="Receita recorrente (MRR)" valor={reais(d.mrr_centavos)} forte cor="var(--accent)" />
        <Linha
          rotulo={temReal
            ? `Custo de IA (real) · ${d.ia_chamadas_mes} chamada(s) · ${dolares(iaRealUsdCent)}`
            : `Custo de IA (estimativa) · ${d.ia_billable} cobráveis (acima de ${d.ia_gratis_mes})`}
          valor={'− ' + reais(iaUsadoBrl)} />
        <Linha rotulo="Ferramentas em R$" valor={'− ' + reais(d.fixos_brl_centavos)} />
        <Linha rotulo={`Ferramentas em US$ · ${dolares(d.fixos_usd_centavos)} × ${cot.valor.toFixed(2)}`} valor={'− ' + reais(fixosUsdEmBrl)} />
        <div style={{ borderTop: '2px solid var(--border2, var(--border))', marginTop: 6 }}>
          <Linha rotulo="Resultado" valor={reais(resultado)} forte cor={positivo ? 'var(--accent)' : 'var(--red)'} />
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
          {temReal
            ? <>O custo de IA agora é <strong>real</strong>: soma do gasto por chamada (tokens × tarifa do modelo). A estimativa antiga daria {reais(d.ia_custo_centavos)}.</>
            : <>Ainda sem chamadas de IA registradas este mês — mostrando a <strong>estimativa</strong>. Assim que o app interpretar lançamentos, vira custo real.</>}
          {' '}A cotação {cot.real ? `veio da AwesomeAPI (US$ 1 = ${reais(Math.round(cot.valor * 100))})` : `é um valor de reserva (rede indisponível): US$ 1 ≈ R$ ${cot.valor.toFixed(2)}`}.
        </p>
      </section>

      <section className="adm-sec">
        <h2><Activity size={16} color="var(--accent)" /> IA por operação <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>· últimos 30 dias</span></h2>
        {ia === null && <div className="adm-vazio">Carregando…</div>}
        {ia && ia.total_chamadas === 0 && (
          <div className="adm-vazio">Nenhuma chamada de IA registrada ainda. Cada interpretação de lançamento (voz/texto) passa a aparecer aqui com tokens, custo e tempo.</div>
        )}
        {ia && ia.total_chamadas > 0 && (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text2)', marginBottom: 6 }}>
              <span><strong style={{ color: 'var(--text)' }}>{ia.total_chamadas}</strong> chamadas</span>
              <span><strong style={{ color: 'var(--text)' }}>{dolares(Math.round((ia.total_custo_usd || 0) * 100))}</strong> no total (≈ {reais(Math.round((ia.total_custo_usd || 0) * 100 * cot.valor))})</span>
              {ia.total_falhas > 0 && <span style={{ color: 'var(--red)' }}>{ia.total_falhas} falha(s)</span>}
            </div>
            {ia.por_operacao.map((o, i) => (
              <div key={i} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 13.5 }}>{o.operacao}</strong>
                  <strong style={{ fontSize: 13.5, whiteSpace: 'nowrap' }}>{dolares(Math.round((o.custo_usd || 0) * 100))} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>≈ {reais(Math.round((o.custo_usd || 0) * 100 * cot.valor))}</span></strong>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <span>{o.chamadas} chamada(s)</span>
                  <span>~{o.tokens_entrada_med} tok entrada · ~{o.tokens_saida_med} saída</span>
                  {o.ms_med != null && <span>~{o.ms_med} ms</span>}
                  {o.falhas > 0 && <span style={{ color: 'var(--red)' }}>{o.falhas} falha(s)</span>}
                </div>
              </div>
            ))}
          </>
        )}
      </section>

      {(d.alertas_saldo?.length > 0 || d.renova_30d?.length > 0) && (
        <section className="adm-sec">
          <h2><Bell size={16} color="var(--amber)" /> Avisos</h2>
          {d.alertas_saldo?.map((a, i) => (
            <div key={'s' + i} style={{ fontSize: 13, padding: '6px 0', borderTop: i ? '1px solid var(--border)' : 'none', color: 'var(--red)' }}>
              <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
              Saldo baixo em <strong>{a.nome}</strong>: {a.moeda === 'USD' ? dolares(a.saldo_centavos) : reais(a.saldo_centavos)}
            </div>
          ))}
          {d.renova_30d?.map((r, i) => (
            <div key={'r' + i} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--border)', color: 'var(--text2)' }}>
              <Clock size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
              <strong>{r.nome}</strong> renova em {dataCurta(r.renova_em)} · {r.moeda === 'USD' ? dolares(r.custo_mensal_centavos) : reais(r.custo_mensal_centavos)}
            </div>
          ))}
        </section>
      )}
    </>
  )
}

function Linha({ rotulo, valor, forte, cor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: '1px solid var(--border)', fontSize: 14 }}>
      <span style={{ color: forte ? 'var(--text)' : 'var(--text2)', fontWeight: forte ? 600 : 400 }}>{rotulo}</span>
      <strong style={{ color: cor || 'var(--text)', whiteSpace: 'nowrap', fontWeight: forte ? 700 : 600 }}>{valor}</strong>
    </div>
  )
}

/* ============================ SERVIÇOS & CRÉDITOS ============================ */
export function Servicos() {
  const { toast } = useToast()
  const [lista, setLista] = useState(null)
  const [edit, setEdit] = useState(null)   // objeto do serviço, ou {} pra novo
  const cot = useCotacaoUsd()
  const carregar = useCallback(() => {
    supabase.rpc('admin_servicos').then(({ data, error }) => {
      if (error) { toast('Falhou ao carregar.', 'erro'); setLista([]) } else setLista(data || [])
    })
  }, [toast])
  useEffect(() => { carregar() }, [carregar])

  async function remover(s) {
    const { error } = await supabase.rpc('admin_remover_servico', { p_id: s.id })
    if (error) return toast('Falhou ao remover.', 'erro')
    toast('Serviço removido.', 'ok'); carregar()
  }

  return (
    <section className="adm-sec">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}><Package size={16} color="var(--purple)" /> Serviços & créditos</h2>
        <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setEdit({})}><Plus size={15} /> Novo</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14 }}>
        Cadastre o custo de cada ferramenta. Entra direto na conta de Custos. Valores em US$ são convertidos pela cotação do dia.
      </p>
      {lista === null ? <div className="adm-vazio">Carregando…</div> : lista.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>Nenhum serviço.</p> : lista.map(s => {
        const emBrl = s.moeda === 'USD' && cot ? Math.round(s.custo_mensal_centavos * cot.valor) : null
        const saldoBaixo = s.saldo_centavos != null && s.alerta_saldo_centavos != null && s.saldo_centavos <= s.alerta_saldo_centavos
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600 }}>
                {s.nome}
                {s.plano && <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 400, marginLeft: 8 }}>{s.plano}</span>}
                {s.link && <a href={s.link} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: 'var(--text3)' }}><ExternalLink size={12} style={{ verticalAlign: -1 }} /></a>}
              </p>
              <p style={{ fontSize: 12.5, color: 'var(--text2)' }}>
                {s.moeda === 'USD' ? dolares(s.custo_mensal_centavos) : reais(s.custo_mensal_centavos)}/mês
                {emBrl != null && <span style={{ color: 'var(--text3)' }}> (≈ {reais(emBrl)})</span>}
                {s.renova_em && <span style={{ color: 'var(--text3)' }}> · renova {dataCurta(s.renova_em)}</span>}
              </p>
              {s.saldo_centavos != null && (
                <p style={{ fontSize: 11.5, color: saldoBaixo ? 'var(--red)' : 'var(--text3)' }}>
                  Saldo: {s.moeda === 'USD' ? dolares(s.saldo_centavos) : reais(s.saldo_centavos)}{saldoBaixo && ' · baixo'}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button className="adm-icbtn" aria-label="Editar" onClick={() => setEdit(s)}><Pencil size={15} /></button>
              <button className="adm-icbtn" aria-label="Remover" style={{ color: 'var(--red)' }} onClick={() => remover(s)}><Trash2 size={15} /></button>
            </div>
          </div>
        )
      })}
      {edit && <ModalServico servico={edit} onFechar={() => setEdit(null)} onFeito={() => { setEdit(null); carregar() }} />}
    </section>
  )
}

function ModalServico({ servico, onFechar, onFeito }) {
  const { toast } = useToast()
  const ehNovo = !servico.id
  const emReais = (c) => c == null ? '' : (c / 100).toString()
  const [f, setF] = useState({
    nome: servico.nome || '', plano: servico.plano || '', moeda: servico.moeda || 'BRL',
    custo: emReais(servico.custo_mensal_centavos), renova_em: servico.renova_em || '',
    saldo: emReais(servico.saldo_centavos), alerta: emReais(servico.alerta_saldo_centavos),
    link: servico.link || '', obs: servico.obs || '',
  })
  const [salvando, setSalvando] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const paraCent = (s) => s === '' || s == null ? null : Math.round(Number(String(s).replace(',', '.')) * 100)

  async function salvar() {
    if (!f.nome.trim()) return toast('Informe o nome.', 'erro')
    setSalvando(true)
    const { error } = await supabase.rpc('admin_salvar_servico', {
      p_id: servico.id || null, p_nome: f.nome.trim(), p_plano: f.plano.trim() || null,
      p_custo_mensal_centavos: paraCent(f.custo) || 0, p_moeda: f.moeda,
      p_renova_em: f.renova_em || null, p_saldo_centavos: paraCent(f.saldo),
      p_alerta_saldo_centavos: paraCent(f.alerta), p_link: f.link.trim() || null,
      p_obs: f.obs.trim() || null, p_ordem: servico.ordem || 0,
    })
    setSalvando(false)
    if (error) return toast(error.message || 'Falhou.', 'erro')
    toast('Serviço salvo.', 'ok'); onFeito()
  }
  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 17 }}>{ehNovo ? 'Novo serviço' : 'Editar serviço'}</h2>
          <button onClick={onFechar} aria-label="Fechar"><X size={20} color="var(--text2)" /></button>
        </div>
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}><label>Nome</label><input value={f.nome} onChange={e => set('nome', e.target.value)} placeholder="Supabase" autoFocus /></div>
          <div className="form-group"><label>Plano</label><input value={f.plano} onChange={e => set('plano', e.target.value)} placeholder="Free" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Custo mensal</label><input inputMode="decimal" value={f.custo} onChange={e => set('custo', e.target.value)} placeholder="0,00" /></div>
          <div className="form-group"><label>Moeda</label>
            <select value={f.moeda} onChange={e => set('moeda', e.target.value)}><option value="BRL">R$ (BRL)</option><option value="USD">US$ (USD)</option></select>
          </div>
          <div className="form-group"><label>Renova em</label><input type="date" value={f.renova_em} onChange={e => set('renova_em', e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Saldo (opcional)</label><input inputMode="decimal" value={f.saldo} onChange={e => set('saldo', e.target.value)} placeholder="crédito pré-pago" /></div>
          <div className="form-group"><label>Avisar se saldo ≤</label><input inputMode="decimal" value={f.alerta} onChange={e => set('alerta', e.target.value)} placeholder="opcional" /></div>
        </div>
        <div className="form-group"><label>Link do painel (opcional)</label><input value={f.link} onChange={e => set('link', e.target.value)} placeholder="https://…" /></div>
        <button className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={salvar} disabled={salvando}>
          {salvando ? <><Loader size={18} className="spin" /> Salvando…</> : <><Check size={18} /> Salvar</>}
        </button>
      </div>
    </div>
  )
}

/* ============================ RECEITAS (métricas) ============================ */
export function Receitas() {
  const { toast } = useToast()
  const [d, setD] = useState(null)
  const [ativ, setAtiv] = useState(null)
  useEffect(() => {
    supabase.rpc('admin_receitas').then(({ data, error }) => {
      if (error) { toast('Falhou ao carregar.', 'erro'); setD(false) } else setD(data)
    })
    supabase.rpc('admin_ativacao').then(({ data }) => setAtiv(data || null))
  }, [toast])
  if (d === null) return <section className="adm-sec"><div className="adm-vazio">Carregando…</div></section>
  if (d === false) return <section className="adm-sec"><div className="adm-vazio">Não consegui carregar.</div></section>

  const cards = [
    { label: 'MRR', valor: reais(d.mrr_centavos), cor: 'var(--accent)' },
    { label: 'ARR (ano)', valor: reais(d.arr_centavos), cor: 'var(--accent)' },
    { label: 'Ticket médio (ARPA)', valor: reais(d.arpa_centavos), cor: 'var(--text2)' },
    { label: 'Assinantes', valor: d.assinantes_ativos, cor: 'var(--accent)' },
    { label: 'Trials ativos', valor: d.trials_ativos, cor: 'var(--blue)' },
    { label: 'Churn (30d)', valor: `${d.churn_pct}%`, cor: d.churn_pct > 0 ? 'var(--red)' : 'var(--text2)' },
    { label: 'LTV estimado', valor: d.ltv_centavos != null ? reais(d.ltv_centavos) : '—', cor: 'var(--purple)' },
    { label: 'Cortesias', valor: d.cortesias, cor: 'var(--purple)' },
  ]
  return (
    <>
      <div className="adm-cards">
        {cards.map(c => (
          <div key={c.label} className="adm-card">
            <div className="k">{c.label}</div>
            <div className="v" style={{ color: c.cor }}>{c.valor}</div>
          </div>
        ))}
      </div>
      <section className="adm-sec">
        <h2><TrendingUp size={16} color="var(--accent)" /> Funil dos últimos 30 dias</h2>
        <Linha rotulo="Novos trials" valor={d.novos_trials_30d} />
        <Linha rotulo="Converteram (1ª cobrança)" valor={d.convertidos_30d} cor="var(--accent)" />
        <Linha rotulo="Cancelaram" valor={d.cancelados_30d} cor={d.cancelados_30d > 0 ? 'var(--red)' : undefined} />
        <Linha rotulo="Cancelados no total" valor={d.cancelados_total} />
        <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
          LTV = ticket médio ÷ churn mensal (fica “—” enquanto não houver cancelamento pra calcular). Com a base pequena, os números oscilam muito — servem de termômetro, não de previsão fechada.
        </p>
      </section>

      {ativ && (() => {
        const etapas = [
          { rot: 'Cadastraram (grupos)', n: ativ.grupos_total },
          { rot: 'Entraram no app', n: ativ.grupos_com_acesso },
          { rot: 'Usaram a IA', n: ativ.grupos_com_uso },
          { rot: 'Viraram pagantes', n: ativ.grupos_pagantes },
        ]
        const base = Math.max(1, ativ.grupos_total)
        return (
          <section className="adm-sec">
            <h2><Users size={16} color="var(--blue)" /> Funil de ativação</h2>
            {etapas.map((e, i) => {
              const pct = Math.round((e.n / base) * 100)
              return (
                <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 5 }}>
                    <span style={{ color: 'var(--text2)' }}>{e.rot}</span>
                    <strong>{e.n} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· {pct}%</span></strong>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 4 }} />
                  </div>
                </div>
              )
            })}
            <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
              Retenção (30 dias): {ativ.retencao_pct != null ? <strong>{ativ.retencao_pct}%</strong> : '—'}
              {ativ.retencao_base > 0 && ` · ${ativ.retencao_ativos} de ${ativ.retencao_base} grupos criados há +30d voltaram no último mês.`}
            </p>
          </section>
        )
      })()}
    </>
  )
}

/* ============================ FICHA DO CLIENTE ============================ */
function ModalCliente({ grupo, onFechar }) {
  const { toast } = useToast()
  const [d, setD] = useState(null)
  const [ia, setIa] = useState(null)
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)
  const cot = useCotacaoUsd()

  const carregar = useCallback(() => {
    supabase.rpc('admin_cliente', { p_grupo_id: grupo.id }).then(({ data, error }) => {
      if (error) { toast('Não consegui carregar a ficha.', 'erro'); setD(false) } else setD(data)
    })
    supabase.rpc('admin_cliente_ia', { p_grupo_id: grupo.id }).then(({ data }) => setIa(data || null))
  }, [grupo.id, toast])
  useEffect(() => { carregar() }, [carregar])

  async function salvarNota() {
    if (!nota.trim()) return
    setSalvando(true)
    const { error } = await supabase.rpc('admin_salvar_nota', { p_grupo_id: grupo.id, p_texto: nota.trim() })
    setSalvando(false)
    if (error) return toast('Falhou ao salvar.', 'erro')
    setNota(''); carregar()
  }
  async function removerNota(id) {
    const { error } = await supabase.rpc('admin_remover_nota', { p_id: id })
    if (error) return toast('Falhou.', 'erro'); carregar()
  }

  const s = d && d.assinatura
  const [rotS, clsS] = s ? (STATUS[s.status] || [s.status, 'tag-amber']) : ['sem plano', 'tag-amber']
  const ACAO = { reenviar_email: 'Reenviou e-mail', estender_trial: 'Estendeu trial', marcar_cortesia: 'Cortesia', salvar_servico: 'Serviço', remover_servico: 'Serviço removido' }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18 }}>{grupo.nome}</h2>
          <button onClick={onFechar} aria-label="Fechar"><X size={20} color="var(--text2)" /></button>
        </div>
        {d === null ? <div className="adm-vazio">Carregando…</div> : d === false ? <div className="adm-vazio">Erro ao carregar.</div> : (
          <>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>Código {d.grupo.codigo} · criado em {dataCurta(d.grupo.criado_em)}</p>

            {/* Assinatura */}
            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span className={`tag ${clsS}`}>{rotS}</span>
                {s?.is_cortesia && <span className="tag tag-green">cortesia</span>}
                {s?.is_lancamento && <span className="tag tag-blue">lançamento</span>}
                {s?.cupom_codigo && <span className="tag tag-amber">{s.cupom_codigo}</span>}
              </div>
              {s ? (
                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
                  <div>Plano: <strong>{s.ciclo || '—'}</strong> · {reais(s.preco_centavos)} {s.metodo_pagamento ? `· ${s.metodo_pagamento}` : ''} {s.parcelas ? `· ${s.parcelas}x` : ''}</div>
                  {s.status === 'trial' && <div>Trial até {dataCurta(s.trial_ends_at)}</div>}
                  {s.current_period_end && <div>Período até {dataCurta(s.current_period_end)}</div>}
                  {s.primeira_cobranca_em && <div>1ª cobrança: {dataCurta(s.primeira_cobranca_em)}</div>}
                  {s.canceled_at && <div style={{ color: 'var(--red)' }}>Cancelado em {dataCurta(s.canceled_at)}</div>}
                </div>
              ) : <p style={{ fontSize: 13, color: 'var(--text3)' }}>Sem assinatura registrada.</p>}
            </div>

            {/* Uso */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12, marginBottom: 16 }}>
              <Mini label="Interações IA" valor={d.uso.total} sub={`${d.uso.mes} no mês`} />
              <Mini label="Lanç. por voz" valor={d.uso.voz_lanc} />
              <Mini label="Membros" valor={d.membros.length} />
            </div>

            {/* Custo de IA e resultado (real, por tokens) */}
            {ia && cot && (() => {
              const custoBrl30 = Math.round((ia.custo_usd_30d || 0) * 100 * cot.valor)       // US$ → R$¢
              const pagaMes = s && !s.is_cortesia && s.status === 'active'
                ? (s.ciclo === 'anual' ? Math.round((s.preco_centavos || 0) / 12) : (s.preco_centavos || 0))
                : 0
              const resultado = pagaMes - custoBrl30
              return (
                <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 16 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}><Activity size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Custo de IA e resultado</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
                    <Mini label="Chamadas IA" valor={ia.chamadas_total} sub={`${ia.chamadas_30d} em 30d`} />
                    <Mini label="Custo IA (30d)" valor={dolares(Math.round((ia.custo_usd_30d || 0) * 100))} sub={`≈ ${reais(custoBrl30)}`} />
                    {pagaMes > 0 && <Mini label="Resultado (mês)" valor={reais(resultado)} sub={resultado >= 0 ? 'no azul' : 'no vermelho'} />}
                  </div>
                  {ia.chamadas_total === 0 && <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>Ainda sem chamadas de IA deste cliente.</p>}
                </div>
              )
            })()}

            {/* Membros */}
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Membros</p>
            {d.membros.map(m => (
              <div key={m.id} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 600 }}>{m.nome || 'Sem nome'}</span> {m.is_dono && <span className="tag tag-blue" style={{ marginLeft: 4 }}>dono</span>}
                <div style={{ color: 'var(--text2)', wordBreak: 'break-all' }}>{m.email}{!m.email_confirmado && <span style={{ color: 'var(--amber)' }}> · e-mail não confirmado</span>}</div>
                <div style={{ color: 'var(--text3)', fontSize: 11.5 }}>{m.ultimo_acesso ? `Último acesso: ${dataCurta(m.ultimo_acesso)}` : 'Nunca entrou'}</div>
              </div>
            ))}

            {/* Linha do tempo */}
            {d.timeline.length > 0 && (
              <>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', margin: '16px 0 6px' }}>Linha do tempo (ações do admin)</p>
                {d.timeline.map((t, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: 'var(--text2)', padding: '5px 0', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600 }}>{ACAO[t.acao] || t.acao}</span>{t.motivo ? ` — ${t.motivo}` : ''}
                    <span style={{ color: 'var(--text3)', float: 'right' }}>{dataHora(t.criado_em)}</span>
                  </div>
                ))}
              </>
            )}

            {/* Notas do dono */}
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', margin: '16px 0 6px' }}>Notas internas</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Anotação sobre este cliente…" style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && salvarNota()} />
              <button className="btn-primary" style={{ padding: '0 14px' }} onClick={salvarNota} disabled={salvando}>{salvando ? <Loader size={16} className="spin" /> : 'Salvar'}</button>
            </div>
            {d.notas.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--text3)' }}>Nenhuma nota.</p> : d.notas.map(n => (
              <div key={n.id} style={{ fontSize: 13, padding: '8px 0', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div><p>{n.texto}</p><p style={{ fontSize: 11, color: 'var(--text3)' }}>{n.admin_nome || 'Admin'} · {dataHora(n.criado_em)}</p></div>
                <button className="adm-icbtn" style={{ color: 'var(--red)', flexShrink: 0 }} aria-label="Remover nota" onClick={() => removerNota(n.id)}><Trash2 size={14} /></button>
              </div>
            ))}

            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 16, lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              Os lançamentos da família (gastos/entradas) nunca aparecem aqui — LGPD. Exportar/excluir dados do titular (LGPD) é a próxima etapa.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/* ============================ SUPORTE (caixa de e-mails) ============================ */
const SUP_STATUS = { novo: ['Novo', 'tag-blue'], lido: ['Lido', 'tag-amber'], respondido: ['Respondido', 'tag-green'], arquivado: ['Arquivado', 'tag-red'], spam: ['Spam', 'tag-red'] }
// Código curto e estável do ticket, derivado do id (sem coluna nova no banco).
function codTicket(id) { return 'HF-' + String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase() }
// "3,5 h" / "1,2 dia(s)" a partir de horas (number), para o SLA.
function humaniza(horas) {
  if (horas == null || isNaN(horas)) return '—'
  if (horas < 1) return `${Math.round(horas * 60)} min`
  if (horas < 48) return `${(Math.round(horas * 10) / 10).toString().replace('.', ',')} h`
  return `${(Math.round(horas / 24 * 10) / 10).toString().replace('.', ',')} dias`
}

export function Suporte() {
  const { toast } = useToast()
  const [d, setD] = useState(null)
  const [filtro, setFiltro] = useState(null)
  const [aberto, setAberto] = useState(null)

  const carregar = useCallback(() => {
    supabase.rpc('admin_suporte_listar', { p_status: null }).then(({ data, error }) => {
      if (error) { toast('Falhou ao carregar.', 'erro'); setD(false) } else setD(data)
    })
  }, [toast])
  useEffect(() => { carregar() }, [carregar])

  if (d === null) return <section className="adm-sec"><div className="adm-vazio">Carregando…</div></section>
  if (d === false) return <section className="adm-sec"><div className="adm-vazio">Não consegui carregar.</div></section>

  const cont = d.contagem || {}
  const itens = filtro ? d.itens.filter(i => i.status === filtro) : d.itens
  const chips = [['Todos', null], ['Novos', 'novo'], ['Lidos', 'lido'], ['Respondidos', 'respondido'], ['Arquivados', 'arquivado'], ['Spam', 'spam']]
  const sla = d.sla || {}

  return (
    <section className="adm-sec">
      <h2><Inbox size={16} color="var(--accent)" /> Caixa de suporte</h2>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '2px 0 10px', fontSize: 12.5, color: 'var(--text2)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Timer size={14} color="var(--accent)" /> 1ª resposta em média: <strong style={{ color: 'var(--text)' }}>{humaniza(sla.horas_media_1a_resposta)}</strong></span>
        <span>Respondidos: <strong style={{ color: 'var(--text)' }}>{sla.respondidos || 0}</strong></span>
        <span>Esperando: <strong style={{ color: (sla.pendentes || 0) > 0 ? 'var(--amber)' : 'var(--text)' }}>{sla.pendentes || 0}</strong></span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 14px' }}>
        {chips.map(([rot, st]) => {
          const n = st ? (cont[st] || 0) : d.itens.length
          return (
            <button key={rot} onClick={() => setFiltro(st)}
              className={`tag ${filtro === st ? 'tag-green' : ''}`}
              style={{ cursor: 'pointer', border: filtro === st ? 'none' : '1px solid var(--border)', background: filtro === st ? undefined : 'transparent', color: filtro === st ? undefined : 'var(--text2)' }}>
              {rot} {n > 0 && <strong>· {n}</strong>}
            </button>
          )
        })}
      </div>
      {itens.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>Nenhum e-mail aqui.</p> : itens.map(m => {
        const [rot, cls] = SUP_STATUS[m.status] || [m.status, 'tag-amber']
        return (
          <button key={m.id} onClick={() => setAberto(m)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{m.de_nome || m.de_email} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', fontFamily: 'monospace' }}>{codTicket(m.id)}</span></span>
              <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{dataHora(m.recebido_em)}</span>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text)', marginTop: 2 }}>{m.assunto || '(sem assunto)'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(m.corpo || '').replace(/\n/g, ' ')}</div>
            <span className={`tag ${cls}`} style={{ marginTop: 6, display: 'inline-block' }}>{rot}</span>
          </button>
        )
      })}
      {aberto && <ModalSuporteMsg msg={aberto} onFechar={() => setAberto(null)} onMudou={() => { carregar() }} />}
    </section>
  )
}

function ModalSuporteMsg({ msg, onFechar, onMudou }) {
  const { toast } = useToast()
  const [resposta, setResposta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [prontas, setProntas] = useState([])

  // Abriu um "novo" → marca como lido (sem bloquear a tela).
  useEffect(() => {
    if (msg.status === 'novo') supabase.rpc('admin_suporte_marcar', { p_id: msg.id, p_status: 'lido' }).then(() => onMudou())
  }, [msg.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Respostas prontas (canned): carrega uma vez.
  useEffect(() => { supabase.rpc('admin_respostas_listar').then(({ data }) => setProntas(Array.isArray(data) ? data : [])) }, [])

  function inserirPronta(corpo) {
    setResposta(r => r.trim() ? r.replace(/\s*$/, '\n\n') + corpo : corpo)
  }
  // SLA deste ticket: tempo entre receber e a 1ª resposta.
  const slaItem = msg.respondido_em && msg.recebido_em
    ? humaniza((new Date(msg.respondido_em) - new Date(msg.recebido_em)) / 3.6e6) : null

  async function responder() {
    if (!resposta.trim()) return toast('Escreva a resposta.', 'erro')
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('admin-suporte-responder', { body: { id: msg.id, texto: resposta.trim() } })
    setEnviando(false)
    if (error || data?.erro) return toast(data?.erro || 'Não consegui enviar.', 'erro')
    toast('Resposta enviada.', 'ok'); onMudou(); onFechar()
  }
  async function marcar(status) {
    const { error } = await supabase.rpc('admin_suporte_marcar', { p_id: msg.id, p_status: status })
    if (error) return toast('Falhou.', 'erro')
    toast('Atualizado.', 'ok'); onMudou(); onFechar()
  }
  async function remover() {
    const { error } = await supabase.rpc('admin_suporte_remover', { p_id: msg.id })
    if (error) return toast('Falhou.', 'erro')
    toast('Removido.', 'ok'); onMudou(); onFechar()
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <h2 style={{ fontSize: 17 }}>{msg.assunto || '(sem assunto)'}</h2>
          <button onClick={onFechar} aria-label="Fechar"><X size={20} color="var(--text2)" /></button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 2 }}><span style={{ fontFamily: 'monospace', color: 'var(--text3)' }}>{codTicket(msg.id)}</span> · {msg.de_nome ? `${msg.de_nome} · ` : ''}<span style={{ wordBreak: 'break-all' }}>{msg.de_email}</span></p>
        <p style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 12 }}>{dataHora(msg.recebido_em)}{slaItem && <span style={{ color: 'var(--accent)' }}> · respondido em {slaItem}</span>}</p>
        <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 16, fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{msg.corpo || '(sem conteúdo)'}</div>

        {msg.resposta && (
          <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 4 }}>Sua resposta · {dataHora(msg.respondido_em)}</p>
            <div style={{ fontSize: 13.5, color: 'var(--text2)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{msg.resposta}</div>
          </div>
        )}

        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Responder (vai pelo e-mail avisos@, assinado HopeFin)</label>
        {prontas.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {prontas.map(p => (
              <button key={p.id} type="button" onClick={() => inserirPronta(p.corpo)} title={p.corpo}
                className="tag" style={{ cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Zap size={12} color="var(--accent)" /> {p.titulo}
              </button>
            ))}
          </div>
        )}
        <textarea value={resposta} onChange={e => setResposta(e.target.value)} rows={5} placeholder="Escreva a resposta ao cliente…" style={{ width: '100%', marginBottom: 12, resize: 'vertical' }} />
        <button className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }} onClick={responder} disabled={enviando}>
          {enviando ? <><Loader size={18} className="spin" /> Enviando…</> : <><CornerUpLeft size={18} /> Enviar resposta</>}
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => marcar('arquivado')}><Archive size={14} /> Arquivar</button>
          <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => marcar('novo')}>Marcar não lido</button>
          <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => marcar('spam')}><Ban size={14} /> Spam</button>
          <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }} onClick={remover}><Trash2 size={14} /> Remover</button>
        </div>
      </div>
    </div>
  )
}

/* ============================ SAÚDE DO SISTEMA ============================ */
const NIVEL = {
  ok: ['Tudo certo', 'var(--accent)', CheckCircle2],
  atencao: ['Atenção', 'var(--amber)', AlertTriangle],
  erro: ['Problema', 'var(--red)', XCircle],
}
function corCron(st) { return st === 'succeeded' ? 'var(--accent)' : st == null ? 'var(--amber)' : 'var(--red)' }

// Pings de uptime (do próprio navegador): no-cors resolve em sucesso e rejeita
// na falha de rede. Mede latência aproximada. Não substitui um monitor externo.
function UptimePings() {
  const alvos = [
    { nome: 'App', url: 'https://app.hopefin.com.br' },
    { nome: 'Site', url: 'https://hopefin.com.br' },
    { nome: 'Painel (prévia)', url: 'https://admin-preview.hopefin.com.br' },
  ]
  const [res, setRes] = useState({})
  const checar = useCallback(() => {
    setRes({})
    alvos.forEach(a => {
      const t0 = performance.now()
      fetch(a.url, { mode: 'no-cors', cache: 'no-store' })
        .then(() => setRes(r => ({ ...r, [a.nome]: { ok: true, ms: Math.round(performance.now() - t0) } })))
        .catch(() => setRes(r => ({ ...r, [a.nome]: { ok: false } })))
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { checar() }, [checar])
  return (
    <section className="adm-sec">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}><Activity size={16} color="var(--accent)" /> No ar agora</h2>
        <button className="adm-icbtn" onClick={checar} aria-label="Rechecar"><RefreshPing /></button>
      </div>
      <div style={{ marginTop: 10 }}>
        {alvos.map((a, i) => {
          const r = res[a.nome]
          const cor = r == null ? 'var(--amber)' : r.ok ? 'var(--accent)' : 'var(--red)'
          return (
            <div key={a.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: cor, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13.5 }}>{a.nome}</span>
              <span style={{ fontSize: 12.5, color: cor }}>{r == null ? 'checando…' : r.ok ? `no ar · ${r.ms} ms` : 'sem resposta'}</span>
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>Medido do seu navegador agora (aproximado). Um monitor externo 24/7 pode entrar depois.</p>
    </section>
  )
}
function RefreshPing() { return <Activity size={17} /> }

export function Saude() {
  const { toast } = useToast()
  const [d, setD] = useState(null)
  const carregar = useCallback(() => {
    setD(null)
    supabase.rpc('admin_saude').then(({ data, error }) => {
      if (error) { toast('Falhou ao checar.', 'erro'); setD(false) } else setD(data)
    })
  }, [toast])
  useEffect(() => { carregar() }, [carregar])

  if (d === null) return <section className="adm-sec"><div className="adm-vazio">Checando…</div></section>
  if (d === false) return <section className="adm-sec"><div className="adm-vazio">Não consegui checar.</div></section>

  const [rot, cor, Icone] = NIVEL[d.nivel] || NIVEL.atencao

  return (
    <>
      <section className="adm-sec" style={{ borderColor: cor }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icone size={30} color={cor} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 18, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: cor }}>{rot}</p>
            <p style={{ fontSize: 12, color: 'var(--text3)' }}>Checado agora · {dataHora(d.gerado_em)}</p>
          </div>
          <button className="adm-icbtn" onClick={carregar} aria-label="Rechecar"><Activity size={18} /></button>
        </div>
        {d.problemas?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {d.problemas.map((p, i) => (
              <div key={i} style={{ fontSize: 13, color: 'var(--text2)', padding: '5px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <AlertTriangle size={13} color={cor} style={{ verticalAlign: -2, marginRight: 6 }} />{p}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="adm-sec">
        <h2><Database size={16} color="var(--accent)" /> Checagens</h2>
        <Linha rotulo="Banco de dados" valor="OK" cor="var(--accent)" />
        <Linha rotulo="Trials vencidos ainda como trial" valor={d.trials_vencidos} cor={d.trials_vencidos > 0 ? 'var(--amber)' : 'var(--accent)'} />
        <Linha rotulo="Assinaturas inadimplentes" valor={d.past_due} cor={d.past_due > 0 ? 'var(--amber)' : 'var(--accent)'} />
        <Linha rotulo="Erros de webhook (24h)" valor={d.webhooks_erro_24h} cor={d.webhooks_erro_24h > 0 ? 'var(--red)' : 'var(--accent)'} />
      </section>

      <UptimePings />

      <section className="adm-sec">
        <h2><Timer size={16} color="var(--purple)" /> Tarefas agendadas (crons)</h2>
        {(!d.crons || d.crons.length === 0) ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>Nenhum cron.</p> : d.crons.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, background: corCron(c.ultimo_status), flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13.5, fontWeight: 600 }}>{c.jobname}</p>
              <p style={{ fontSize: 11.5, color: 'var(--text3)' }}>{c.schedule}{!c.active && ' · inativo'}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 12.5, color: corCron(c.ultimo_status) }}>{c.ultimo_status || 'nunca rodou'}</p>
              {c.ultimo_em && <p style={{ fontSize: 11, color: 'var(--text3)' }}>{dataHora(c.ultimo_em)}</p>}
            </div>
          </div>
        ))}
        <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
          Checagem sob demanda. O alerta automático por e-mail (de hora em hora, só quando surge um problema novo) é a próxima sub-etapa.
        </p>
      </section>
    </>
  )
}

/* ============================ AUDITORIA ============================ */
export function Auditoria() {
  const { toast } = useToast()
  const [d, setD] = useState(null)
  const [cat, setCat] = useState(null)
  const [busca, setBusca] = useState('')

  const carregar = useCallback((categoria = null, q = '') => {
    supabase.rpc('admin_auditoria', { p_categoria: categoria, p_busca: q || null, p_limite: 200 })
      .then(({ data, error }) => { if (error) { toast('Falhou ao carregar.', 'erro'); setD(false) } else setD(data) })
  }, [toast])
  useEffect(() => { carregar(cat, busca) }, [cat]) // eslint-disable-line react-hooks/exhaustive-deps

  function exportarCsv() {
    if (!d?.itens?.length) return
    const linhas = [['Quando', 'Categoria', 'Ação', 'Quem', 'Grupo', 'Motivo']]
    d.itens.forEach(i => linhas.push([dataHora(i.criado_em), i.categoria, i.acao, i.admin_email, i.grupo_nome || '', i.motivo || '']))
    const csv = linhas.map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `auditoria_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (d === null) return <section className="adm-sec"><div className="adm-vazio">Carregando…</div></section>
  if (d === false) return <section className="adm-sec"><div className="adm-vazio">Não consegui carregar.</div></section>

  const total = (d.categorias || []).reduce((a, c) => a + Number(c.n || 0), 0)
  return (
    <section className="adm-sec">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}><Shield size={16} color="var(--accent)" /> Registro de ações</h2>
        <div style={{ display: 'flex', gap: 8, flex: '1 1 180px', maxWidth: 360, justifyContent: 'flex-end' }}>
          <form onSubmit={e => { e.preventDefault(); carregar(cat, busca) }} style={{ flex: '1 1 160px', maxWidth: 240 }}>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar ação, admin, grupo…" />
          </form>
          <button className="btn-ghost" style={{ padding: '0 12px', fontSize: 12, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={exportarCsv} disabled={!d.itens.length}><ExternalLink size={14} /> CSV</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => setCat(null)} className={`tag ${cat === null ? 'tag-green' : ''}`} style={{ cursor: 'pointer', border: cat === null ? 'none' : '1px solid var(--border)', background: cat === null ? undefined : 'transparent', color: cat === null ? undefined : 'var(--text2)' }}>Tudo <strong>· {total}</strong></button>
        {(d.categorias || []).map(c => (
          <button key={c.categoria} onClick={() => setCat(c.categoria)} className={`tag ${cat === c.categoria ? 'tag-green' : ''}`} style={{ cursor: 'pointer', border: cat === c.categoria ? 'none' : '1px solid var(--border)', background: cat === c.categoria ? undefined : 'transparent', color: cat === c.categoria ? undefined : 'var(--text2)' }}>{c.categoria} <strong>· {c.n}</strong></button>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 10 }}>Tudo o que é feito no painel fica aqui e não pode ser apagado. Mostrando os 200 mais recentes.</p>
      {d.itens.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>Nada neste filtro.</p> : d.itens.map(i => (
        <div key={i.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{i.acao}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{dataHora(i.criado_em)}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span className="tag" style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)' }}>{i.categoria}</span>
            <span style={{ wordBreak: 'break-all' }}>{i.admin_email}</span>
            {i.grupo_nome && <span>· {i.grupo_nome}</span>}
          </div>
          {i.motivo && <p style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 4 }}>{i.motivo}</p>}
        </div>
      ))}
    </section>
  )
}

/* ============================ CONFIGURAÇÕES ============================ */
export function Configuracoes() {
  const { toast } = useToast()
  const [d, setD] = useState(null)
  const [cfg, setCfg] = useState(null)       // cópia editável da config
  const [tarifas, setTarifas] = useState([]) // cópia editável das tarifas
  const [novo, setNovo] = useState({ modelo: '', entrada: '', saida: '' })
  const [salvando, setSalvando] = useState('')

  const carregar = useCallback(() => {
    supabase.rpc('admin_configuracoes').then(({ data, error }) => {
      if (error) { toast('Falhou ao carregar.', 'erro'); setD(false); return }
      setD(data); setCfg({ ...data.config }); setTarifas((data.tarifas || []).map(t => ({ ...t })))
    })
  }, [toast])
  useEffect(() => { carregar() }, [carregar])

  async function salvarCfg() {
    setSalvando('cfg')
    const { error } = await supabase.rpc('admin_salvar_config', {
      p_ia_gratis_mes: Number(cfg.ia_gratis_mes),
      p_custo_resposta_centavos: Number(cfg.custo_resposta_centavos),
      p_whatsapp_teto_centavos: Math.round(Number(cfg.whatsapp_teto_centavos)),
      p_whatsapp_pausado: !!cfg.whatsapp_pausado,
    })
    setSalvando('')
    if (error) return toast(error.message || 'Falhou.', 'erro')
    toast('Configuração salva.', 'ok'); carregar()
  }
  async function salvarTarifa(t) {
    setSalvando('t:' + t.modelo)
    const { error } = await supabase.rpc('admin_salvar_tarifa', { p_modelo: t.modelo, p_entrada: Number(t.entrada_usd_milhao), p_saida: Number(t.saida_usd_milhao) })
    setSalvando('')
    if (error) return toast(error.message || 'Falhou.', 'erro')
    toast('Tarifa salva.', 'ok'); carregar()
  }
  async function addTarifa() {
    if (!novo.modelo.trim()) return toast('Informe o modelo.', 'erro')
    setSalvando('novo')
    const { error } = await supabase.rpc('admin_salvar_tarifa', { p_modelo: novo.modelo.trim(), p_entrada: Number(novo.entrada) || 0, p_saida: Number(novo.saida) || 0 })
    setSalvando('')
    if (error) return toast(error.message || 'Falhou.', 'erro')
    setNovo({ modelo: '', entrada: '', saida: '' }); toast('Modelo adicionado.', 'ok'); carregar()
  }

  if (d === null || !cfg) return <section className="adm-sec"><div className="adm-vazio">Carregando…</div></section>
  if (d === false) return <section className="adm-sec"><div className="adm-vazio">Não consegui carregar.</div></section>

  const INTEGR = [['Anthropic (IA)', 'ANTHROPIC_API_KEY'], ['Resend (e-mail)', 'RESEND_API_KEY'], ['Asaas (cobrança)', 'ASAAS_API_KEY'], ['WhatsApp (Meta)', 'WHATSAPP_TOKEN']]

  return (
    <>
      <section className="adm-sec">
        <h2><Package size={16} color="var(--accent)" /> Uso e limites</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          <div className="form-group"><label>Respostas de IA grátis por mês</label><input type="number" min="0" value={cfg.ia_gratis_mes} onChange={e => setCfg({ ...cfg, ia_gratis_mes: e.target.value })} /></div>
          <div className="form-group"><label>Custo estimado por resposta (centavos de R$)</label><input type="number" step="0.1" min="0" value={cfg.custo_resposta_centavos} onChange={e => setCfg({ ...cfg, custo_resposta_centavos: e.target.value })} /></div>
          <div className="form-group"><label>Teto de gasto WhatsApp (R$)</label><input type="number" step="1" min="0" value={(Number(cfg.whatsapp_teto_centavos) / 100)} onChange={e => setCfg({ ...cfg, whatsapp_teto_centavos: Math.round(Number(e.target.value) * 100) })} /></div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
            <input id="wapausado" type="checkbox" checked={!!cfg.whatsapp_pausado} onChange={e => setCfg({ ...cfg, whatsapp_pausado: e.target.checked })} style={{ width: 18, height: 18 }} />
            <label htmlFor="wapausado" style={{ margin: 0 }}>Pausar WhatsApp</label>
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text3)', margin: '4px 0 12px', lineHeight: 1.5 }}>
          O custo por resposta é só a <strong>estimativa</strong> antiga. O custo <strong>real</strong> de IA agora vem da tabela de tarifas abaixo (por tokens). Os preços dos planos ficam no sistema de assinatura (planos_config), não aqui — o trial é de <strong>{d.trial_dias} dias</strong>.
        </p>
        <button className="btn-primary" onClick={salvarCfg} disabled={salvando === 'cfg'} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {salvando === 'cfg' ? <><Loader size={16} className="spin" /> Salvando…</> : <><Check size={16} /> Salvar</>}
        </button>
      </section>

      <section className="adm-sec">
        <h2><Activity size={16} color="var(--accent)" /> Tarifas de IA <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>· US$ por 1 milhão de tokens</span></h2>
        {tarifas.map((t, i) => (
          <div key={t.modelo} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 160px' }}><p style={{ fontSize: 13.5, fontWeight: 600 }}>{t.modelo}</p></div>
            <div className="form-group" style={{ flex: '1 1 90px', margin: 0 }}><label style={{ fontSize: 11 }}>Entrada</label><input type="number" step="0.01" min="0" value={t.entrada_usd_milhao} onChange={e => setTarifas(tarifas.map((x, j) => j === i ? { ...x, entrada_usd_milhao: e.target.value } : x))} /></div>
            <div className="form-group" style={{ flex: '1 1 90px', margin: 0 }}><label style={{ fontSize: 11 }}>Saída</label><input type="number" step="0.01" min="0" value={t.saida_usd_milhao} onChange={e => setTarifas(tarifas.map((x, j) => j === i ? { ...x, saida_usd_milhao: e.target.value } : x))} /></div>
            <button className="btn-ghost" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => salvarTarifa(t)} disabled={salvando === 't:' + t.modelo}>{salvando === 't:' + t.modelo ? <Loader size={14} className="spin" /> : 'Salvar'}</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', padding: '12px 0 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '2 1 160px', margin: 0 }}><label style={{ fontSize: 11 }}>Novo modelo</label><input value={novo.modelo} onChange={e => setNovo({ ...novo, modelo: e.target.value })} placeholder="ex.: claude-haiku-5-5" /></div>
          <div className="form-group" style={{ flex: '1 1 90px', margin: 0 }}><label style={{ fontSize: 11 }}>Entrada</label><input type="number" step="0.01" min="0" value={novo.entrada} onChange={e => setNovo({ ...novo, entrada: e.target.value })} /></div>
          <div className="form-group" style={{ flex: '1 1 90px', margin: 0 }}><label style={{ fontSize: 11 }}>Saída</label><input type="number" step="0.01" min="0" value={novo.saida} onChange={e => setNovo({ ...novo, saida: e.target.value })} /></div>
          <button className="btn-ghost" style={{ padding: '7px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={addTarifa} disabled={salvando === 'novo'}>{salvando === 'novo' ? <Loader size={14} className="spin" /> : <><Plus size={14} /> Adicionar</>}</button>
        </div>
      </section>

      <section className="adm-sec">
        <h2><Shield size={16} color="var(--accent)" /> Integrações</h2>
        <p style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 8 }}>As chaves ficam no servidor (nunca no painel). Aqui é só o que está previsto.</p>
        {INTEGR.map(([nome, secret], i) => (
          <div key={secret} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
            <span>{nome}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>{secret}</span>
          </div>
        ))}
      </section>
    </>
  )
}

/* ============================ BUSCA GLOBAL (⌘K) ============================ */
export function BuscaGlobal({ paginas, ir, onFechar }) {
  const [q, setQ] = useState('')
  const [grupos, setGrupos] = useState([])
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setGrupos([]); return }
      supabase.rpc('admin_grupos', { p_busca: q.trim() }).then(({ data }) => setGrupos((data || []).slice(0, 6)))
    }, 200)
    return () => clearTimeout(t)
  }, [q])
  const pgs = paginas.filter(p => p.nome.toLowerCase().includes(q.trim().toLowerCase()))
  const item = { display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 8, fontSize: 14 }
  const titulo = { fontSize: 11, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--text3)', margin: '10px 2px 4px' }
  return (
    <div className="modal-overlay" onClick={onFechar} style={{ alignItems: 'flex-start', paddingTop: '12vh' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente ou página…" style={{ width: '100%' }} />
        {q.trim() === '' && <p style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 12 }}>Digite para buscar páginas e clientes. Dica: ⌘K / Ctrl+K abre isto de qualquer tela.</p>}
        {(q.trim() && pgs.length > 0) && <>
          <p style={titulo}>Páginas</p>
          {pgs.map(p => <button key={p.id} style={item} className="adm-nav" onClick={() => { ir(p.id); onFechar() }}>{p.nome}</button>)}
        </>}
        {grupos.length > 0 && <>
          <p style={titulo}>Clientes</p>
          {grupos.map(g => <button key={g.id} style={item} className="adm-nav" onClick={() => { ir('grupos'); onFechar() }}>{g.nome} <span style={{ color: 'var(--text3)', fontSize: 12 }}>· {g.status || 'sem plano'}</span></button>)}
        </>}
        {q.trim().length >= 2 && pgs.length === 0 && grupos.length === 0 && <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 12 }}>Nada encontrado.</p>}
      </div>
    </div>
  )
}

/* ============================ PLACEHOLDER (etapas futuras) ============================ */
export function EmConstrucao({ titulo, etapa, descricao }) {
  return (
    <section className="adm-sec">
      <h2><Hammer size={16} color="var(--text3)" /> {titulo}</h2>
      <div className="adm-vazio">
        <span className="adm-soon"><Hammer size={14} /> Em construção · Etapa {etapa}</span>
        <p style={{ marginTop: 12 }}>{descricao}</p>
      </div>
    </section>
  )
}
