import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTema } from '../contexts/ThemeContext'
import { Copy, Check, Users, Tags, ChevronRight, Sun, Moon, Monitor, Palette, Database } from 'lucide-react'

const OPCOES_TEMA = [
  { v: 'auto', label: 'Automático', icon: Monitor },
  { v: 'light', label: 'Claro', icon: Sun },
  { v: 'dark', label: 'Escuro', icon: Moon },
]

export default function Configuracoes() {
  const { perfil } = useAuth()
  const { tema, setTema } = useTema()
  const [copiado, setCopiado] = useState(false)

  const codigoGrupo = perfil?.grupos?.codigo || ''

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

      {/* Aparência / tema */}
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <Palette size={18} color="var(--accent)" />
          <p style={{ fontWeight:600, fontFamily:'Syne', fontSize:15 }}>Aparência</p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          {OPCOES_TEMA.map(({ v, label, icon: Icon }) => {
            const ativo = tema === v
            return (
              <button key={v} onClick={() => setTema(v)}
                style={{
                  display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'14px 8px',
                  borderRadius:'var(--radius-sm)', fontSize:12, fontWeight:600,
                  border:`1.5px solid ${ativo ? 'var(--accent)' : 'var(--border2)'}`,
                  background: ativo ? 'var(--accent-dim)' : 'var(--bg3)',
                  color: ativo ? 'var(--accent)' : 'var(--text2)',
                }}>
                <Icon size={20} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Categorias */}
      <Link to="/categorias" className="card" style={{ marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between', textDecoration:'none', color:'var(--text)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Tags size={18} color="var(--accent)" />
          <div>
            <p style={{ fontWeight:600, fontFamily:'Syne', fontSize:15 }}>Categorias</p>
            <p style={{ fontSize:12, color:'var(--text2)' }}>Criar e editar as categorias de gastos</p>
          </div>
        </div>
        <ChevronRight size={18} color="var(--text3)" />
      </Link>

      {/* Meus dados (exportar / excluir) */}
      <Link to="/meus-dados" className="card" style={{ marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between', textDecoration:'none', color:'var(--text)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Database size={18} color="var(--accent)" />
          <div>
            <p style={{ fontWeight:600, fontFamily:'Syne', fontSize:15 }}>Meus dados</p>
            <p style={{ fontSize:12, color:'var(--text2)' }}>Exportar um backup ou apagar seus dados</p>
          </div>
        </div>
        <ChevronRight size={18} color="var(--text3)" />
      </Link>

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
