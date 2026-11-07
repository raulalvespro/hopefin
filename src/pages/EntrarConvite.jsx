import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { guardarConvite, normalizarCodigo } from '../lib/convite'

// Rota pública /entrar?c=CODIGO — destino do link de convite.
// Guarda o código e leva a pessoa para criar a conta (já com "Tenho um convite" marcado)
// ou, se já está logada sem grupo, para a escolha de grupo com o código preenchido.
// Quem já tem grupo vai direto pro app: o convite nunca troca de grupo sozinho.
export default function EntrarConvite() {
  const [params] = useSearchParams()
  const { user, perfil, loading } = useAuth()
  const navigate = useNavigate()
  const codigo = normalizarCodigo(params.get('c'))

  useEffect(() => {
    if (loading) return
    if (!codigo || (user && perfil?.grupo_id)) { navigate('/', { replace: true }); return }
    guardarConvite(codigo)
    navigate(user ? '/' : '/cadastro', { replace: true })
  }, [loading, user, perfil, codigo, navigate])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ width: 36, height: 36, border: '3px solid var(--border2)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'hf-spin .9s linear infinite' }} />
    </div>
  )
}
