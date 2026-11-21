import { useCallback, useEffect, useState } from 'react'
import { Megaphone, Send, FlaskConical, Smartphone, Bell, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { dataHora } from './secoes'

// Comunicados (A8.15, 21/11/2026): aviso pra um público, pelo card no Início do app, notificação no
// celular e/ou e-mail. "Enviar teste pra mim" antes; "Enviar" pede confirmação com quantas pessoas.
// Quem envia é a Edge Function admin-comunicado (admin + código do celular).
const PUBLICOS = [
  { v: 'todos', nome: 'Todo mundo' },
  { v: 'assinantes', nome: 'Assinantes (pagando)' },
  { v: 'teste', nome: 'Em teste grátis' },
  { v: 'cortesia', nome: 'Cortesia' },
  { v: 'inativos', nome: 'Quem não entra há X dias' },
  { v: 'grupo', nome: 'Um grupo' },
]
const TELAS = [
  { v: '', nome: 'Sem botão' }, { v: '/', nome: 'Início' }, { v: '/planos', nome: 'Meu plano' },
  { v: '/gastos', nome: 'Gastos' }, { v: '/entradas', nome: 'Entradas' }, { v: '/cartoes', nome: 'Cartões' },
  { v: '/contas-do-mes', nome: 'Contas do mês' }, { v: '/boas-vindas', nome: 'Primeiros passos' },
  { v: '/conta', nome: 'Minha conta' }, { v: '/configuracoes', nome: 'Configurações' },
]
const CANAIS = [
  { v: 'app', nome: 'Card no app', icon: Smartphone },
  { v: 'push', nome: 'Notificação', icon: Bell },
  { v: 'email', nome: 'E-mail', icon: Mail },
]
const VAZIO = { titulo: '', texto: '', botao_texto: '', botao_rota: '', publico: 'todos', inativos_dias: 14, grupo_id: '', canais: ['app', 'push'] }
const nomePublico = (c) => c.publico === 'inativos' ? `Sem entrar há ${c.inativos_dias} dias` : (PUBLICOS.find(p => p.v === c.publico)?.nome || c.publico)
const nomesCanais = (lista) => lista.map(c => CANAIS.find(x => x.v === c)?.nome || c).join(', ')

export default function Comunicados() {
  const { toast } = useToast()
  const [form, setForm] = useState(VAZIO)
  const [previa, setPrevia] = useState(null)
  const [grupos, setGrupos] = useState([])
  const [historico, setHistorico] = useState(null)
  const [enviando, setEnviando] = useState(null) // 'teste' | 'enviar'
  const [confirmar, setConfirmar] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const carregarHistorico = useCallback(async () => {
    const { data } = await supabase.rpc('admin_comunicados_listar')
    setHistorico(data || [])
  }, [])
  useEffect(() => { carregarHistorico() }, [carregarHistorico])
  useEffect(() => { supabase.rpc('admin_comunicado_grupos').then(({ data }) => setGrupos(data || [])) }, [])

  // Quantas pessoas o público alcança (atualiza quando muda o público).
  useEffect(() => {
    if (form.publico === 'grupo' && !form.grupo_id) { setPrevia(null); return }
    let vivo = true
    supabase.rpc('admin_comunicado_previa', { p_publico: form.publico, p_dias: Number(form.inativos_dias) || 14, p_grupo: form.grupo_id || null })
      .then(({ data }) => { if (vivo) setPrevia(data || null) })
    return () => { vivo = false }
  }, [form.publico, form.inativos_dias, form.grupo_id])

  const alternarCanal = (c) => set('canais', form.canais.includes(c) ? form.canais.filter(x => x !== c) : [...form.canais, c])
  const valido = form.titulo.trim().length >= 3 && form.texto.trim().length >= 3 && form.canais.length > 0 && (form.publico !== 'grupo' || form.grupo_id)

  async function mandar(acao) {
    setConfirmar(false)
    setEnviando(acao)
    const corpo = { ...form, acao, botao_texto: form.botao_rota ? (form.botao_texto || 'Abrir') : '', inativos_dias: Number(form.inativos_dias) || 14 }
    const { data, error } = await supabase.functions.invoke('admin-comunicado', { body: corpo })
    setEnviando(null)
    if (error || data?.erro) {
      let msg = data?.erro
      try { msg = msg || (await error?.context?.json())?.erro } catch { /* ignore */ }
      toast(msg || 'Não foi possível enviar.', 'erro')
      return
    }
    toast(acao === 'teste'
      ? `Teste enviado pra você (${data.push} notificação, ${data.emails} e-mail). Olhe o Início do app.`
      : `Enviado pra ${data.destinatarios} pessoas · ${data.push} notificações · ${data.emails} e-mails.`, 'ok')
    if (acao === 'enviar') setForm(VAZIO)
    carregarHistorico()
  }

  return (
    <section className="adm-sec">
      <h2><Megaphone size={16} color="var(--accent)" /> Comunicados</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '-4px 0 14px', lineHeight: 1.5 }}>
        Um aviso pra um público, no Início do app, no celular e/ou por e-mail. Mande um teste pra você antes.
        Bons usos: novidade do app, dica de uso, datas especiais, aviso de manutenção, reativar quem parou.
      </p>

      <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 18 }}>
        <div className="form-group"><label>Título ({form.titulo.length}/80)</label>
          <input value={form.titulo} maxLength={80} onChange={e => set('titulo', e.target.value)} placeholder="Ex.: Novidade: primeiros passos guiados" />
        </div>
        <div className="form-group"><label>Texto ({form.texto.length}/600)</label>
          <textarea value={form.texto} maxLength={600} rows={4} onChange={e => set('texto', e.target.value)} placeholder="Escreva como você fala com o cliente. Curto e direto." style={{ width: '100%', resize: 'vertical' }} />
        </div>
        <div className="form-row">
          <div className="form-group"><label>Botão leva pra</label>
            <select value={form.botao_rota} onChange={e => set('botao_rota', e.target.value)}>
              {TELAS.map(t => <option key={t.v} value={t.v}>{t.nome}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Texto do botão</label>
            <input value={form.botao_texto} maxLength={30} disabled={!form.botao_rota} onChange={e => set('botao_texto', e.target.value)} placeholder={form.botao_rota ? 'Ex.: Ver agora' : '—'} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Público</label>
            <select value={form.publico} onChange={e => set('publico', e.target.value)}>
              {PUBLICOS.map(p => <option key={p.v} value={p.v}>{p.nome}</option>)}
            </select>
          </div>
          {form.publico === 'inativos' && (
            <div className="form-group"><label>Sem entrar há (dias)</label>
              <input type="number" inputMode="numeric" min="1" max="365" value={form.inativos_dias} onChange={e => set('inativos_dias', e.target.value)} />
            </div>
          )}
          {form.publico === 'grupo' && (
            <div className="form-group"><label>Grupo</label>
              <select value={form.grupo_id} onChange={e => set('grupo_id', e.target.value)}>
                <option value="">Escolha…</option>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </div>
          )}
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Canais</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {CANAIS.map(({ v, nome, icon: Icon }) => {
            const on = form.canais.includes(v)
            return (
              <button key={v} type="button" onClick={() => alternarCanal(v)} aria-pressed={on}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border2)'}`, background: on ? 'var(--accent-dim)' : 'var(--bg2)', color: on ? 'var(--accent-text)' : 'var(--text2)' }}>
                <Icon size={14} /> {nome}
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
          {previa ? <>Vai para <strong style={{ color: 'var(--text)' }}>{previa.pessoas} pessoa(s)</strong>{form.canais.includes('email') && <> · {previa.com_email} aceitam e-mail</>}.</> : '…'}
          {form.canais.includes('email') && ' O e-mail sai com o link "não quero receber" (LGPD).'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-ghost" disabled={!valido || !!enviando} onClick={() => mandar('teste')} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <FlaskConical size={15} /> {enviando === 'teste' ? 'Enviando…' : 'Enviar teste pra mim'}
          </button>
          <button className="btn-primary" disabled={!valido || !!enviando || !previa?.pessoas} onClick={() => setConfirmar(true)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Send size={15} /> {enviando === 'enviar' ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
        {confirmar && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--amber)', background: 'var(--amber-dim, rgba(230,160,30,0.12))' }}>
            <p style={{ fontSize: 13.5, marginBottom: 10, lineHeight: 1.5 }}>
              Enviar “<strong>{form.titulo}</strong>” para <strong>{previa?.pessoas} pessoa(s)</strong> ({nomePublico(form)}) por {nomesCanais(form.canais)}? Não dá pra desfazer.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setConfirmar(false)} style={{ flex: 1 }}>Voltar</button>
              <button className="btn-primary" onClick={() => mandar('enviar')} style={{ flex: 1 }}>Sim, enviar</button>
            </div>
          </div>
        )}
      </div>

      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Enviados</h3>
      {!historico ? <p style={{ fontSize: 13, color: 'var(--text2)' }}>Carregando…</p>
        : historico.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text2)' }}>Nenhum comunicado ainda.</p>
        : historico.map(c => (
          <div key={c.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.teste && <span className="tag tag-amber" style={{ marginRight: 6 }}>teste</span>}{c.titulo}
              </strong>
              <span style={{ color: 'var(--text2)', flexShrink: 0 }}>{dataHora(c.enviado_em || c.criado_em)}</span>
            </div>
            <p style={{ color: 'var(--text2)', marginTop: 3, lineHeight: 1.5 }}>
              {c.teste ? 'Só pra você' : nomePublico(c)} · {nomesCanais(c.canais)} · {c.destinatarios} pessoa(s) · {c.vistos} viram · {c.clicados} tocaram no botão · {c.enviados_push} notificações · {c.enviados_email} e-mails
            </p>
          </div>
        ))}
    </section>
  )
}
