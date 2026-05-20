import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function EscolhaGrupo() {
  const { perfil, criarGrupo, entrarGrupo, logout } = useAuth()
  const [modo, setModo] = useState(null) // 'criar' ou 'entrar'
  const [nomeGrupo, setNomeGrupo] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCriar() {
    if (!nomeGrupo.trim()) return
    setLoading(true)
    await criarGrupo(nomeGrupo)
    setLoading(false)
  }

  async function handleEntrar() {
    if (!codigo.trim()) return
    setLoading(true); setErro('')
    const { error } = await entrarGrupo(codigo.trim())
    if (error) setErro('Código inválido. Verifique com quem te convidou.')
    setLoading(false)
  }

  const nome = perfil?.nome?.split(' ')[0] || 'você'

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24, background:'var(--bg)' }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <h1 style={{ fontSize:32, color:'var(--accent)', letterSpacing:'-0.03em' }}>HopeFin</h1>
          <p style={{ color:'var(--text2)', marginTop:8, fontSize:15 }}>Olá, {nome}! Só mais um passo.</p>
        </div>

        {!modo && (
          <>
            <p style={{ textAlign:'center', color:'var(--text2)', fontSize:14, marginBottom:24 }}>
              Você vai criar um grupo financeiro novo ou entrar no grupo de alguém?
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <button onClick={() => setModo('criar')}
                style={{ padding:'16px', borderRadius:'var(--radius)', border:'1px solid var(--border2)', background:'var(--bg2)', textAlign:'left', transition:'border-color 0.15s' }}
                onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
                onMouseOut={e => e.currentTarget.style.borderColor='var(--border2)'}>
                <p style={{ fontFamily:'Syne', fontWeight:700, fontSize:16, marginBottom:4 }}>🏠 Criar novo grupo</p>
                <p style={{ fontSize:13, color:'var(--text2)' }}>Para você (e sua família). Depois compartilha o código com quem quiser convidar.</p>
              </button>
              <button onClick={() => setModo('entrar')}
                style={{ padding:'16px', borderRadius:'var(--radius)', border:'1px solid var(--border2)', background:'var(--bg2)', textAlign:'left', transition:'border-color 0.15s' }}
                onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
                onMouseOut={e => e.currentTarget.style.borderColor='var(--border2)'}>
                <p style={{ fontFamily:'Syne', fontWeight:700, fontSize:16, marginBottom:4 }}>🔗 Entrar em um grupo</p>
                <p style={{ fontSize:13, color:'var(--text2)' }}>Seu cônjuge ou familiar já tem conta e te enviou o código do grupo.</p>
              </button>
            </div>
            <button onClick={logout} style={{ width:'100%', marginTop:20, fontSize:13, color:'var(--text3)' }}>Sair</button>
          </>
        )}

        {modo === 'criar' && (
          <>
            <button onClick={() => setModo(null)} style={{ fontSize:13, color:'var(--text3)', marginBottom:20 }}>← Voltar</button>
            <div className="form-group">
              <label>Nome do grupo / família</label>
              <input placeholder={`Família ${nome}`} value={nomeGrupo} onChange={e => setNomeGrupo(e.target.value)} autoFocus />
            </div>
            <button className="btn-primary" style={{ width:'100%' }} onClick={handleCriar} disabled={loading}>
              {loading ? 'Criando...' : 'Criar grupo e entrar'}
            </button>
          </>
        )}

        {modo === 'entrar' && (
          <>
            <button onClick={() => setModo(null)} style={{ fontSize:13, color:'var(--text3)', marginBottom:20 }}>← Voltar</button>
            <div className="form-group">
              <label>Código do grupo</label>
              <input placeholder="Cole o código que recebeu" value={codigo} onChange={e => setCodigo(e.target.value)} autoFocus />
              <p style={{ fontSize:12, color:'var(--text3)', marginTop:6 }}>Peça o código nas configurações do app de quem te convidou.</p>
            </div>
            {erro && <p style={{ color:'var(--red)', fontSize:13, marginBottom:14 }}>{erro}</p>}
            <button className="btn-primary" style={{ width:'100%' }} onClick={handleEntrar} disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar no grupo'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
