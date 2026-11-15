import { useState, useEffect, useCallback } from 'react'
import {
  CreditCard, Users, Clock, AlertTriangle, Gift, Rocket, Sparkles, Ticket, Webhook,
  Pause, Play, Check, Loader, X, Mail, Send, Shield, UserPlus, Trash2, Hammer,
  Wallet, Package, TrendingUp, TrendingDown, Plus, Pencil, ExternalLink, Bell,
  Inbox, Archive, CornerUpLeft, Activity, CheckCircle2, XCircle, Database, Timer,
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
export function VisaoGeral({ metr, consumo, recarregar }) {
  const { toast } = useToast()
  const cfgMascote = useMascote()
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
      <div className="adm-cards">
        {cards.map(c => (
          <div key={c.label} className="adm-card">
            <div className="k"><c.icon size={14} color={c.cor} /> {c.label}</div>
            <div className="v">{c.valor}</div>
          </div>
        ))}
      </div>

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

  const carregar = useCallback((q = '') => {
    supabase.rpc('admin_grupos', { p_busca: q || null }).then(({ data, error }) => {
      if (error) { toast('Falhou ao carregar grupos.', 'erro'); setGrupos([]) } else setGrupos(data || [])
    })
  }, [toast])
  useEffect(() => { carregar() }, [carregar])

  return (
    <section className="adm-sec">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}><Users size={16} color="var(--blue)" /> Clientes (grupos)</h2>
        <form onSubmit={e => { e.preventDefault(); carregar(busca) }} style={{ flex: '1 1 180px', maxWidth: 260 }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome…" />
        </form>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>Só o status — nunca os lançamentos das famílias (LGPD).</p>
      <div className="adm-tbl-wrap">
        <table className="adm-tbl">
          <thead><tr><th>Grupo</th><th>Membros</th><th>Status</th><th>Plano</th><th>Trial/Período</th><th></th></tr></thead>
          <tbody>
            {grupos === null && <tr><td colSpan={6} className="adm-vazio">Carregando…</td></tr>}
            {grupos?.map(g => {
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
            {grupos?.length === 0 && <tr><td colSpan={6} className="adm-vazio">Nenhum grupo.</td></tr>}
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
  const cot = useCotacaoUsd()
  const carregar = useCallback(() => {
    supabase.rpc('admin_custos_mes').then(({ data, error }) => {
      if (error) { toast('Falhou ao carregar custos.', 'erro'); setD(false) } else setD(data)
    })
  }, [toast])
  useEffect(() => { carregar() }, [carregar])

  if (d === null || cot === null) return <section className="adm-sec"><div className="adm-vazio">Carregando…</div></section>
  if (d === false) return <section className="adm-sec"><div className="adm-vazio">Não consegui carregar.</div></section>

  const fixosUsdEmBrl = Math.round((d.fixos_usd_centavos || 0) * cot.valor)      // US$¢ × R$/US$ = R$¢
  const saidaTotal = (d.ia_custo_centavos || 0) + (d.fixos_brl_centavos || 0) + fixosUsdEmBrl
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
        <Linha rotulo={`Custo de IA · ${d.ia_billable} cobráveis (acima de ${d.ia_gratis_mes})`} valor={'− ' + reais(d.ia_custo_centavos)} />
        <Linha rotulo="Ferramentas em R$" valor={'− ' + reais(d.fixos_brl_centavos)} />
        <Linha rotulo={`Ferramentas em US$ · ${dolares(d.fixos_usd_centavos)} × ${cot.valor.toFixed(2)}`} valor={'− ' + reais(fixosUsdEmBrl)} />
        <div style={{ borderTop: '2px solid var(--border2, var(--border))', marginTop: 6 }}>
          <Linha rotulo="Resultado" valor={reais(resultado)} forte cor={positivo ? 'var(--accent)' : 'var(--red)'} />
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, lineHeight: 1.5 }}>
          O custo de IA é <strong>estimativa</strong> (nº de respostas acima do limite grátis × tarifa do painel), não o gasto real por chamada da Anthropic.
          A cotação {cot.real ? `veio da AwesomeAPI (US$ 1 = ${reais(Math.round(cot.valor * 100))})` : `é um valor de reserva (rede indisponível): US$ 1 ≈ R$ ${cot.valor.toFixed(2)}`}.
        </p>
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
  useEffect(() => {
    supabase.rpc('admin_receitas').then(({ data, error }) => {
      if (error) { toast('Falhou ao carregar.', 'erro'); setD(false) } else setD(data)
    })
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
    </>
  )
}

/* ============================ FICHA DO CLIENTE ============================ */
function ModalCliente({ grupo, onFechar }) {
  const { toast } = useToast()
  const [d, setD] = useState(null)
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(() => {
    supabase.rpc('admin_cliente', { p_grupo_id: grupo.id }).then(({ data, error }) => {
      if (error) { toast('Não consegui carregar a ficha.', 'erro'); setD(false) } else setD(data)
    })
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
const SUP_STATUS = { novo: ['Novo', 'tag-blue'], lido: ['Lido', 'tag-amber'], respondido: ['Respondido', 'tag-green'], arquivado: ['Arquivado', 'tag-red'] }

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
  const chips = [['Todos', null], ['Novos', 'novo'], ['Lidos', 'lido'], ['Respondidos', 'respondido'], ['Arquivados', 'arquivado']]

  return (
    <section className="adm-sec">
      <h2><Inbox size={16} color="var(--accent)" /> Caixa de suporte</h2>
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
              <span style={{ fontSize: 14, fontWeight: 600 }}>{m.de_nome || m.de_email}</span>
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

  // Abriu um "novo" → marca como lido (sem bloquear a tela).
  useEffect(() => {
    if (msg.status === 'novo') supabase.rpc('admin_suporte_marcar', { p_id: msg.id, p_status: 'lido' }).then(() => onMudou())
  }, [msg.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <p style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 2 }}>{msg.de_nome ? `${msg.de_nome} · ` : ''}<span style={{ wordBreak: 'break-all' }}>{msg.de_email}</span></p>
        <p style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 12 }}>{dataHora(msg.recebido_em)}</p>
        <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 16, fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{msg.corpo || '(sem conteúdo)'}</div>

        {msg.resposta && (
          <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 4 }}>Sua resposta · {dataHora(msg.respondido_em)}</p>
            <div style={{ fontSize: 13.5, color: 'var(--text2)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{msg.resposta}</div>
          </div>
        )}

        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Responder (vai pelo e-mail avisos@, assinado HopeFin)</label>
        <textarea value={resposta} onChange={e => setResposta(e.target.value)} rows={5} placeholder="Escreva a resposta ao cliente…" style={{ width: '100%', marginBottom: 12, resize: 'vertical' }} />
        <button className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }} onClick={responder} disabled={enviando}>
          {enviando ? <><Loader size={18} className="spin" /> Enviando…</> : <><CornerUpLeft size={18} /> Enviar resposta</>}
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => marcar('arquivado')}><Archive size={14} /> Arquivar</button>
          <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => marcar('novo')}>Marcar não lido</button>
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
