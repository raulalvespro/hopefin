import { useCallback, useEffect, useState } from 'react'
import { Copy, Check, Plus, Link2, MessageCircle, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { codigoBonito, linkConvite } from '../lib/convite'
import Avatar from './Avatar'
import { Button, Tag } from './ui'
import { copy } from '../copy/pt-BR'

const t = copy.convite
const LIMITE_GRUPO = 6

// Cartão "Convidar para o grupo" (prompts 18): membros, código curto, QR code, link,
// WhatsApp e remover membro (só o dono do grupo). Quem é convidado pode entrar pelo
// link (/entrar?c=…) ou escolhendo "Entrar em um grupo" e digitando o código.
export default function ConviteGrupo() {
  const { perfil } = useAuth()
  const { toast } = useToast()
  const [membros, setMembros] = useState([])
  const [copiado, setCopiado] = useState('') // 'codigo' | 'link'
  const [qr, setQr] = useState('')
  const [removendo, setRemovendo] = useState(null) // membro em confirmação
  const [salvando, setSalvando] = useState(false)

  const codigo = perfil?.grupos?.codigo || ''
  const link = codigo ? linkConvite(codigo) : ''
  const souDono = !!perfil?.grupos?.criado_por && perfil.grupos.criado_por === perfil.id

  const carregarMembros = useCallback(() => {
    if (!perfil?.grupo_id) return
    supabase.from('usuarios').select('id, nome, foto_url').eq('grupo_id', perfil.grupo_id).order('criado_em')
      .then(({ data }) => setMembros(data || []))
  }, [perfil?.grupo_id])

  useEffect(() => { carregarMembros() }, [carregarMembros])

  // QR do link de convite (biblioteca carregada só quando a tela abre).
  useEffect(() => {
    if (!link) return
    let vivo = true
    import('qrcode').then(m => m.toDataURL(link, { margin: 1, width: 296, color: { dark: '#0f172a', light: '#ffffff' } }))
      .then(url => { if (vivo) setQr(url) })
      .catch(() => {})
    return () => { vivo = false }
  }, [link])

  async function copiar(texto, qual, msg) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(qual)
      toast(msg, 'ok')
      setTimeout(() => setCopiado(''), 2000)
    } catch {
      toast(t.copiarErro, 'erro')
    }
  }

  function whatsapp() {
    const texto = t.mensagemWhats(perfil?.grupos?.nome || t.grupoFallback, link, codigoBonito(codigo))
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  }

  async function remover() {
    if (!removendo) return
    setSalvando(true)
    // A função remove (RPC remover_membro, que confere as permissões) e avisa a pessoa por e-mail.
    const { data: res, error } = await supabase.functions.invoke('remover-membro', { body: { usuario_id: removendo.id } })
    setSalvando(false)
    if (error || !res?.ok) {
      let m = ''
      try { m = String((await error?.context?.json?.())?.erro || '').toLowerCase() } catch { /* ignore */ }
      toast(m.includes('titular') ? t.erroTitular : m.includes('permissao') ? t.erroPermissao : t.erroRemover, 'erro')
      return
    }
    toast(t.removido(removendo.nome), 'ok')
    setRemovendo(null)
    carregarMembros()
  }

  const n = membros.length || 1

  return (
    <>
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

        {qr && (
          <img src={qr} width={148} height={148} alt={t.qrAlt} style={{ borderRadius: 'var(--radius)', background: '#ffffff', padding: 4, border: '1px solid var(--border)' }} />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t.codigoLabel}</span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
            <code style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 22, letterSpacing: '.12em', color: 'var(--text)', wordBreak: 'break-all' }}>
              {codigoBonito(codigo)}
            </code>
            <button onClick={() => copiar(codigoBonito(codigo), 'codigo', t.copiado)} aria-label={t.copiar} title={t.copiar}
              style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: copiado === 'codigo' ? 'var(--accent-text)' : 'var(--text2)' }}>
              {copiado === 'codigo' ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
        </div>

        <p style={{ fontSize: 14, lineHeight: '20px', color: 'var(--text2)' }}>{t.explicacao}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <Button onClick={whatsapp} disabled={!codigo}><MessageCircle size={18} /> {t.whatsapp}</Button>
          <Button variant="secondary" onClick={() => copiar(link, 'link', t.linkCopiado)} disabled={!codigo}>
            {copiado === 'link' ? <><Check size={18} /> {t.linkCopiado}</> : <><Link2 size={18} /> {t.copiarLink}</>}
          </Button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text3)' }}>{t.comoEntrar}</p>

        {/* Membros e remoção (só o dono vê o botão) */}
        {membros.length > 1 && (
          <div style={{ width: '100%', textAlign: 'left', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>{t.membrosTitulo}</p>
            {membros.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <Avatar nome={m.nome} foto={m.foto_url} size={32} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</span>
                {m.id === perfil?.id && <Tag cor="cinza">{t.voce}</Tag>}
                {m.id === perfil?.grupos?.criado_por && m.id !== perfil?.id && <Tag cor="verde">{t.dono}</Tag>}
                {souDono && m.id !== perfil?.id && (
                  <button onClick={() => setRemovendo(m)} aria-label={t.removerAria(m.nome)} title={t.remover}
                    style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
                    <X size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {removendo && (
        <div className="modal-overlay" onClick={() => !salvando && setRemovendo(null)}>
          <div className="modal voz-sheet" role="dialog" aria-label={t.removerTitulo(removendo.nome)} onClick={e => e.stopPropagation()}>
            <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border2)', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 18, marginBottom: 12 }}>{t.removerTitulo(removendo.nome)}</h2>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text2)', marginBottom: 18 }}>{t.removerTexto}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Button onClick={() => setRemovendo(null)} disabled={salvando}>{t.cancelar}</Button>
              <Button variant="secondary" onClick={remover} loading={salvando} style={{ color: 'var(--red-text)' }}>{t.removerConfirmar}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
