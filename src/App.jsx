import { useState, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Cadastro from './pages/Cadastro'
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
import Notificacoes from './pages/Notificacoes'
import Admin from './pages/Admin'
import Legal from './pages/Legal'
import Layout from './components/Layout'
import CookieConsent from './components/CookieConsent'
import DevComponentes from './pages/DevComponentes'
import Splash from './components/Splash'
import Onboarding from './pages/Onboarding'

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

// Guarda do /admin: exige sessão; o próprio Admin confere o papel is_admin.
function RotaAdmin({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text2)' }}>
      <div style={{ width:36, height:36, border:'3px solid var(--border2)', borderTop:'3px solid var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [splash, setSplash] = useState(deveMostrarSplash)
  const fecharSplash = useCallback(() => { marcarSplash(); setSplash(false) }, [])

  return (
    <>
    {splash && <Splash onDone={fecharSplash} />}
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />
      <Route path="/termos" element={<Legal doc="termos" />} />
      <Route path="/privacidade" element={<Legal doc="privacidade" />} />
      <Route path="/admin" element={<RotaAdmin><Admin /></RotaAdmin>} />
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
        <Route path="projecao" element={<Projecao />} />
        <Route path="cofrinhos" element={<Cofrinhos />} />
        <Route path="orcamento" element={<Orcamento />} />
        <Route path="categorias" element={<Categorias />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="meus-dados" element={<MeusDados />} />
        <Route path="planos" element={<Planos />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="fechamento" element={<Fechamento />} />
        <Route path="importar" element={<Importar />} />
        <Route path="historico" element={<Historico />} />
        <Route path="notificacoes" element={<Notificacoes />} />
      </Route>
    </Routes>
    <CookieConsent />
    </>
  )
}
