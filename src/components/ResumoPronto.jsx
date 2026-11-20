import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { nomeMes, addMeses, compDe, hojeBRT } from '../lib/motor'
import { copy } from '../copy/pt-BR'

const t = copy.inicio.resumoPronto
const chave = (comp) => `hf_resumo_visto_${comp}`
function jaViu(comp) { try { return localStorage.getItem(chave(comp)) === '1' } catch { return false } }
function marcarVisto(comp) { try { localStorage.setItem(chave(comp), '1') } catch { /* sem memória do aparelho: só some ao recarregar */ } }

// A8.14: do dia 1º ao 7, o Início avisa que o resumo do mês anterior chegou (o mesmo do e-mail
// e do push do dia 1º) e leva pro Fechamento daquele mês. Some ao fechar ou ao abrir o resumo.
// Respeita "Resumo do mês" em Notificações e só aparece se o grupo já usava o app naquele mês.
export default function ResumoPronto({ grupoId, inicioComp }) {
  const hoje = hojeBRT()
  const comp = addMeses(compDe(hoje), -1)
  const dia = Number(hoje.slice(8, 10))
  const [mostrar, setMostrar] = useState(false)

  useEffect(() => {
    let vivo = true
    if (!grupoId || dia > 7 || jaViu(comp) || !inicioComp || inicioComp > comp) { setMostrar(false); return undefined }
    supabase.from('preferencias_notificacao').select('alertar_resumo').eq('grupo_id', grupoId).maybeSingle()
      .then(({ data }) => { if (vivo) setMostrar(data?.alertar_resumo !== false) })
    return () => { vivo = false }
  }, [grupoId, comp, dia, inicioComp])

  if (!mostrar) return null
  const fechar = () => { marcarVisto(comp); setMostrar(false) }
  return (
    <section className="card" aria-label={t.titulo(nomeMes(comp))} style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <BarChart3 size={22} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600 }}>{t.titulo(nomeMes(comp))}</p>
        <p style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>{t.texto}</p>
        <Link to={`/fechamento?mes=${comp}`} onClick={() => marcarVisto(comp)}
          style={{ display: 'inline-block', marginTop: 8, fontSize: 13.5, fontWeight: 600, color: 'var(--accent-text)' }}>{t.ver}</Link>
      </div>
      <button onClick={fechar} aria-label={t.fechar} style={{ color: 'var(--text3)', padding: 4, display: 'flex' }}><X size={16} /></button>
    </section>
  )
}
