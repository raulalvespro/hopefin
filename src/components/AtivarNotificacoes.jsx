import { useEffect, useState } from 'react'
import { Bell, X, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { statusPush, ativarPush, pushSuportado } from '../lib/push'
import { estaInstalado, ehIOS } from './InstalarApp'
import { copy } from '../copy/pt-BR'

const t = copy.avisos
const KEY = 'hopefin_push_dispensado'
const DIAS_ATE_REAPARECER = 14

function dispensadoRecentemente() {
  try {
    const v = Number(localStorage.getItem(KEY) || 0)
    return v > 0 && Date.now() - v < DIAS_ATE_REAPARECER * 86400000
  } catch { return false }
}

// Aviso "Ative as notificações" no topo, clicável: um toque pede a permissão e já deixa tudo ligado.
// Só aparece quando faz sentido: o navegador suporta, a pessoa ainda não ativou nem bloqueou, e (no iPhone)
// o app já foi instalado — lá o push só funciona com o app na tela inicial.
export default function AtivarNotificacoes() {
  const { perfil } = useAuth()
  const { toast } = useToast()
  const [mostrar, setMostrar] = useState(false)
  const [ativando, setAtivando] = useState(false)

  useEffect(() => {
    // SÓ EM DESENVOLVIMENTO: ?demo=avisos força a exibição (para ver o visual sem mexer nas permissões)
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('demo') === 'avisos') { setMostrar(true); return }
    if (!perfil?.id || !pushSuportado() || dispensadoRecentemente()) return
    if (ehIOS() && !estaInstalado()) return
    let vivo = true
    statusPush().then(s => { if (vivo && s.suportado && s.permissao !== 'denied' && !s.inscrito) setMostrar(true) })
    return () => { vivo = false }
  }, [perfil?.id])

  async function ativar() {
    if (ativando) return
    setAtivando(true)
    try {
      await ativarPush(perfil.id, perfil.grupo_id)
      toast(t.notifOk, 'ok')
      setMostrar(false)
    } catch (e) {
      toast(e?.message || t.notifErro, 'erro')
      if (Notification.permission === 'denied') setMostrar(false)
    }
    setAtivando(false)
  }

  function dispensar(e) {
    e.stopPropagation()
    setMostrar(false)
    try { localStorage.setItem(KEY, String(Date.now())) } catch { /* ignore */ }
  }

  if (!mostrar) return null

  return (
    <div role="button" tabIndex={0} onClick={ativar} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ativar() } }}
      style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--amber-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Bell size={20} color="var(--amber-text)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600 }}>{t.notifTitulo}</p>
        <p style={{ fontSize: 12.5, color: 'var(--text2)' }}>{t.notifTexto}</p>
      </div>
      <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: 'var(--accent-text)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {ativando ? t.notifAtivando : t.notifBotao}<ChevronRight size={16} />
      </span>
      <button onClick={dispensar} style={{ color: 'var(--text3)', flexShrink: 0, display: 'flex', minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' }} aria-label={t.dispensar}>
        <X size={18} />
      </button>
    </div>
  )
}
