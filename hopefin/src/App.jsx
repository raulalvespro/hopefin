import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Cadastro from './pages/Cadastro'
import Dashboard from './pages/Dashboard'
import Gastos from './pages/Gastos'
import Entradas from './pages/Entradas'
import Cartoes from './pages/Cartoes'
import ContasFixas from './pages/ContasFixas'
import Parcelamentos from './pages/Parcelamentos'
import Projecao from './pages/Projecao'
import Layout from './components/Layout'

function RotaProtegida({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text2)' }}>Carregando...</div>
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/" element={<RotaProtegida><Layout /></RotaProtegida>}>
        <Route index element={<Dashboard />} />
        <Route path="gastos" element={<Gastos />} />
        <Route path="entradas" element={<Entradas />} />
        <Route path="cartoes" element={<Cartoes />} />
        <Route path="contas-fixas" element={<ContasFixas />} />
        <Route path="parcelamentos" element={<Parcelamentos />} />
        <Route path="projecao" element={<Projecao />} />
      </Route>
    </Routes>
  )
}
