import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTema } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import ConviteGrupo from '../components/ConviteGrupo'
import AssinaturaCard from '../components/AssinaturaCard'
import { Tags, ChevronRight, Sun, Moon, Monitor, Palette, Database, Sparkles, Camera, Bell, Upload } from 'lucide-react'

// Redimensiona (corte quadrado central) para um data URL leve.
function redimensionar(file, max = 160) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()
    reader.onload = () => { img.src = reader.result }
    reader.onerror = reject
    img.onload = () => {
      const lado = Math.min(img.width, img.height)
      const sx = (img.width - lado) / 2, sy = (img.height - lado) / 2
      const canvas = document.createElement('canvas')
      canvas.width = max; canvas.height = max
      canvas.getContext('2d').drawImage(img, sx, sy, lado, lado, 0, 0, max, max)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = reject
    reader.readAsDataURL(file)
  })
}

const OPCOES_TEMA = [
  { v: 'auto', label: 'Automático', icon: Monitor },
  { v: 'light', label: 'Claro', icon: Sun },
  { v: 'dark', label: 'Escuro', icon: Moon },
]

export default function Configuracoes() {
  const { perfil, user, carregarPerfil } = useAuth()
  const { tema, setTema } = useTema()
  const { toast } = useToast()
  const [salvandoFoto, setSalvandoFoto] = useState(false)
  const fotoRef = useRef(null)

  async function salvarFoto(novaUrl, msg) {
    setSalvandoFoto(true)
    const { error } = await supabase.from('usuarios').update({ foto_url: novaUrl }).eq('id', perfil.id)
    if (error) { toast('Não foi possível salvar a foto.', 'erro'); setSalvandoFoto(false); return }
    await carregarPerfil(user)
    toast(msg, 'ok')
    setSalvandoFoto(false)
  }

  async function aoEscolherFoto(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('Escolha um arquivo de imagem.', 'erro'); return }
    try {
      const dataUrl = await redimensionar(file)
      await salvarFoto(dataUrl, 'Foto atualizada')
    } catch { toast('Não foi possível processar a imagem.', 'erro') }
  }

  return (
    <div>
      <h2 style={{ fontSize:20, marginBottom:24 }}>Configurações</h2>

      {/* Convidar para o grupo (código + membros) */}
      <ConviteGrupo />

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

      {/* Notificações */}
      <Link to="/notificacoes" className="card" style={{ marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between', textDecoration:'none', color:'var(--text)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Bell size={18} color="var(--accent)" />
          <div>
            <p style={{ fontWeight:600, fontFamily:'Syne', fontSize:15 }}>Notificações</p>
            <p style={{ fontSize:12, color:'var(--text2)' }}>Escolher quais alertas aparecem no sininho</p>
          </div>
        </div>
        <ChevronRight size={18} color="var(--text3)" />
      </Link>

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

      {/* Minha assinatura (ver status e cancelar) */}
      <AssinaturaCard />

      {/* Planos e assinatura */}
      <Link to="/planos" className="card" style={{ marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between', textDecoration:'none', color:'var(--text)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Sparkles size={18} color="var(--accent)" />
          <div>
            <p style={{ fontWeight:600, fontFamily:'Syne', fontSize:15 }}>Planos</p>
            <p style={{ fontSize:12, color:'var(--text2)' }}>Conheça o plano Família e o que está incluso</p>
          </div>
        </div>
        <ChevronRight size={18} color="var(--text3)" />
      </Link>

      {/* Dados */}
      <p style={{ fontSize:12, fontWeight:600, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.04em', margin:'24px 2px 10px' }}>Dados</p>

      {/* Importar CSV */}
      <Link to="/importar" className="card" style={{ marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between', textDecoration:'none', color:'var(--text)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Upload size={18} color="var(--accent)" />
          <div>
            <p style={{ fontWeight:600, fontFamily:'Syne', fontSize:15 }}>Importar CSV</p>
            <p style={{ fontSize:12, color:'var(--text2)' }}>Trazer gastos de um extrato ou planilha</p>
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
        <p style={{ fontWeight:600, fontFamily:'Syne', fontSize:15, marginBottom:14 }}>Sua conta</p>
        <input ref={fotoRef} type="file" accept="image/*" onChange={aoEscolherFoto} style={{ display:'none' }} />
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
          <button onClick={() => fotoRef.current?.click()} title="Alterar foto" style={{ position:'relative', borderRadius:'50%', opacity: salvandoFoto ? 0.6 : 1 }}>
            <Avatar nome={perfil?.nome} foto={perfil?.foto_url} size={64} />
            <span style={{ position:'absolute', right:-2, bottom:-2, width:24, height:24, borderRadius:'50%', background:'var(--accent)', border:'2px solid var(--bg2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Camera size={12} color="var(--on-accent)" />
            </span>
          </button>
          <div>
            <button onClick={() => fotoRef.current?.click()} disabled={salvandoFoto} style={{ fontSize:13, fontWeight:600, color:'var(--accent-text)' }}>
              {salvandoFoto ? 'Salvando...' : (perfil?.foto_url ? 'Trocar foto' : 'Adicionar foto')}
            </button>
            {perfil?.foto_url && (
              <button onClick={() => salvarFoto(null, 'Foto removida')} disabled={salvandoFoto} style={{ display:'block', fontSize:12, color:'var(--text3)', marginTop:4 }}>
                Remover
              </button>
            )}
          </div>
        </div>
        <div style={{ fontSize:13, color:'var(--text2)' }}>
          <p style={{ marginBottom:6 }}><strong style={{ color:'var(--text)' }}>Nome:</strong> {perfil?.nome}</p>
          <p><strong style={{ color:'var(--text)' }}>E-mail:</strong> {perfil?.email}</p>
        </div>
      </div>
    </div>
  )
}
