import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Cadastro from './pages/Cadastro'
import EscolhaGrupo from './pages/EscolhaGrupo'
import Dashboard from './pages/Dashboard'
import Gastos from './pages/Gastos'
import Entradas from './pages/Entradas'
import Cartoes from './pages/Cartoes'
import ContasFixas from './pages/ContasFixas'
import Parcelamentos from './pages/Parcelamentos'
import Projecao from './pages/Projecao'
import Cofrinhos from './pages/Cofrinhos'
import Resumo from './pages/Resumo'
import Configuracoes from './pages/Configuracoes'
import Layout from './components/Layout'

function RotaProtegida({ children }) {
  const { user, loading, precisaGrupo } = useAuth()
  if (loading) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text2)', gap:16 }}>
      <div style={{ width:36, height:36, border:'3px solid var(--border2)', borderTop:'3px solid var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (precisaGrupo) return <EscolhaGrupo />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/" element={<RotaProtegida><Layout /></RotaProtegida>}>
        <Route index element={<Dashboard />} />
        <Route path="resumo" element={<Resumo />} />
        <Route path="gastos" element={<Gastos />} />
        <Route path="entradas" element={<Entradas />} />
        <Route path="cartoes" element={<Cartoes />} />
        <Route path="contas-fixas" element={<ContasFixas />} />
        <Route path="parcelamentos" element={<Parcelamentos />} />
        <Route path="projecao" element={<Projecao />} />
        <Route path="cofrinhos" element={<Cofrinhos />} />
        <Route path="configuracoes" element={<Configuracoes />} />
      </Route>
    </Routes>
  )
}
