import { useState, useCallback, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { supabase } from './lib/supabase'
import { ehLinkDeRecuperacao } from './lib/acesso'
import { useFlags } from './hooks/useFlags'
import Login from './pages/Login'
import Cadastro from './pages/Cadastro'
import EntrarConvite from './pages/EntrarConvite'
import EntrarCupom from './pages/EntrarCupom'
import Tour from './pages/Tour'
import RedefinirSenha from './pages/RedefinirSenha'
import EscolhaGrupo from './pages/EscolhaGrupo'
import Dashboard from './pages/Dashboard'
import Gastos from './pages/Gastos'
import Entradas from './pages/Entradas'
import Cartoes from './pages/Cartoes'
import ContasFixas from './pages/ContasFixas'
import ContasDoMes from './pages/ContasDoMes'
import Assinaturas from './pages/Assinaturas'
import Parcelamentos from './pages/Parcelamentos'
import Projecao from './pages/Projecao'
import Cofrinhos from './pages/Cofrinhos'
import Orcamento from './pages/Orcamento'
import Categorias from './pages/Categorias'
import Configuracoes from './pages/Configuracoes'
import MeusDados from './pages/MeusDados'
import Planos from './pages/Planos'
import Checkout from './pages/Checkout'
import Fechamento from './pages/Fechamento'
import Importar from './pages/Importar'
import Historico from './pages/Historico'
import AReceber from './pages/AReceber'
import Pessoas from './pages/Pessoas'
import Notificacoes from './pages/Notificacoes'
import Legal from './pages/Legal'
import Layout from './components/Layout'
import CookieConsent from './components/CookieConsent'
import DevComponentes from './pages/DevComponentes'
import Splash from './components/Splash'
import Onboarding from './pages/Onboarding'
import BoasVindas from './pages/BoasVindas'

// Abertura (splash): mostra 1x por dia, sem tocar na auth.
const hojeStr = () => new Date().toISOString().slice(0, 10)
function deveMostrarSplash() {
  try { return localStorage.getItem('hopefin_splash') !== hojeStr() } catch { return false }
}
function marcarSplash() {
  try { localStorage.setItem('hopefin_splash', hojeStr()) } catch { /* ignore */ }
}
// Onboarding: já visto? (default true em erro, pra nunca prender o usuário num loop)
function jaViuOnboarding() {
  try { return localStorage.getItem('hopefin_onboarded') === '1' } catch { return true }
}

// Tela que só existe pra quem tem a chave de recurso (Área de desenvolvimento do /admin).
// Enquanto as chaves carregam não mostra nada; sem a chave, volta pra `senao`.
function SoComChave({ chave, senao = '/', children }) {
  const flags = useFlags()
  if (flags === null) return null
  return flags[chave] ? children : <Navigate to={senao} replace />
}

function RotaProtegida({ children }) {
  const { user, loading, precisaGrupo } = useAuth()
  if (loading) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text2)', gap:16 }}>
      <div style={{ width:36, height:36, border:'3px solid var(--border2)', borderTop:'3px solid var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if (!user) return <Navigate to={jaViuOnboarding() ? '/login' : '/onboarding'} replace />
  if (precisaGrupo) return <EscolhaGrupo />
  return children
}

// O painel do dono mora em admin.hopefin.com.br, com o código do celular (2 etapas). O /admin
// antigo dentro do app abria só com a senha (L37, 19/11/2026): agora só leva pra lá.
function IrParaPainel() {
  useEffect(() => {
    const local = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    // Leva a aba junto (ex.: a notificação de chamado novo abre /admin?aba=suporte).
    const aba = new URLSearchParams(window.location.search).get('aba')
    const q = aba && /^[a-z]+$/.test(aba) ? `aba=${aba}` : ''
    window.location.replace(local ? `/?admin=1${q ? `&${q}` : ''}` : `https://admin.hopefin.com.br${q ? `/?${q}` : ''}`)
  }, [])
  return null
}

// A6.4: o link do "Esqueci minha senha" sempre termina em "Criar uma nova senha", mesmo se cair
// em outra página do app (ex.: o Supabase devolve pra página inicial). Sem isso a pessoa entrava
// logada e nunca era levada a trocar a senha. O endereço é lido aqui, ao carregar o app, antes de o
// supabase-js limpar o "#...type=recovery"; e o evento PASSWORD_RECOVERY cobre o resto.
let recuperacaoPendente = typeof window !== 'undefined' && ehLinkDeRecuperacao(window.location.hash, window.location.search)
function PortaoRecuperacao() {
  const nav = useNavigate()
  const navRef = useRef(nav)
  navRef.current = nav
  useEffect(() => {
    const irPraNovaSenha = () => {
      if (window.location.pathname !== '/redefinir-senha') navRef.current('/redefinir-senha', { replace: true })
    }
    if (recuperacaoPendente) { recuperacaoPendente = false; irPraNovaSenha() }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') irPraNovaSenha()
    })
    return () => subscription.unsubscribe()
  }, [])
  return null
}

// Subdomínio do painel: em admin.hopefin.com.br, depois que o admin loga e cai na home,
// mandamos pro /admin. Só redireciona quem é admin — não-admin fica na home (sem loop).
function PortaoAdminHost() {
  const { perfil } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  useEffect(() => {
    if (typeof window !== 'undefined' &&
        window.location.hostname === 'admin.hopefin.com.br' &&
        perfil?.is_admin && loc.pathname === '/') {
      nav('/admin', { replace: true })
    }
  }, [perfil, loc.pathname, nav])
  return null
}

export default function App() {
  const [splash, setSplash] = useState(deveMostrarSplash)
  const fecharSplash = useCallback(() => { marcarSplash(); setSplash(false) }, [])

  return (
    <>
    <PortaoAdminHost />
    <PortaoRecuperacao />
    {splash && <Splash onDone={fecharSplash} />}
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/entrar" element={<EntrarConvite />} />
      <Route path="/c/:codigo" element={<EntrarCupom />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/tour" element={<RotaProtegida><Tour /></RotaProtegida>} />
      <Route path="/boas-vindas" element={<RotaProtegida><BoasVindas /></RotaProtegida>} />
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />
      <Route path="/termos" element={<Legal doc="termos" />} />
      <Route path="/privacidade" element={<Legal doc="privacidade" />} />
      <Route path="/admin" element={<IrParaPainel />} />
      {import.meta.env.DEV && <Route path="/dev/componentes" element={<DevComponentes />} />}
      <Route path="/" element={<RotaProtegida><Layout /></RotaProtegida>}>
        <Route index element={<Dashboard />} />
        <Route path="gastos" element={<Gastos />} />
        <Route path="entradas" element={<Entradas />} />
        <Route path="cartoes" element={<Cartoes />} />
        <Route path="contas-fixas" element={<ContasFixas />} />
        <Route path="contas-do-mes" element={<ContasDoMes />} />
        <Route path="assinaturas" element={<Assinaturas />} />
        <Route path="parcelamentos" element={<Parcelamentos />} />
        <Route path="a-receber" element={<AReceber />} />
        <Route path="pessoas" element={<Pessoas />} />
        <Route path="projecao" element={<Projecao />} />
        <Route path="cofrinhos" element={<Cofrinhos />} />
        <Route path="orcamento" element={<Orcamento />} />
        <Route path="categorias" element={<Categorias />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="meus-dados" element={<MeusDados />} />
        <Route path="planos" element={<Planos />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="fechamento" element={<Fechamento />} />
        <Route path="importar" element={<SoComChave chave="importar" senao="/gastos"><Importar /></SoComChave>} />
        <Route path="historico" element={<Historico />} />
        <Route path="notificacoes" element={<Notificacoes />} />
      </Route>
    </Routes>
    <CookieConsent />
    </>
  )
}
