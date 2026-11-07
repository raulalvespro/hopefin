import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useAssinatura } from '../hooks/useAssinatura'
import { fmt, fmtData } from '../lib/format'
import { Button, Tag } from './ui'
import { copy } from '../copy/pt-BR'

const t = copy.assinatura
const data = d => fmtData(d instanceof Date ? d : new Date(d))

// Configurações → "Minha assinatura": mostra a situação e deixa o titular cancelar.
// O cancelamento roda na Edge Function asaas-cancelar (apaga a assinatura e as
// cobranças em aberto no Asaas) — o acesso segue até o fim do período já pago.
export default function AssinaturaCard() {
  const { perfil } = useAuth()
  const { toast } = useToast()
  const { assinatura, status, loading, recarregar, emTrial, diasRestantes, cancelaNoFim, acessoAte } = useAssinatura()
  const [confirmando, setConfirmando] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  if (loading || !assinatura) return null

  const podeCancelar = !assinatura.titular_id || assinatura.titular_id === perfil?.id
  const fim = assinatura.current_period_end ? new Date(assinatura.current_period_end) : null

  async function cancelar() {
    setCancelando(true)
    const { data: res, error } = await supabase.functions.invoke('asaas-cancelar', { body: {} })
    setCancelando(false)
    if (error || !res?.ok) {
      let msg = t.erroCancelar
      try { const corpo = await error?.context?.json?.(); if (corpo?.error) msg = corpo.error } catch { /* ignore */ }
      toast(msg, 'erro')
      return
    }
    setConfirmando(false)
    toast(t.okCancelada(res.acessoAte ? data(res.acessoAte) : null), 'ok', 6000)
    recarregar()
  }

  // Situação atual
  let titulo, texto, tag = null, acao = null
  if (assinatura.is_cortesia) {
    titulo = t.cortesiaTitulo; texto = t.cortesiaTexto; tag = <Tag cor="verde">Cortesia</Tag>
  } else if (cancelaNoFim) {
    titulo = t.canceladaTitulo; texto = t.canceladaTexto(acessoAte ? data(acessoAte) : ''); tag = <Tag cor="amber">Cancelada</Tag>
    acao = <Link to="/planos" style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent-text)' }}>{t.assinarDeNovo}</Link>
  } else if (status === 'active') {
    titulo = t.plano(assinatura.ciclo)
    texto = [assinatura.preco_centavos ? t.preco(fmt(assinatura.preco_centavos / 100), assinatura.ciclo) : null,
      fim ? t.proximaRenovacao(data(fim)) : null].filter(Boolean).join(' · ')
    tag = <Tag cor="verde">Ativa</Tag>
  } else if (status === 'past_due') {
    titulo = t.pendenteTitulo; texto = t.pendenteTexto; tag = <Tag cor="vermelho">Pendente</Tag>
    acao = <Link to="/planos" style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent-text)' }}>{t.regularizar}</Link>
  } else if (emTrial) {
    titulo = t.testeTitulo; texto = t.testeTexto(diasRestantes ?? 0); tag = <Tag cor="amber">Teste</Tag>
    acao = <Link to="/planos" style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent-text)' }}>{t.verPlanos}</Link>
  } else {
    titulo = t.encerradaTitulo; texto = t.encerradaTexto; tag = <Tag cor="cinza">Encerrada</Tag>
    acao = <Link to="/planos" style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent-text)' }}>{t.assinarDeNovo}</Link>
  }

  // Cancelar só faz sentido com cobrança no Asaas (ativa ou pendente), sem cancelamento já agendado.
  const mostrarCancelar = !assinatura.is_cortesia && !cancelaNoFim && (status === 'active' || status === 'past_due')

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={18} color="var(--accent)" />
            <p style={{ fontWeight: 600, fontFamily: 'Syne', fontSize: 15 }}>{t.titulo}</p>
          </div>
          {tag}
        </div>
        <p style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{titulo}</p>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{texto}</p>
        {acao && <div style={{ marginTop: 10 }}>{acao}</div>}
        {mostrarCancelar && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            {podeCancelar ? (
              <button onClick={() => setConfirmando(true)} style={{ fontSize: 14, fontWeight: 500, color: 'var(--red-text)', minHeight: 44 }}>
                {t.cancelar}
              </button>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text3)' }}>{t.soTitular}</p>
            )}
          </div>
        )}
      </div>

      {confirmando && (
        <div className="modal-overlay" onClick={() => !cancelando && setConfirmando(false)}>
          <div className="modal voz-sheet" role="dialog" aria-label={t.confirmTitulo} onClick={e => e.stopPropagation()}>
            <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border2)', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 18, marginBottom: 14 }}>{t.confirmTitulo}</h2>
            <ul style={{ margin: '0 0 12px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, lineHeight: 1.5 }}>
              <li>{t.confirmAcesso(status === 'active' && fim && fim > new Date() ? data(fim) : null)}</li>
              <li>{t.confirmCobranca}</li>
              <li>{t.confirmDados}</li>
            </ul>
            <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 18 }}>{t.confirmReembolso}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Button onClick={() => setConfirmando(false)} disabled={cancelando}>{t.manter}</Button>
              <Button variant="secondary" onClick={cancelar} loading={cancelando} style={{ color: 'var(--red-text)' }}>
                {cancelando ? t.cancelando : t.confirmar}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
