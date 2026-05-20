import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LayoutDashboard, TrendingUp, TrendingDown, CreditCard, FileText, Layers, Calendar, LogOut } from 'lucide-react'
import { useState } from 'react'

const nav = [
  { to: '/', label: 'Início', icon: LayoutDashboard, exact: true },
  { to: '/entradas', label: 'Entradas', icon: TrendingUp },
  { to: '/gastos', label: 'Gastos', icon: TrendingDown },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
  { to: '/contas-fixas', label: 'Fixas', icon: FileText },
  { to: '/parcelamentos', label: 'Parcelas', icon: Layers },
  { to: '/projecao', label: 'Projeção', icon: Calendar },
]

export default function Layout() {
  const { perfil, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 480, margin: '0 auto', position: 'relative' }}>
      {/* Header */}
      <header style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 10 }}>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: 'var(--accent)', letterSpacing: '-0.02em' }}>HopeFin</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {perfil && (
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>
              {perfil.nome.split(' ')[0]}
            </span>
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

      {/* Nav bottom */}
      <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: 'var(--bg2)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', padding: '8px 0 env(safe-area-inset-bottom)', zIndex: 10 }}>
        {nav.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              fontSize: 10, fontWeight: 500, padding: '4px 8px',
              color: isActive ? 'var(--accent)' : 'var(--text3)',
              textDecoration: 'none', transition: 'color 0.15s',
              flex: 1,
            })}
          >
            <Icon size={20} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
