import { Outlet, NavLink, useNavigate, Link, useLocation, Navigate } from 'react-router-dom'
import { tourVisto } from '../lib/tour'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, TrendingUp, TrendingDown, CreditCard, FileText, Layers, Calendar,
  LogOut, MoreHorizontal, X, Target, PiggyBank, Settings, CalendarCheck, Repeat, ClipboardCheck, Bell, Clock, History, Coins,
  ChevronRight, Database, Users, Sparkles, LifeBuoy,
} from 'lucide-react'
import { useState } from 'react'
import InstalarApp from './InstalarApp'
import AtivarNotificacoes from './AtivarNotificacoes'
import AvisoOffline from './AvisoOffline'
import Avatar from './Avatar'
import Logo from './Logo'
import BannerAssinatura from './BannerAssinatura'
import Ajuda, { EVENTO_ABRIR_AJUDA } from './Ajuda'
import { useFlags } from '../hooks/useFlags'
import { useAlertas } from '../hooks/useAlertas'
import { useAssinatura } from '../hooks/useAssinatura'
import { fmtData } from '../lib/format'
import { copy } from '../copy/pt-BR'

const tmc = copy.minhaConta

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
    { to: '/a-receber', label: 'A receber', icon: Coins },
  ] },
  { secao: 'Metas', itens: [
    { to: '/cofrinhos', label: 'Cofrinhos', icon: PiggyBank },
  ] },
  { secao: 'Acompanhar', itens: [
    { to: '/historico', label: 'Histórico', icon: History },
  ] },
  // Configurações saiu daqui (A8.12): fica no menu "Minha conta", na foto do perfil.
]

// Menu "Minha conta" (A8.12)
const itensConta = [
  { to: '/configuracoes', label: tmc.configuracoes, sub: tmc.configuracoesSub, icon: Settings },
  { to: '/pessoas', label: tmc.pessoas, sub: tmc.pessoasSub, icon: Users },
  { to: '/meus-dados', label: tmc.meusDados, sub: tmc.meusDadosSub, icon: Database },
]

export default function Layout() {
  const { perfil, user, logout, loading: carregandoAuth, erroPerfil, carregarPerfil } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mais, setMais] = useState(false)
  const [conta, setConta] = useState(false) // menu "Minha conta" (A8.12)
  const plano = useAssinatura()
  const flags = useFlags() // botão de Ajuda só com a chave "ajuda" (L29), até o Raul liberar
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
        <Link to="/" aria-label="Ir para o Início" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Logo size={24} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Ajuda + perguntas frequentes da tela + chamados (L29) */}
          {flags?.ajuda && <Ajuda flags={flags} />}
          {/* Sininho de alertas */}
          <div style={{ position: 'relative', display: 'flex' }}>
            <button onClick={abrirAlertas} title="Alertas" style={{ position: 'relative', color: alertasAbertos ? 'var(--accent-text)' : 'var(--text2)', display: 'flex', alignItems: 'center' }}>
              <Bell size={19} />
              {alertas.length > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -6, minWidth: 16, height: 16, padding: '0 4px',
                  borderRadius: 8, background: temUrgente ? '#dc2626' : '#b45309', color: '#fff',
                  fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{alertas.length}</span>
              )}
            </button>

            {alertasAbertos && (
              <>
                <div onClick={() => setAlertasAbertos(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'fixed', top: 62, right: 'max(12px, calc(50vw - 228px))', width: 'min(320px, calc(100vw - 24px))', zIndex: 50,
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
                    <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
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
                            style={{ flex: 1, padding: '0 11px', color: 'var(--text2)', display: 'flex', alignItems: 'center' }}>
                            <Clock size={14} />
                          </button>
                          <button onClick={() => dispensar(a.id)} title="Dispensar"
                            style={{ flex: 1, padding: '0 11px', color: 'var(--text2)', display: 'flex', alignItems: 'center' }}>
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
            <button onClick={() => setConta(true)} aria-label={tmc.abrir} title={tmc.abrir} style={{ display: 'flex', alignItems: 'center', borderRadius: '50%' }}>
              <Avatar nome={perfil.nome} foto={perfil.foto_url} size={30} />
            </button>
          )}
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
              color: isActive ? 'var(--accent-text)' : 'var(--text2)',
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
            color: maisAtivo ? 'var(--accent-text)' : 'var(--text2)',
          }}
        >
          <MoreHorizontal size={20} strokeWidth={1.8} />
          Mais
        </button>
      </nav>

      {/* Menu "Minha conta" (A8.12) — na foto do perfil */}
      {conta && perfil && (
        <div className="modal-overlay" onClick={() => setConta(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-label={tmc.titulo}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18 }}>{tmc.titulo}</h2>
              <button onClick={() => setConta(false)} aria-label={tmc.fechar}><X size={20} color="var(--text2)" /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <Avatar nome={perfil.nome} foto={perfil.foto_url} size={52} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 17 }}>{perfil.nome}</p>
                {user?.email && <p style={{ fontSize: 12.5, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>}
                {perfil.grupos?.nome && <p style={{ fontSize: 12, color: 'var(--text2)' }}>{tmc.grupo(perfil.grupos.nome)}</p>}
              </div>
            </div>
            {!plano.loading && (
              <Link to="/planos" onClick={() => setConta(false)} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, textDecoration: 'none', color: 'var(--text)', background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
                <Sparkles size={18} color="var(--accent-text)" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontFamily: 'Syne', fontSize: 14 }}>{tmc.meuPlano}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)' }}>{(() => {
                    const r = tmc.plano[plano.estado] ?? tmc.plano.sem_assinatura
                    if (typeof r !== 'function') return r
                    if (plano.estado === 'trial') return r(plano.diasRestantes)
                    const d = plano.estado === 'ativa' ? plano.renovaEm : plano.terminaEm
                    return r(d ? fmtData(String(d).slice(0, 10), 'dd/MM/yyyy') : '')
                  })()}</span>
                </span>
                <ChevronRight size={16} color="var(--text3)" />
              </Link>
            )}
            {itensConta.map(({ to, label, sub, icon: Icon }) => (
              <Link key={to} to={to} onClick={() => setConta(false)} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, textDecoration: 'none', color: 'var(--text)' }}>
                <Icon size={18} color="var(--accent)" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontFamily: 'Syne', fontSize: 14 }}>{label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)' }}>{sub}</span>
                </span>
                <ChevronRight size={16} color="var(--text3)" />
              </Link>
            ))}
            {/* Ajuda e atendimento (mesma folha do botão "Ajuda" do topo) */}
            {flags?.ajuda && (
              <button type="button" onClick={() => { setConta(false); window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_AJUDA, { detail: { vista: 'inicio' } })) }}
                className="card" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, textAlign: 'left', color: 'var(--text)' }}>
                <LifeBuoy size={18} color="var(--accent)" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontFamily: 'Syne', fontSize: 14 }}>{copy.ajuda.menuConta}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)' }}>{copy.ajuda.menuContaSub}</span>
                </span>
                <ChevronRight size={16} color="var(--text3)" />
              </button>
            )}
            <button onClick={() => { setConta(false); handleLogout() }} className="btn-ghost" style={{ width: '100%', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--red-text)' }}>
              <LogOut size={16} /> {tmc.sair}
            </button>
          </div>
        </div>
      )}

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
                <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 2px 8px' }}>{secao}</p>
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
