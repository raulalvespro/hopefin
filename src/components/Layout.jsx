import { Outlet, NavLink, useNavigate, Link, useLocation, Navigate } from 'react-router-dom'
import { tourVisto } from '../lib/tour'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, TrendingUp, TrendingDown, CreditCard, FileText, Layers, Calendar,
  LogOut, MoreHorizontal, X, Target, PiggyBank, Settings, CalendarCheck, Repeat, ClipboardCheck, Bell, Clock, History,
} from 'lucide-react'
import { useState } from 'react'
import InstalarApp from './InstalarApp'
import AtivarNotificacoes from './AtivarNotificacoes'
import AvisoOffline from './AvisoOffline'
import Avatar from './Avatar'
import Logo from './Logo'
import BannerAssinatura from './BannerAssinatura'
import { useAlertas } from '../hooks/useAlertas'

const COR_SEV = { vencido: 'var(--red)', estourou: 'var(--red)', vence: 'var(--amber)', quase: 'var(--amber)', info: 'var(--blue)', ok: 'var(--accent)' }
const fmtBRL = v => (v == null ? null : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))

// Itens fixos da barra inferior (uso diário)
const navPrincipal = [
  { to: '/', label: 'Início', icon: LayoutDashboard, exact: true },
  { to: '/gastos', label: 'Gastos', icon: TrendingDown },
  { to: '/entradas', label: 'Entradas', icon: TrendingUp },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
]

// Menu "Mais" agrupado por seção
const navMais = [
  { secao: 'Planejamento', itens: [
    { to: '/orcamento', label: 'Orçamento', icon: Target },
    { to: '/projecao', label: 'Projeção', icon: Calendar },
    { to: '/fechamento', label: 'Fechamento', icon: ClipboardCheck },
  ] },
  { secao: 'Compromissos', itens: [
    { to: '/contas-fixas', label: 'Contas fixas', icon: FileText },
    { to: '/contas-do-mes', label: 'Contas do mês', icon: CalendarCheck },
    { to: '/parcelamentos', label: 'Parcelamentos', icon: Layers },
    { to: '/assinaturas', label: 'Assinaturas', icon: Repeat },
  ] },
  { secao: 'Metas', itens: [
    { to: '/cofrinhos', label: 'Cofrinhos', icon: PiggyBank },
  ] },
  { secao: 'Acompanhar', itens: [
    { to: '/historico', label: 'Histórico', icon: History },
  ] },
  { secao: 'Conta', itens: [
    { to: '/configuracoes', label: 'Configurações', icon: Settings },
  ] },
]

export default function Layout() {
  const { perfil, user, logout, loading: carregandoAuth, erroPerfil, carregarPerfil } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mais, setMais] = useState(false)
  const [alertasAbertos, setAlertasAbertos] = useState(false)
  const { alertas, recarregar: recarregarAlertas, dispensar, snoozeAmanha, dispensarTodos } = useAlertas()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  function abrirAlertas() {
    setAlertasAbertos(a => {
      if (!a) recarregarAlertas()   // atualiza ao abrir (ex: após pagar algo)
      return !a
    })
  }

  function irPara(destino) {
    setAlertasAbertos(false)
    navigate(destino)
  }

  const temUrgente = alertas.some(a => a.severidade === 'vencido' || a.severidade === 'estourou')
  // Tour guiado: aparece uma vez por conta, no primeiro acesso (ver pages/Tour.jsx).
  if (user && !tourVisto(user.id)) return <Navigate to="/tour" replace />

  // Perfil não carregou (e não está carregando): em vez de um esqueleto eterno, diz o motivo.
  if (user && !perfil && !carregandoAuth) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
        <div className="card" style={{ maxWidth: 420, width: '100%', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
          <h2 style={{ fontSize: 20 }}>Não consegui carregar a sua conta</h2>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.5 }}>Seus dados estão guardados. Tente de novo; se continuar assim, mande esta mensagem para o suporte:</p>
          <code style={{ fontSize: 12, background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', wordBreak: 'break-word', textAlign: 'left' }}>{erroPerfil || 'sem detalhes (perfil vazio)'}</code>
          <button className="btn-primary" onClick={() => carregarPerfil(user)} style={{ minHeight: 44 }}>Tentar de novo</button>
          <button onClick={handleLogout} style={{ fontSize: 14, color: 'var(--text2)', minHeight: 44 }}>Sair</button>
        </div>
      </div>
    )
  }

  const maisAtivo = navMais.some(sec => sec.itens.some(n => location.pathname === n.to))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 480, margin: '0 auto', position: 'relative' }}>
      {/* Header */}
      <header style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 10 }}>
        <Logo size={24} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Sininho de alertas */}
          <div style={{ position: 'relative', display: 'flex' }}>
            <button onClick={abrirAlertas} title="Alertas" style={{ position: 'relative', color: alertasAbertos ? 'var(--accent)' : 'var(--text3)', display: 'flex', alignItems: 'center' }}>
              <Bell size={19} />
              {alertas.length > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -6, minWidth: 16, height: 16, padding: '0 4px',
                  borderRadius: 8, background: temUrgente ? 'var(--red)' : 'var(--amber)', color: '#fff',
                  fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{alertas.length}</span>
              )}
            </button>

            {alertasAbertos && (
              <>
                <div onClick={() => setAlertasAbertos(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 12px)', right: -8, width: 'min(320px, 86vw)', zIndex: 50,
                  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.25)', maxHeight: '70vh', overflowY: 'auto',
                }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 14 }}>Alertas</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {alertas.length > 0 && (
                        <button onClick={dispensarTodos} style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 500 }}>Limpar todos</button>
                      )}
                      <button onClick={() => setAlertasAbertos(false)}><X size={16} color="var(--text3)" /></button>
                    </div>
                  </div>
                  {alertas.length === 0 ? (
                    <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                      Tudo em dia por aqui 🎉
                    </div>
                  ) : (
                    alertas.map(a => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${COR_SEV[a.severidade] || 'var(--border2)'}` }}>
                        <button onClick={() => irPara(a.destino)}
                          style={{ flex: 1, minWidth: 0, textAlign: 'left', display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 4px 12px 13px' }}>
                          <span style={{ fontSize: 18, lineHeight: 1.2, flexShrink: 0 }}>{a.emoji}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)' }}>{a.titulo}</span>
                              {a.valor != null && <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Syne', color: COR_SEV[a.severidade] || 'var(--text)', flexShrink: 0 }}>{fmtBRL(a.valor)}</span>}
                            </div>
                            <p style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>{a.descricao}</p>
                          </div>
                        </button>
                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                          <button onClick={() => snoozeAmanha(a.id)} title="Lembrar amanhã"
                            style={{ flex: 1, padding: '0 11px', color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
                            <Clock size={14} />
                          </button>
                          <button onClick={() => dispensar(a.id)} title="Dispensar"
                            style={{ flex: 1, padding: '0 11px', color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                  <button onClick={() => irPara('/historico')}
                    style={{ width: '100%', padding: '11px 16px', fontSize: 12.5, color: 'var(--accent-text)', fontWeight: 500, textAlign: 'center', borderTop: alertas.length > 0 ? '1px solid var(--border)' : 'none' }}>
                    Ver histórico
                  </button>
                </div>
              </>
            )}
          </div>

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
        {/* Avisos clicáveis no topo: instalar o app e ativar notificações */}
        <InstalarApp />
        <AtivarNotificacoes />
        <AvisoOffline />
        <BannerAssinatura />
        <Outlet />
      </main>

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
            {navMais.map(({ secao, itens }) => (
              <div key={secao} style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 2px 8px' }}>{secao}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {itens.map(({ to, label, icon: Icon }) => (
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
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
