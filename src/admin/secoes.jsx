import { useState, useEffect, useCallback } from 'react'
import {
  CreditCard, Users, Clock, AlertTriangle, Gift, Rocket, Sparkles, Ticket, Webhook,
  Pause, Play, Check, Loader, X, Mail, Send, Shield, UserPlus, Trash2, Hammer,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useMascote, atualizarConfigMascote } from '../lib/mascote'

export const reais = (c) => ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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
                  <td>{g.nome}
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
