import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { guardarCupom, normalizarCupom } from '../lib/cupom'

// Rota pública /c/CODIGO — link de parceiro (A6.1, 19/11/2026).
// Guarda o cupom e leva pra criar a conta (o cupom é resgatado no 1º acesso, já como cortesia)
// ou, se a pessoa já está logada, pro Meu plano com o cupom preenchido.
export default function EntrarCupom() {
  const { codigo } = useParams()
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    const c = normalizarCupom(codigo)
    if (!c) { navigate('/', { replace: true }); return }
    guardarCupom(c)
    navigate(user ? '/planos' : '/cadastro', { replace: true })
  }, [loading, user, codigo, navigate])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ width: 36, height: 36, border: '3px solid var(--border2)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'hf-spin .9s linear infinite' }} />
    </div>
  )
}
