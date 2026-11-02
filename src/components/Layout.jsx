import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, TrendingUp, TrendingDown, CreditCard, FileText, Layers, Calendar,
  LogOut, MoreHorizontal, X, Target, PiggyBank, Settings, CalendarCheck, Repeat, ClipboardCheck, Upload,
} from 'lucide-react'
import { useState } from 'react'
import InstalarApp from './InstalarApp'
import Avatar from './Avatar'

// Itens fixos da barra inferior (uso diário)
const navPrincipal = [
  { to: '/', label: 'Início', icon: LayoutDashboard, exact: true },
  { to: '/gastos', label: 'Gastos', icon: TrendingDown },
  { to: '/entradas', label: 'Entradas', icon: TrendingUp },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
]

// Itens do menu "Mais"
const navMais = [
  { to: '/orcamento', label: 'Orçamento', icon: Target },
  { to: '/contas-fixas', label: 'Contas fixas', icon: FileText },
  { to: '/contas-do-mes', label: 'Contas do mês', icon: CalendarCheck },
  { to: '/parcelamentos', label: 'Parcelamentos', icon: Layers },
  { to: '/importar', label: 'Importar CSV', icon: Upload },
  { to: '/assinaturas', label: 'Assinaturas', icon: Repeat },
  { to: '/fechamento', label: 'Fechamento', icon: ClipboardCheck },
  { to: '/projecao', label: 'Projeção', icon: Calendar },
  { to: '/cofrinhos', label: 'Cofrinhos', icon: PiggyBank },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

export default function Layout() {
  const { perfil, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mais, setMais] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const maisAtivo = navMais.some(n => location.pathname === n.to)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 480, margin: '0 auto', position: 'relative' }}>
      {/* Header */}
      <header style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 10 }}>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: 'var(--accent)', letterSpacing: '-0.02em' }}>HopeFin</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {perfil && (
            <Link to="/configuracoes" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
              <Avatar nome={perfil.nome} foto={perfil.foto_url} size={28} />
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                {perfil.nome.split(' ')[0]}
              </span>
            </Link>
          )}
          <button onClick={handleLogout} style={{ color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {/* Conteúdo */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 100px' }}>
        <Outlet />
      </main>

      {/* Banner instalar PWA */}
      <InstalarApp />

      {/* Nav bottom */}
      <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: 'var(--bg2)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', padding: '8px 0 env(safe-area-inset-bottom)', zIndex: 10 }}>
        {navPrincipal.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              fontSize: 10, fontWeight: 500, padding: '4px 8px',
              color: isActive ? 'var(--accent)' : 'var(--text3)',
              textDecoration: 'none', transition: 'color 0.15s', flex: 1,
            })}
          >
            <Icon size={20} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
        <button
          onClick={() => setMais(true)}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            fontSize: 10, fontWeight: 500, padding: '4px 8px', flex: 1,
            color: maisAtivo ? 'var(--accent)' : 'var(--text3)',
          }}
        >
          <MoreHorizontal size={20} strokeWidth={1.8} />
          Mais
        </button>
      </nav>

      {/* Sheet "Mais" */}
      {mais && (
        <div className="modal-overlay" onClick={() => setMais(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18 }}>Mais</h2>
              <button onClick={() => setMais(false)}><X size={20} color="var(--text2)" /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {navMais.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMais(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '14px',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    background: 'var(--bg)', color: 'var(--text)', textDecoration: 'none',
                    fontSize: 14, fontWeight: 500,
                  }}
                >
                  <Icon size={18} color="var(--accent)" strokeWidth={1.9} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
