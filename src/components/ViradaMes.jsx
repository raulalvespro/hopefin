import { useState } from 'react'
import { CalendarCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { fmt } from '../lib/format'
import { nomeMes, addMeses, arred } from '../lib/motor'
import { copy } from '../copy/pt-BR'

const t = copy.inicio.virada

// Virada do mês (decisão do Raul, 16/11/2026): quando o mês fecha, o app pergunta o que
// fazer com o saldo — somar no mês seguinte, guardar num cofrinho ou deixar como está.
// Se fechou no vermelho, pergunta se leva o negativo pro mês seguinte.
// A8.13 (19/11 noite): conta que ficou SEM PAGAR ainda está no saldo (o dinheiro não saiu).
// A virada mostra essas contas e, marcado "vou pagar no mês que vem", leva o saldo já
// descontado; as contas aparecem em "Em atraso" em Contas do mês até serem pagas.
export default function ViradaMes({ comp, resumo, pendentes = [], cofrinhos, onDecidido }) {
  const { toast } = useToast()
  const [cofrinho, setCofrinho] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [descontar, setDescontar] = useState(true)
  const mes = nomeMes(comp)
  const prox = nomeMes(addMeses(comp, 1))
  const totalPendente = arred(pendentes.reduce((s, p) => s + Number(p.valor || 0), 0))
  const temPendente = totalPendente > 0.004
  const saldo = arred(resumo.saldoDoMes - (temPendente && descontar ? totalPendente : 0))
  const positivo = saldo > 0
  const nomes = pendentes.slice(0, 3).map(p => p.descricao).join(', ') + (pendentes.length > 3 ? ` e mais ${pendentes.length - 3}` : '')

  async function decidir(destino) {
    if (destino === 'cofrinho' && !cofrinho) { toast(t.escolhaCofrinho, 'erro'); return }
    setSalvando(true)
    const { error } = await supabase.rpc('decidir_virada', {
      p_competencia: comp, p_saldo: saldo, p_destino: destino, p_cofrinho: destino === 'cofrinho' ? cofrinho : null,
    })
    setSalvando(false)
    if (error) { toast(error.message?.includes('ja_decidido') ? t.jaDecidido : t.erro, 'erro'); onDecidido?.(); return }
    toast(destino === 'proximo_mes' ? t.okProximo(prox) : destino === 'cofrinho' ? t.okCofrinho : t.okNada, 'ok')
    onDecidido?.()
  }

  return (
    <section className="card" style={{ marginBottom: 12, borderColor: positivo ? 'var(--accent)' : 'var(--red)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <CalendarCheck size={20} color={positivo ? 'var(--accent)' : 'var(--red)'} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>{positivo ? t.tituloSobra(mes, fmt(saldo)) : t.tituloVermelho(mes, fmt(Math.abs(saldo)))}</p>
          <p style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>{positivo ? t.perguntaSobra : t.perguntaVermelho(prox)}</p>
          {temPendente && (
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--amber-dim, var(--bg3))' }}>
              <p style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45 }}>{t.semPagar(mes, fmt(totalPendente), pendentes.length, nomes)}</p>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 6, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={descontar} onChange={e => setDescontar(e.target.checked)} style={{ marginTop: 2 }} />
                <span>{t.descontar(prox)}</span>
              </label>
            </div>
          )}
          {resumo.aReceber > 0.004 && (
            <p style={{ fontSize: 11.5, color: 'var(--amber-text)', marginTop: 6, lineHeight: 1.45 }}>{t.aReceberPendente(mes, fmt(resumo.aReceber))}</p>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn-primary" disabled={salvando} onClick={() => decidir('proximo_mes')}>
          {positivo ? t.somar(prox) : t.levar(prox)}
        </button>
        {positivo && cofrinhos.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={cofrinho} onChange={e => setCofrinho(e.target.value)} style={{ flex: 1 }}>
              <option value="">{t.qualCofrinho}</option>
              {cofrinhos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <button className="btn-ghost" disabled={salvando} onClick={() => decidir('cofrinho')} style={{ whiteSpace: 'nowrap' }}>{t.guardar}</button>
          </div>
        )}
        <button className="btn-ghost" disabled={salvando} onClick={() => decidir('nenhum')}>{t.deixar}</button>
      </div>
    </section>
  )
}
