import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Copy, Check, Users } from 'lucide-react'

export default function Configuracoes() {
  const { perfil } = useAuth()
  const [copiado, setCopiado] = useState(false)

  const codigoGrupo = perfil?.grupo_id || ''

  function copiar() {
    navigator.clipboard.writeText(codigoGrupo)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div>
      <h2 style={{ fontSize:20, marginBottom:24 }}>Configurações</h2>

      {/* Código do grupo */}
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <Users size={18} color="var(--accent)" />
          <p style={{ fontWeight:600, fontFamily:'Syne', fontSize:15 }}>Convidar para o grupo</p>
        </div>
        <p style={{ fontSize:13, color:'var(--text2)', marginBottom:16, lineHeight:1.6 }}>
          Compartilhe o código abaixo com sua esposa, familiar ou quem quiser convidar. Quando a pessoa entrar no app com o Google, deve escolher "Entrar em um grupo" e colar esse código.
        </p>
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius-sm)', padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <code style={{ fontSize:12, color:'var(--accent)', wordBreak:'break-all', flex:1 }}>{codigoGrupo}</code>
          <button onClick={copiar} style={{ marginLeft:12, color: copiado?'var(--accent)':'var(--text2)', flexShrink:0 }}>
            {copiado ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
        <p style={{ fontSize:12, color:'var(--text3)' }}>Grupo: {perfil?.grupos?.nome}</p>
      </div>

      {/* Info do usuário */}
      <div className="card">
        <p style={{ fontWeight:600, fontFamily:'Syne', fontSize:15, marginBottom:12 }}>Sua conta</p>
        <div style={{ fontSize:13, color:'var(--text2)' }}>
          <p style={{ marginBottom:6 }}><strong style={{ color:'var(--text)' }}>Nome:</strong> {perfil?.nome}</p>
          <p><strong style={{ color:'var(--text)' }}>E-mail:</strong> {perfil?.email}</p>
        </div>
      </div>
    </div>
  )
}
