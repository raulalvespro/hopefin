import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

// Página pública do "não quero receber novidades por e-mail" (A8.15, LGPD). O link vem no rodapé
// do e-mail de comunicado (assinado por pessoa); funciona sem login.
export default function SairComunicados() {
  const [params] = useSearchParams()
  const [estado, setEstado] = useState('carregando') // carregando | ok | erro

  useEffect(() => {
    supabase.functions.invoke('comunicado-sair', { body: { u: params.get('u'), t: params.get('t') } })
      .then(({ data, error }) => setEstado(!error && data?.ok ? 'ok' : 'erro'))
  }, [params])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--bg)' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', textAlign: 'center', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><Logo /></div>
        {estado === 'carregando' && <p style={{ color: 'var(--text2)' }}>Um instante…</p>}
        {estado === 'ok' && (
          <>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Pronto, você saiu da lista</h1>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
              Não vamos mais mandar novidades do HopeFin por e-mail. Avisos da sua conta (como cobrança e senha) continuam chegando.
              Mudou de ideia? Dá pra ligar de novo em Notificações, dentro do app.
            </p>
          </>
        )}
        {estado === 'erro' && (
          <>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Esse link não funcionou</h1>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
              Entre no app e desligue em Notificações › Novidades do HopeFin por e-mail. Ou responda o e-mail que a gente tira você da lista.
            </p>
          </>
        )}
        <Link to="/" style={{ display: 'inline-block', marginTop: 18, fontSize: 14, color: 'var(--accent-text)', fontWeight: 600 }}>Abrir o HopeFin</Link>
      </div>
    </div>
  )
}
