import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Check, ChevronRight, X, Sparkles, TrendingUp, CreditCard, FileText } from 'lucide-react'

const KEY = 'hopefin_onboarding_dispensado'

export default function Onboarding() {
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const [contagens, setContagens] = useState(null)
  const [dispensado, setDispensado] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })

  useEffect(() => { if (perfil?.grupo_id && !dispensado) carregar() }, [perfil, dispensado])

  async function carregar() {
    const gid = perfil.grupo_id
    const head = tabela => supabase.from(tabela).select('id', { count: 'exact', head: true }).eq('grupo_id', gid)
    const [ent, cart, fix] = await Promise.all([
      head('entradas'),
      head('cartoes').eq('ativo', true),
      head('contas_fixas').eq('ativo', true),
    ])
    setContagens({
      entradas: ent.count || 0,
      cartoes: cart.count || 0,
      fixas: fix.count || 0,
    })
  }

  if (dispensado || !contagens) return null

  const passos = [
    { feito: contagens.entradas > 0, label: 'Registre sua renda', desc: 'Salário e outras entradas', to: '/entradas', icon: TrendingUp },
    { feito: contagens.cartoes > 0, label: 'Cadastre um cartão', desc: 'Para acompanhar as faturas', to: '/cartoes', icon: CreditCard },
    { feito: contagens.fixas > 0, label: 'Adicione contas fixas', desc: 'Aluguel, luz, internet...', to: '/contas-fixas', icon: FileText },
  ]
  const concluidos = passos.filter(p => p.feito).length
  if (concluidos === passos.length) return null  // tudo pronto: some sozinho

  function dispensar() {
    setDispensado(true)
    try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
  }

  return (
    <div className="card" style={{ marginBottom: 20, background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} color="var(--accent)" />
          <p style={{ fontWeight: 700, fontFamily: 'Syne', fontSize: 15 }}>Comece por aqui</p>
        </div>
        <button onClick={dispensar} aria-label="Dispensar" style={{ color: 'var(--text3)', display: 'flex' }}><X size={16} /></button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
        Em 3 passos o HopeFin já mostra o retrato da sua família ({concluidos}/{passos.length} feitos).
      </p>
      {passos.map(p => (
        <button key={p.to} onClick={() => navigate(p.to)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
            borderRadius: 'var(--radius-sm)', background: 'var(--bg2)', border: '1px solid var(--border)',
            marginBottom: 8, textAlign: 'left',
            opacity: p.feito ? 0.6 : 1,
          }}>
          <span style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: p.feito ? 'var(--accent)' : 'var(--bg3)',
          }}>
            {p.feito ? <Check size={15} color="var(--on-accent)" /> : <p.icon size={15} color="var(--accent)" />}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, textDecoration: p.feito ? 'line-through' : 'none' }}>{p.label}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text2)' }}>{p.desc}</span>
          </span>
          {!p.feito && <ChevronRight size={16} color="var(--text3)" />}
        </button>
      ))}
    </div>
  )
}
