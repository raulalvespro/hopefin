import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Users, CreditCard, Gift, Rocket, Clock, AlertTriangle,
  Sparkles, Ticket, Webhook, Pause, Play, Check, Loader, X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

const reais = (c) => ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataCurta = (s) => s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
const dataHora = (s) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

// Rótulo + cor do status da assinatura.
const STATUS = {
  trial: ['Trial', 'tag-blue'], active: ['Ativo', 'tag-green'], past_due: ['Inadimplente', 'tag-red'],
  canceled: ['Cancelado', 'tag-red'], expired: ['Expirado', 'tag-amber'],
}

export default function Admin() {
  const { perfil, loading: authLoading } = useAuth()
  const nav = useNavigate()
  const { toast } = useToast()
  const [carregando, setCarregando] = useState(true)
  const [metr, setMetr] = useState(null)
  const [consumo, setConsumo] = useState(null)
  const [grupos, setGrupos] = useState([])
  const [cupons, setCupons] = useState([])
  const [webhooks, setWebhooks] = useState([])
  const [busca, setBusca] = useState('')
  const [acao, setAcao] = useState(null) // { tipo, grupo } para o modal

  // noindex: o painel nunca deve ser indexado.
  useEffect(() => {
    const m = document.createElement('meta')
    m.name = 'robots'; m.content = 'noindex, nofollow'
    document.head.appendChild(m)
    return () => { document.head.removeChild(m) }
  }, [])

  const carregar = useCallback(async (q = '') => {
    setCarregando(true)
    const [mt, cs, gr, cp, wh] = await Promise.all([
      supabase.rpc('admin_metricas'),
      supabase.rpc('admin_consumo_mes'),
      supabase.rpc('admin_grupos', { p_busca: q || null }),
      supabase.rpc('admin_cupons'),
      supabase.rpc('admin_webhooks'),
    ])
    if (mt.error) { toast('Sem acesso ao painel.', 'erro'); nav('/'); return }
    setMetr(mt.data); setConsumo(cs.data); setGrupos(gr.data || [])
    setCupons(cp.data || []); setWebhooks(wh.data || [])
    setCarregando(false)
  }, [nav, toast])

  useEffect(() => { if (perfil?.is_admin) carregar() }, [perfil, carregar])

  if (authLoading) return <Centro>Carregando…</Centro>
  if (!perfil?.is_admin) { nav('/'); return null }

  async function togglePausaWhatsapp() {
    const { error } = await supabase.rpc('admin_set_whatsapp', {
      p_pausado: !consumo.whatsapp_pausado, p_teto_centavos: consumo.whatsapp_teto_centavos,
    })
    if (error) return toast('Falhou.', 'erro')
    toast(consumo.whatsapp_pausado ? 'WhatsApp retomado' : 'WhatsApp pausado', 'ok')
    carregar(busca)
  }

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

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 16px 60px' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => nav('/')} className="btn-ghost" style={{ padding: 8, display: 'flex' }} aria-label="Voltar">
          <ArrowLeft size={18} />
        </button>
        <h1 style={{ fontSize: 22, flex: 1 }}>Painel do dono</h1>
        <button onClick={() => carregar(busca)} className="btn-ghost" style={{ padding: 8, display: 'flex' }} aria-label="Atualizar">
          <RefreshCw size={18} className={carregando ? 'spin' : ''} />
        </button>
      </div>

      {carregando && !metr ? <Centro>Carregando painel…</Centro> : (
        <>
          {/* Visão geral */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
            {cards.map(c => (
              <div key={c.label} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)', fontSize: 12, marginBottom: 8 }}>
                  <c.icon size={14} color={c.cor} /> {c.label}
                </div>
                <div style={{ fontSize: 24, fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>{c.valor}</div>
              </div>
            ))}
          </div>

          {/* Consumo de IA / WhatsApp */}
          {consumo && (
            <section className="card" style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Sparkles size={16} color="var(--accent)" /> Uso de IA / WhatsApp (mês)
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 14, marginBottom: 16 }}>
                <Mini label="Interações" valor={consumo.usos_mes} />
                <Mini label={`Cobráveis (>${consumo.gratis_mes})`} valor={consumo.billable} />
                <Mini label="Custo estimado" valor={reais(consumo.custo_centavos)} />
                <Mini label="Acerto da voz" valor={consumo.voz?.acerto_pct != null ? `${consumo.voz.acerto_pct}%` : '—'} sub={consumo.voz?.total ? `${consumo.voz.total} lanç.` : 'sem dados'} />
              </div>

              {/* Top consumidores */}
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

              {/* Interruptor do WhatsApp */}
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

          {/* Grupos */}
          <section className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Users size={16} color="var(--blue)" /> Grupos</h2>
              <form onSubmit={e => { e.preventDefault(); carregar(busca) }} style={{ flex: '1 1 180px', maxWidth: 260 }}>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome…" />
              </form>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
              O painel mostra só o status — nunca os lançamentos das famílias (LGPD).
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 560 }}>
                <thead>
                  <tr style={{ color: 'var(--text2)', fontSize: 12, textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>Grupo</th><th>Membros</th><th>Status</th>
                    <th>Plano</th><th>Trial/Período</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map(g => {
                    const [rot, cls] = STATUS[g.status] || [g.status || 'sem plano', 'tag-amber']
                    return (
                      <tr key={g.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px' }}>
                          {g.nome}
                          {g.is_cortesia && <span className="tag tag-green" style={{ marginLeft: 6 }}>cortesia</span>}
                          {g.is_lancamento && <span className="tag tag-blue" style={{ marginLeft: 6 }}>lançamento</span>}
                        </td>
                        <td>{g.membros}</td>
                        <td><span className={`tag ${cls}`}>{rot}</span></td>
                        <td style={{ color: 'var(--text2)' }}>{g.ciclo || '—'}</td>
                        <td style={{ color: 'var(--text2)' }}>{dataCurta(g.status === 'trial' ? g.trial_ends_at : g.current_period_end)}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }} onClick={() => setAcao({ tipo: 'trial', grupo: g })}>+ trial</button>
                          <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setAcao({ tipo: 'cortesia', grupo: g })}>{g.is_cortesia ? 'tirar cortesia' : 'cortesia'}</button>
                        </td>
                      </tr>
                    )
                  })}
                  {grupos.length === 0 && <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: 'var(--text3)' }}>Nenhum grupo.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {/* Cupons */}
          <Cupons cupons={cupons} onMudou={() => carregar(busca)} />

          {/* Webhooks */}
          <section className="card">
            <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}><Webhook size={16} color="var(--purple)" /> Webhooks do Asaas</h2>
            {webhooks.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text3)' }}>Nenhum webhook recebido ainda.</p>
            ) : webhooks.map(w => (
              <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 600 }}>{w.evento || '—'}</span>
                <span style={{ color: (w.status || '').startsWith('erro') ? 'var(--red)' : 'var(--text2)' }}>{w.status}</span>
                <span style={{ color: 'var(--text3)' }}>{dataHora(w.recebido_em)}</span>
              </div>
            ))}
          </section>
        </>
      )}

      {acao && <ModalAcao acao={acao} onFechar={() => setAcao(null)} onFeito={() => { setAcao(null); carregar(busca) }} />}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Centro({ children }) {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--text2)' }}>{children}</div>
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

// Modal de ação sobre um grupo (estender trial / cortesia).
function ModalAcao({ acao, onFechar, onFeito }) {
  const { toast } = useToast()
  const [dias, setDias] = useState(7)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const ehTrial = acao.tipo === 'trial'
  const ativarCortesia = !acao.grupo.is_cortesia

  async function confirmar() {
    if (!motivo.trim()) return toast('Informe o motivo (fica no log de auditoria).', 'erro')
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
        {ehTrial && (
          <div className="form-group">
            <label>Dias a adicionar</label>
            <input type="number" min="1" max="365" value={dias} onChange={e => setDias(e.target.value)} />
          </div>
        )}
        <div className="form-group">
          <label>Motivo (auditoria)</label>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex: parceria com a igreja" autoFocus />
        </div>
        <button className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={confirmar} disabled={salvando}>
          {salvando ? <><Loader size={18} className="spin" /> Salvando…</> : <><Check size={18} /> Confirmar</>}
        </button>
      </div>
    </div>
  )
}

// Gestão de cupons de cortesia.
function Cupons({ cupons, onMudou }) {
  const { toast } = useToast()
  const [novo, setNovo] = useState(false)
  const [form, setForm] = useState({ codigo: '', max_usos: 50, resgate_ate: '', whatsapp_limite_mes: 100 })
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!form.codigo.trim()) return toast('Informe o código.', 'erro')
    setSalvando(true)
    const { error } = await supabase.rpc('admin_salvar_cupom', {
      p_codigo: form.codigo, p_max_usos: Number(form.max_usos),
      p_resgate_ate: form.resgate_ate || null, p_whatsapp_limite_mes: Number(form.whatsapp_limite_mes), p_ativo: true,
    })
    setSalvando(false)
    if (error) return toast(error.message || 'Falhou.', 'erro')
    toast('Cupom salvo.', 'ok'); setNovo(false)
    setForm({ codigo: '', max_usos: 50, resgate_ate: '', whatsapp_limite_mes: 100 }); onMudou()
  }

  async function toggle(c) {
    const { error } = await supabase.rpc('admin_salvar_cupom', {
      p_codigo: c.codigo, p_max_usos: c.max_usos, p_resgate_ate: c.resgate_ate,
      p_whatsapp_limite_mes: c.whatsapp_limite_mes, p_ativo: !c.ativo,
    })
    if (error) return toast('Falhou.', 'erro')
    onMudou()
  }

  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Ticket size={16} color="var(--amber)" /> Cupons</h2>
        <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setNovo(v => !v)}>{novo ? 'Cancelar' : '+ Novo'}</button>
      </div>

      {novo && (
        <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 14 }}>
          <div className="form-row">
            <div className="form-group"><label>Código</label><input value={form.codigo} onChange={e => setForm(p => ({ ...p, codigo: e.target.value.toUpperCase() }))} placeholder="IGREJA2026" /></div>
            <div className="form-group"><label>Máx. usos</label><input type="number" min="1" value={form.max_usos} onChange={e => setForm(p => ({ ...p, max_usos: e.target.value }))} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Resgate até</label><input type="date" value={form.resgate_ate} onChange={e => setForm(p => ({ ...p, resgate_ate: e.target.value }))} /></div>
            <div className="form-group"><label>WhatsApp/mês</label><input type="number" min="0" value={form.whatsapp_limite_mes} onChange={e => setForm(p => ({ ...p, whatsapp_limite_mes: e.target.value }))} /></div>
          </div>
          <button className="btn-primary" onClick={salvar} disabled={salvando} style={{ width: '100%' }}>{salvando ? 'Salvando…' : 'Salvar cupom'}</button>
        </div>
      )}

      {cupons.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>Nenhum cupom.</p> : cupons.map(c => (
        <div key={c.codigo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 14 }}>
          <div>
            <strong>{c.codigo}</strong>
            <span style={{ color: 'var(--text2)', fontSize: 12, marginLeft: 8 }}>{c.usos}/{c.max_usos} usos · até {dataCurta(c.resgate_ate)}</span>
          </div>
          <button className={`tag ${c.ativo ? 'tag-green' : 'tag-red'}`} onClick={() => toggle(c)} style={{ cursor: 'pointer' }}>
            {c.ativo ? 'ativo' : 'inativo'}
          </button>
        </div>
      ))}
    </section>
  )
}
