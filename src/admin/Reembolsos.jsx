// Painel › Financeiro › Reembolsos (27/11/2026, migração 0129).
// Reembolsos de arrependimento (art. 49 do CDC) que o Asaas recusou por falta de saldo. A assinatura do cliente
// já foi cancelada; falta devolver o dinheiro ATÉ o prazo prometido (2 dias úteis). O app tenta sozinho de hora em
// hora (função `reembolsos`); aqui dá pra tentar na hora ou marcar como devolvido por fora.
import { useState, useEffect, useCallback } from 'react'
import { Undo2, RefreshCw, Check, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

const reais = (c) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')
const diaHora = (d) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—')
const STATUS = { pendente: 'Pendente', feito: 'Devolvido', feito_manual: 'Devolvido por fora', cancelado: 'Cancelado' }
const POR = { automatico: 'pelo app (automático)', painel: 'pelo painel', asaas: 'no painel do Asaas', manual: 'por fora' }

function situacaoPrazo(r) {
  const fim = new Date(r.prazo_em).getTime()
  const horas = (fim - Date.now()) / 3600000
  if (horas < 0) return { cor: 'var(--red-text)', texto: `ATRASADO desde ${dia(r.prazo_em)}` }
  if (horas < 24) return { cor: 'var(--amber-text, #b45309)', texto: `vence hoje (${dia(r.prazo_em)})` }
  return { cor: 'var(--text2)', texto: `até ${dia(r.prazo_em)}` }
}

export default function Reembolsos() {
  const { toast } = useToast()
  const [lista, setLista] = useState(null)
  const [ocupado, setOcupado] = useState(null)

  const carregar = useCallback(() => {
    supabase.from('reembolsos_pendentes').select('*').order('pedido_em', { ascending: false }).limit(100)
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
    if (acao === 'tentar') toast(data?.ok ? 'Reembolso feito. O cliente vai receber o e-mail.' : `O Asaas recusou de novo: ${data?.erro || 'erro'}`, data?.ok ? 'ok' : 'erro', 7000)
    else toast('Marcado como devolvido. O cliente vai receber o e-mail.', 'ok')
    carregar()
  }

  const pend = (lista || []).filter((r) => r.status === 'pendente')
  const feitos = (lista || []).filter((r) => r.status !== 'pendente')

  return (
    <>
      <section className="adm-sec" style={{ borderColor: pend.length ? 'var(--amber)' : undefined }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Undo2 size={16} color="var(--purple)" /> Reembolsos para fazer
          <button className="btn-ghost" style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 12 }} onClick={carregar}><RefreshCw size={13} /> Atualizar</button>
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55, margin: '0 0 12px' }}>
          Cliente pediu o reembolso nos 7 dias (art. 49 do CDC) e o Asaas recusou o estorno por <strong>falta de saldo</strong>.
          A assinatura <strong>já foi cancelada</strong> (nenhuma cobrança nova). Falta devolver o dinheiro <strong>até o prazo</strong>,
          que foi prometido ao cliente por e-mail. O app tenta de novo sozinho de hora em hora — basta ter saldo no Asaas
          (um Pix seu para a chave da conta). Estornou direto no painel do Asaas? O app percebe e fecha sozinho.
        </p>
        {lista === null ? <p style={{ fontSize: 13 }}>Carregando…</p>
          : pend.length === 0 ? <p style={{ fontSize: 13, color: 'var(--accent-text)' }}><Check size={14} /> Nenhum reembolso pendente.</p>
          : pend.map((r) => {
            const p = situacaoPrazo(r)
            return (
              <div key={r.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{r.nome || '—'} · {reais(r.valor_centavos)} <span style={{ fontWeight: 400, color: 'var(--text2)' }}>({r.metodo || '—'})</span></strong>
                  <span style={{ color: p.cor, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{p.cor === 'var(--red-text)' && <AlertTriangle size={14} />}{p.texto}</span>
                </div>
                <span style={{ color: 'var(--text2)' }}>{r.email || 'sem e-mail'} · pedido em {diaHora(r.pedido_em)} · {r.tentativas} tentativa(s), última {diaHora(r.ultima_tentativa_em)}</span>
                <span style={{ color: 'var(--text2)' }}>Resposta do Asaas: {r.ultimo_erro || r.motivo}</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} disabled={ocupado === r.id} onClick={() => agir(r, 'tentar')}>{ocupado === r.id ? 'Tentando…' : 'Tentar agora'}</button>
                  <button className="btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }} disabled={ocupado === r.id} onClick={() => agir(r, 'marcar_feito')}>Já devolvi por fora</button>
                </div>
              </div>
            )
          })}
      </section>
      {feitos.length > 0 && (
        <section className="adm-sec">
          <h2>Histórico</h2>
          {feitos.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span><strong>{r.nome || '—'}</strong> · {reais(r.valor_centavos)}</span>
              <span style={{ color: 'var(--text2)' }}>{STATUS[r.status] || r.status} {POR[r.feito_por] || ''} em {diaHora(r.feito_em)} {r.feito_em && new Date(r.feito_em) > new Date(r.prazo_em) ? '· depois do prazo' : '· no prazo'}</span>
            </div>
          ))}
        </section>
      )}
    </>
  )
}
