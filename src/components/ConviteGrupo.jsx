import { useEffect, useState } from 'react'
import { Copy, Check, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Avatar from './Avatar'
import { Button } from './ui'
import { copy } from '../copy/pt-BR'

const t = copy.convite
const LIMITE_GRUPO = 6

// Cartão "Convidar para o grupo" (prompt 18). O fluxo de entrada continua o de sempre:
// quem é convidado escolhe "Entrar em um grupo" e cola o código do grupo.
export default function ConviteGrupo() {
  const { perfil } = useAuth()
  const { toast } = useToast()
  const [membros, setMembros] = useState([])
  const [copiado, setCopiado] = useState(false)

  const codigo = perfil?.grupos?.codigo || ''

  useEffect(() => {
    if (!perfil?.grupo_id) return
    supabase.from('usuarios').select('id, nome, foto_url').eq('grupo_id', perfil.grupo_id)
      .then(({ data }) => setMembros(data || []))
  }, [perfil?.grupo_id])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      toast(t.copiado, 'ok')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast(t.copiarErro, 'erro')
    }
  }

  const n = membros.length || 1
  // Códigos longos (ex.: UUID) ficam menores pra caber sem estourar o cartão.
  const longo = codigo.length > 12

  return (
    <section className="card" aria-label={t.titulo} style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {membros.map((m, i) => (
          <span key={m.id} className="hf-pop" style={{ animationDelay: `${i * 0.15}s`, display: 'inline-flex' }}>
            <Avatar nome={m.nome} foto={m.foto_url} size={56} />
          </span>
        ))}
        {n < LIMITE_GRUPO && (
          <span className="hf-pop" aria-hidden="true"
            style={{ animationDelay: `${membros.length * 0.15}s`, width: 56, height: 56, borderRadius: '50%', border: '2px dashed var(--accent)', background: 'var(--bg2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={24} color="var(--accent-text)" strokeWidth={2.25} />
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20, lineHeight: '24px' }}>{perfil?.grupos?.nome || t.grupoFallback}</span>
        <span style={{ fontSize: 14, color: 'var(--text2)' }}>{t.membros(n, LIMITE_GRUPO)}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t.codigoLabel}</span>
        <code style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: longo ? 15 : 22, letterSpacing: longo ? '.02em' : '.12em', color: 'var(--text)', wordBreak: 'break-all', background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
          {codigo}
        </code>
      </div>

      <p style={{ fontSize: 14, lineHeight: '20px', color: 'var(--text2)' }}>{t.explicacao}</p>

      <Button onClick={copiar} disabled={!codigo} style={{ width: '100%' }}>
        {copiado ? <><Check size={18} /> {t.copiado}</> : <><Copy size={18} /> {t.copiar}</>}
      </Button>
      <p style={{ fontSize: 12, color: 'var(--text3)' }}>{t.comoEntrar}</p>
    </section>
  )
}
