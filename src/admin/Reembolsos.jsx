// Painel › Financeiro › Reembolsos (27/11/2026, migrações 0129 + 0130).
// Todo pedido de reembolso de arrependimento (art. 49 do CDC) aparece aqui e só fica "Devolvido" quando o Asaas
// confirma que o dinheiro saiu. O app confere de hora em hora (função `reembolsos`); aqui dá pra conferir/pedir na
// hora ou marcar como devolvido por fora.
import { useState, useEffect, useCallback } from 'react'
import { Undo2, RefreshCw, Check, AlertTriangle, Clock, ShieldCheck, Wallet, Loader, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

const reais = (c) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }) : '—')
const diaHora = (d) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const METODO = { pix: 'Pix', cartao: 'Cartão', boleto: 'Boleto' }
const POR = { automatico: 'pelo app', painel: 'pelo painel', asaas: 'no Asaas', manual: 'por fora' }

// O que cada fase significa e o que o dono precisa fazer.
const FASES = {
  sem_saldo: { rotulo: 'Sem saldo', cor: 'var(--red-text)', fundo: 'var(--red-dim, rgba(239,68,68,.12))', Icone: Wallet, acao: 'Mande um Pix seu para a conta Asaas e clique em Conferir agora.' },
  aguardando_autorizacao: { rotulo: 'Autorize no Asaas', cor: 'var(--amber-text, #b45309)', fundo: 'var(--amber-dim, rgba(245,158,11,.14))', Icone: ShieldCheck, acao: 'Abra o Asaas e confirme o estorno com o código (ações pendentes de autorização).' },
  em_andamento: { rotulo: 'Processando', cor: 'var(--blue-text, #1d4ed8)', fundo: 'var(--blue-dim, rgba(59,130,246,.12))', Icone: Loader, acao: 'Nada a fazer: o Asaas está devolvendo.' },
  recusado: { rotulo: 'Estorno cancelado', cor: 'var(--red-text)', fundo: 'var(--red-dim, rgba(239,68,68,.12))', Icone: XCircle, acao: 'A autorização foi negada ou expirou. Clique em Conferir agora para pedir de novo.' },
  pedindo: { rotulo: 'Pedindo…', cor: 'var(--text2)', fundo: 'var(--bg2)', Icone: Clock, acao: 'Clique em Conferir agora.' },
  feito: { rotulo: 'Devolvido', cor: 'var(--accent-text)', fundo: 'var(--accent-dim)', Icone: Check, acao: '' },
}
const fase = (r) => (r.status !== 'pendente' ? FASES.feito : FASES[r.fase] || FASES.pedindo)

function Prazo({ r }) {
  if (r.status !== 'pendente') {
    const noPrazo = r.feito_em && new Date(r.feito_em) <= new Date(r.prazo_em)
    return <span style={{ color: noPrazo ? 'var(--accent-text)' : 'var(--red-text)', fontWeight: 600 }}>{noPrazo ? 'no prazo' : 'depois do prazo'}</span>
  }
  const horas = (new Date(r.prazo_em).getTime() - Date.now()) / 3600000
  const cor = horas < 0 ? 'var(--red-text)' : horas < 24 ? 'var(--amber-text, #b45309)' : 'var(--text)'
  const texto = horas < 0 ? `ATRASADO (${dia(r.prazo_em)})` : horas < 24 ? `hoje, ${dia(r.prazo_em)}` : dia(r.prazo_em)
  return <span style={{ color: cor, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{horas < 0 && <AlertTriangle size={13} />}{texto}</span>
}

function Selo({ r }) {
  const f = fase(r)
  const I = f.Icone
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: f.fundo, color: f.cor, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
      <I size={13} /> {f.rotulo}
    </span>
  )
}

function Cartao({ titulo, valor, sub, cor }) {
  return (
    <div style={{ flex: '1 1 140px', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
      <div style={{ fontSize: 12, color: 'var(--text2)' }}>{titulo}</div>
      <div style={{ fontFamily: 'Syne, system-ui', fontWeight: 700, fontSize: 22, color: cor || 'var(--text)' }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{sub}</div>}
    </div>
  )
}

const th = { textAlign: 'left', fontSize: 11.5, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td = { padding: '10px', borderBottom: '1px solid var(--border)', fontSize: 13, verticalAlign: 'top' }

export default function Reembolsos() {
  const { toast } = useToast()
  const [lista, setLista] = useState(null)
  const [ocupado, setOcupado] = useState(null)

  const carregar = useCallback(() => {
    supabase.from('reembolsos_pendentes').select('*').order('pedido_em', { ascending: false }).limit(200)
      .then(({ data, error }) => { if (error) { toast('Falhou ao carregar os reembolsos.', 'erro'); setLista([]) } else setLista(data || []) })
  }, [toast])
  useEffect(() => { carregar() }, [carregar])

  async function agir(r, acao) {
    let obs = ''
    if (acao === 'marcar_feito') {
      obs = window.prompt(`Confirma que você JÁ devolveu ${reais(r.valor_centavos)} para ${r.nome || r.email} por fora (ex.: Pix manual)?\nEscreva como devolveu (o cliente recebe o e-mail "reembolso feito"):`) || ''
      if (!obs.trim()) return
    }
    setOcupado(r.id)
    const { data, error } = await supabase.functions.invoke('reembolsos', { body: { acao, id: r.id, obs } })
    setOcupado(null)
    if (error) {
      let msg = 'Não deu certo.'
      try { const c = await error.context?.json?.(); if (c?.erro) msg = c.erro } catch { /* ignore */ }
      toast(msg, 'erro'); return
    }
    if (acao === 'tentar') {
      const f = FASES[data?.fase] || FASES.pedindo
      toast(data?.feito ? 'Devolvido! O cliente vai receber o e-mail.' : `${f.rotulo}. ${f.acao}${data?.erro ? ` (Asaas: ${data.erro})` : ''}`, data?.feito ? 'ok' : 'erro', 8000)
    } else toast('Marcado como devolvido. O cliente vai receber o e-mail.', 'ok')
    carregar()
  }

  const todos = lista || []
  const abertos = todos.filter((r) => r.status === 'pendente')
  const atrasados = abertos.filter((r) => new Date(r.prazo_em) < new Date())
  const autorizar = abertos.filter((r) => r.fase === 'aguardando_autorizacao')
  const devolvidoMes = todos.filter((r) => r.status !== 'pendente' && r.feito_em && new Date(r.feito_em).getMonth() === new Date().getMonth())
  const somaAbertos = abertos.reduce((s, r) => s + r.valor_centavos, 0)

  return (
    <section className="adm-sec">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Undo2 size={16} color="var(--purple)" /> Reembolsos
        <button className="btn-ghost" style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 12, display: 'inline-flex', gap: 5, alignItems: 'center' }} onClick={carregar}><RefreshCw size={13} /> Atualizar</button>
      </h2>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <Cartao titulo="Para devolver" valor={reais(somaAbertos)} sub={`${abertos.length} pedido(s) em aberto`} cor={abertos.length ? 'var(--amber-text, #b45309)' : undefined} />
        <Cartao titulo="Esperando sua autorização" valor={autorizar.length} sub="no Asaas" cor={autorizar.length ? 'var(--amber-text, #b45309)' : undefined} />
        <Cartao titulo="Atrasados" valor={atrasados.length} sub="passaram do prazo" cor={atrasados.length ? 'var(--red-text)' : 'var(--accent-text)'} />
        <Cartao titulo="Devolvidos no mês" valor={reais(devolvidoMes.reduce((s, r) => s + r.valor_centavos, 0))} sub={`${devolvidoMes.length} reembolso(s)`} />
      </div>

      {lista === null ? <p style={{ fontSize: 13 }}>Carregando…</p> : todos.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--accent-text)' }}><Check size={14} /> Nenhum pedido de reembolso até agora.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>Cliente</th><th style={th}>Valor</th><th style={th}>Pedido</th><th style={th}>Prazo</th>
                <th style={th}>Situação</th><th style={th}>O que fazer</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {todos.map((r) => {
                const aberto = r.status === 'pendente'
                const f = fase(r)
                return (
                  <tr key={r.id} style={{ background: aberto && new Date(r.prazo_em) < new Date() ? 'var(--red-dim, rgba(239,68,68,.06))' : undefined }}>
                    <td style={td}><div style={{ fontWeight: 600 }}>{r.nome || '—'}</div><div style={{ color: 'var(--text2)', fontSize: 12 }}>{r.email || 'sem e-mail'}</div></td>
                    <td style={td}><div style={{ fontWeight: 700 }}>{reais(r.valor_centavos)}</div><div style={{ color: 'var(--text2)', fontSize: 12 }}>{METODO[r.metodo] || r.metodo || '—'}</div></td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{diaHora(r.pedido_em)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><Prazo r={r} /></td>
                    <td style={td}><Selo r={r} />{!aberto && <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 4 }}>{POR[r.feito_por] || ''} em {diaHora(r.feito_em)}</div>}</td>
                    <td style={{ ...td, color: 'var(--text2)', maxWidth: 260 }}>
                      {aberto ? f.acao : r.aviso_cliente_em ? 'Cliente avisado por e-mail.' : '—'}
                      {aberto && r.ultimo_erro && <div style={{ fontSize: 11.5, marginTop: 4 }}>Asaas: {r.ultimo_erro}</div>}
                      {aberto && <div style={{ fontSize: 11.5, marginTop: 4 }}>Conferido {diaHora(r.ultima_tentativa_em)} · {r.tentativas} vez(es)</div>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {aberto && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 12.5 }} disabled={ocupado === r.id} onClick={() => agir(r, 'tentar')}>{ocupado === r.id ? 'Conferindo…' : 'Conferir agora'}</button>
                          <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12.5 }} disabled={ocupado === r.id} onClick={() => agir(r, 'marcar_feito')}>Já devolvi por fora</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55, marginTop: 12 }}>
        Prazo prometido ao cliente: 2 dias úteis (feriado conta como dia útil). A assinatura já é cancelada no pedido.
        O app confere no Asaas de hora em hora e só marca "Devolvido" quando o Asaas confirma que o dinheiro saiu — aí o
        cliente recebe o e-mail. Regras e taxas: docs/REEMBOLSOS.md.
      </p>
    </section>
  )
}
