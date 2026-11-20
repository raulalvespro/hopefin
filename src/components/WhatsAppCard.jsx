import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import { MessageCircle, Copy, CheckCircle2, Link2Off } from 'lucide-react'

// Número do nosso WhatsApp (só dígitos, com DDI). Vem do .env quando o chip
// estiver ativo; sem ele, mostramos só o código e a instrução (sem link direto).
const NOSSO_NUMERO = (import.meta.env.VITE_WHATSAPP_NUMERO || '').replace(/\D/g, '')

export default function WhatsAppCard() {
  const { perfil, user, carregarPerfil } = useAuth()
  const { toast } = useToast()
  const [codigo, setCodigo] = useState('')
  const [gerando, setGerando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [desconectando, setDesconectando] = useState(false)

  const conectado = !!perfil?.whatsapp_verificado
  const numeroMasc = perfil?.telefone ? '••••' + String(perfil.telefone).slice(-4) : ''

  async function gerar() {
    setGerando(true)
    const { data, error } = await supabase.rpc('gerar_codigo_whatsapp')
    setGerando(false)
    if (error || !data) { toast('Não foi possível gerar o código agora.', 'erro'); return }
    setCodigo(data)
  }

  function copiar() {
    navigator.clipboard?.writeText(codigo).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 1500)
    }).catch(() => {})
  }

  async function desconectar() {
    setDesconectando(true)
    const { error } = await supabase.rpc('desconectar_whatsapp')
    if (error) { toast('Não foi possível desconectar.', 'erro'); setDesconectando(false); return }
    await carregarPerfil(user)
    setCodigo('')
    toast('WhatsApp desconectado', 'ok')
    setDesconectando(false)
  }

  const mensagem = codigo
    ? `Olá! Quero cadastrar este número no meu grupo do HopeFin. Meu código é ${codigo}.`
    : ''
  const linkWa = NOSSO_NUMERO && codigo
    ? `https://wa.me/${NOSSO_NUMERO}?text=${encodeURIComponent(mensagem)}`
    : null

  return (
    <div className="card" style={{ marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <MessageCircle size={18} color="var(--accent)" />
        <p style={{ fontWeight:600, fontFamily:'Syne', fontSize:15 }}>Lançar por WhatsApp</p>
      </div>

      {conectado ? (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:'var(--radius-sm)', background:'var(--accent-dim)', color:'var(--accent2)', marginBottom:12 }}>
            <CheckCircle2 size={20} />
            <div>
              <p style={{ fontSize:14, fontWeight:600 }}>WhatsApp conectado</p>
              <p style={{ fontSize:12, color:'var(--text2)' }}>Número {numeroMasc} — é só mandar seus gastos pra lá.</p>
            </div>
          </div>
          <button onClick={desconectar} disabled={desconectando}
            style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:'var(--text2)' }}>
            <Link2Off size={15} /> {desconectando ? 'Desconectando...' : 'Desconectar este número'}
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize:13, color:'var(--text2)', marginBottom:14, lineHeight:1.5 }}>
            Conecte seu WhatsApp e lance gastos numa mensagem, tipo <em>"mercado 120 no crédito"</em>. O Joca entende e já registra pra você.
          </p>

          {codigo ? (
            <div style={{ padding:'14px', borderRadius:'var(--radius-sm)', background:'var(--bg3)', border:'1.5px dashed var(--accent)', marginBottom:12 }}>
              <p style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>Seu código (vale 15 minutos):</p>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontFamily:'Syne', fontWeight:700, fontSize:26, letterSpacing:'0.12em', color:'var(--accent)' }}>{codigo}</span>
                <button onClick={copiar} title="Copiar" style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:600, color:'var(--accent-text)' }}>
                  {copiado ? <><CheckCircle2 size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
                </button>
              </div>
              <p style={{ fontSize:12.5, color:'var(--text2)', marginTop:10, lineHeight:1.5 }}>
                {linkWa
                  ? 'Toque no botão abaixo e envie o código no nosso WhatsApp. Assim que chegar, seu número fica conectado.'
                  : 'Envie esse código no nosso WhatsApp. Assim que ele chegar, seu número fica conectado.'}
              </p>
              {linkWa && (
                <a href={linkWa} target="_blank" rel="noreferrer" className="btn-primary"
                  style={{ display:'inline-flex', alignItems:'center', gap:8, marginTop:12, textDecoration:'none' }}>
                  <MessageCircle size={16} /> Abrir no WhatsApp
                </a>
              )}
            </div>
          ) : null}

          <button className="btn-primary" style={{ width:'100%', opacity: gerando ? 0.6 : 1 }} onClick={gerar} disabled={gerando}>
            {gerando ? 'Gerando...' : (codigo ? 'Gerar outro código' : 'Conectar meu WhatsApp')}
          </button>
        </>
      )}
    </div>
  )
}
