import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Users, Wallet, Package, Ticket, LifeBuoy, Shield, Webhook, Activity,
  Menu, X, Sun, Moon, LogOut, Loader, ShieldAlert, RefreshCw, TrendingUp,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTema } from '../contexts/ThemeContext'
import AdminLogin from './AdminLogin'
import Guard2FA from './Guard2FA'
import { ehPrevia } from './host'
import { VisaoGeral, Grupos, Administradores, Cupons, Webhooks, Custos, Servicos, Receitas, Suporte, EmConstrucao } from './secoes'
import './painel.css'

const MENU = [
  { grupo: 'Principal', itens: [{ id: 'visao', nome: 'Visão geral', icon: LayoutDashboard }] },
  { grupo: 'Clientes', itens: [{ id: 'grupos', nome: 'Clientes', icon: Users }] },
  { grupo: 'Financeiro', itens: [{ id: 'receitas', nome: 'Receitas', icon: TrendingUp }, { id: 'custos', nome: 'Custos', icon: Wallet }, { id: 'servicos', nome: 'Serviços & créditos', icon: Package }] },
  { grupo: 'Crescimento', itens: [{ id: 'cupons', nome: 'Cupons', icon: Ticket }] },
  { grupo: 'Atendimento', itens: [{ id: 'suporte', nome: 'Suporte', icon: LifeBuoy }] },
  { grupo: 'Sistema', itens: [{ id: 'admins', nome: 'Administradores', icon: Shield }, { id: 'webhooks', nome: 'Webhooks', icon: Webhook }, { id: 'saude', nome: 'Saúde', icon: Activity }] },
]
const TITULOS = { visao: 'Visão geral', grupos: 'Clientes', receitas: 'Receitas', custos: 'Custos', servicos: 'Serviços & créditos', cupons: 'Cupons', suporte: 'Suporte', admins: 'Administradores', webhooks: 'Webhooks', saude: 'Saúde do sistema' }

function Centro({ children }) {
  return <div className="adm" style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</div>
}

function AcessoNegado({ email, onSair }) {
  return (
    <div className="adm-auth">
      <div className="adm-auth-card" style={{ textAlign: 'center' }}>
        <ShieldAlert size={34} color="var(--red)" style={{ margin: '0 auto 10px' }} />
        <h1 style={{ fontSize: 20 }}>Acesso restrito</h1>
        <p className="sub">A conta <strong>{email}</strong> não é administradora do HopeFin. Se precisa de acesso, peça para um admin te liberar.</p>
        <button className="btn-ghost" onClick={onSair} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LogOut size={15} /> Sair</button>
      </div>
    </div>
  )
}

export default function AdminApp() {
  const { user, perfil, loading, logout } = useAuth()
  if (loading) return <Centro><Loader size={28} className="spin" color="var(--accent)" /></Centro>
  if (!user) return <AdminLogin />
  if (!perfil?.is_admin) return <AcessoNegado email={perfil?.email || user.email} onSair={logout} />
  return <Guard2FA><Painel logout={logout} email={perfil.email} /></Guard2FA>
}

function Painel({ logout, email }) {
  const { tema, setTema } = useTema()
  const [aba, setAba] = useState('visao')
  const [sideAberta, setSideAberta] = useState(false)
  const [metr, setMetr] = useState(null)
  const [consumo, setConsumo] = useState(null)
  const [cupons, setCupons] = useState([])
  const [webhooks, setWebhooks] = useState([])
  const [carregando, setCarregando] = useState(true)

  // noindex: o painel nunca deve ser indexado.
  useEffect(() => {
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex, nofollow'
    document.head.appendChild(m); return () => { document.head.removeChild(m) }
  }, [])

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [mt, cs, cp, wh] = await Promise.all([
      supabase.rpc('admin_metricas'), supabase.rpc('admin_consumo_mes'),
      supabase.rpc('admin_cupons'), supabase.rpc('admin_webhooks'),
    ])
    setMetr(mt.data); setConsumo(cs.data); setCupons(cp.data || []); setWebhooks(wh.data || [])
    setCarregando(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  function ir(id) { setAba(id); setSideAberta(false) }
  const escuro = tema === 'dark'

  return (
    <div className="adm">
      {sideAberta && <div className="adm-scrim" onClick={() => setSideAberta(false)} />}
      <aside className={`adm-side ${sideAberta ? 'aberta' : ''}`}>
        <div className="adm-logo">HopeFin <span className="pill">ADMIN{ehPrevia() ? ' · PRÉVIA' : ''}</span></div>
        {MENU.map(g => (
          <div className="adm-grp" key={g.grupo}>
            <div className="adm-grp-tit">{g.grupo}</div>
            {g.itens.map(it => (
              <button key={it.id} className={`adm-nav ${aba === it.id ? 'on' : ''}`} onClick={() => ir(it.id)}>
                <it.icon size={17} /> {it.nome}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <div className="adm-main">
        <header className="adm-top">
          <button className="adm-icbtn adm-burger" onClick={() => setSideAberta(true)} aria-label="Menu"><Menu size={20} /></button>
          <h1>{TITULOS[aba]}</h1>
          <span className="email">{email}</span>
          <button className="adm-icbtn" onClick={() => setTema(escuro ? 'light' : 'dark')} aria-label="Tema">{escuro ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="adm-icbtn" onClick={carregar} aria-label="Atualizar"><RefreshCw size={17} className={carregando ? 'spin' : ''} /></button>
          <button className="adm-icbtn" onClick={logout} aria-label="Sair"><LogOut size={18} /></button>
        </header>

        <main className="adm-body">
          {aba === 'visao' && <VisaoGeral metr={metr} consumo={consumo} recarregar={carregar} />}
          {aba === 'grupos' && <Grupos />}
          {aba === 'cupons' && <Cupons cupons={cupons} recarregar={carregar} />}
          {aba === 'admins' && <Administradores />}
          {aba === 'webhooks' && <Webhooks webhooks={webhooks} />}
          {aba === 'receitas' && <Receitas />}
          {aba === 'custos' && <Custos />}
          {aba === 'servicos' && <Servicos />}
          {aba === 'suporte' && <Suporte />}
          {aba === 'saude' && <EmConstrucao titulo="Saúde do sistema" etapa={5} descricao="Checagem de hora em hora: sites/funções no ar, crons rodando, falhas de IA, inadimplência e alertas por e-mail." />}
        </main>
      </div>
    </div>
  )
}
