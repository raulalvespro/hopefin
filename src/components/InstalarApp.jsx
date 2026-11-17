import { useEffect, useState } from 'react'
import { Download, X, Share, ChevronRight, ExternalLink } from 'lucide-react'
import { copy } from '../copy/pt-BR'
import { useAuth } from '../contexts/AuthContext'
import { registrarDiagnostico } from '../lib/diagnostico'
import {
  conviteInstalacao, aoMudarConvite, abrirInstalacao,
  estaInstalado, ehIOS, ehAndroid, navegadorInterno, linkAbrirNoChrome,
} from '../lib/instalacao'

// Compatibilidade: estas funções moraram aqui antes de ir para lib/instalacao.
export { estaInstalado, ehIOS } from '../lib/instalacao'

const t = copy.avisos
const KEY = 'hopefin_pwa_dispensado'
const DIAS_ATE_REAPARECER = 14
const ESPERA_CONVITE_MS = 4000 // tempo pro Chrome oferecer a instalação antes do plano B

function dispensadoRecentemente() {
  try {
    const v = localStorage.getItem(KEY)
    if (!v || v === '1') return false // a versão antiga guardava "1" pra sempre: volta a aparecer
    return Date.now() - Number(v) < DIAS_ATE_REAPARECER * 86400000
  } catch { return false }
}

// Aviso "Instalar o HopeFin" no TOPO do conteúdo (não flutua sobre o microfone), clicável:
// - Android/desktop com convite do Chrome: um toque abre a janela de instalação.
// - Android sem convite: passo a passo pelo menu do Chrome.
// - Android dentro de outro app (Instagram/Facebook/WebView): "Abrir no Chrome".
// - iPhone: passo a passo do Compartilhar → Tela de Início.
export default function InstalarApp() {
  const { perfil } = useAuth()
  const [oculto, setOculto] = useState(() => estaInstalado() || dispensadoRecentemente())
  const [convite, setConvite] = useState(() => conviteInstalacao())
  const [modo, setModo] = useState(null) // 'ios' | 'android' | 'interno'
  const [passos, setPassos] = useState(false)

  useEffect(() => {
    // SÓ EM DESENVOLVIMENTO: ?demo=avisos (iPhone) e ?demo=android mostram os passo a passo
    if (import.meta.env.DEV) {
      const demo = new URLSearchParams(location.search).get('demo')
      if (demo === 'avisos') { setOculto(false); setModo('ios'); return }
      if (demo === 'android') { setOculto(false); setModo('android'); return }
    }
    const off = aoMudarConvite(c => setConvite(c))
    if (estaInstalado()) return off
    if (ehIOS()) { setModo('ios'); return off }
    if (ehAndroid()) {
      if (navegadorInterno()) { setModo('interno'); return off }
      const id = setTimeout(() => setModo(m => m || 'android'), ESPERA_CONVITE_MS)
      return () => { clearTimeout(id); off() }
    }
    return off
  }, [])

  const atual = convite ? 'convite' : modo
  if (oculto || !atual) return null

  function diag(detalhe) { registrarDiagnostico('instalar', detalhe, perfil?.grupo_id) }

  async function acao() {
    if (atual === 'convite') {
      const resultado = await abrirInstalacao()
      diag(`convite:${resultado || 'sem_resposta'}`)
      if (resultado === 'accepted') setOculto(true)
      return
    }
    if (atual === 'android' && !passos) diag('sem_convite')
    if (atual === 'interno') { diag('navegador_interno'); window.location.href = linkAbrirNoChrome(); return }
    setPassos(p => !p)
  }

  function dispensar(e) {
    e.stopPropagation()
    setOculto(true)
    try { localStorage.setItem(KEY, String(Date.now())) } catch { /* ignore */ }
  }

  const titulo = atual === 'interno' ? t.internoTitulo : t.instalarTitulo
  const texto = atual === 'convite' ? t.instalarTexto
    : atual === 'interno' ? t.internoTexto
    : atual === 'android' ? t.instalarTextoAndroid
    : t.instalarTextoIos
  const botao = atual === 'convite' ? t.instalarBotao : atual === 'interno' ? t.internoBotao : null

  return (
    <div role="button" tabIndex={0} onClick={acao} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); acao() } }}
      style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer',
        boxShadow: 'var(--shadow-sm)', padding: '12px 14px', marginBottom: 12,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {atual === 'interno' ? <ExternalLink size={20} color="var(--accent)" /> : <Download size={20} color="var(--accent)" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>{titulo}</p>
          <p style={{ fontSize: 12.5, color: 'var(--text2)' }}>{texto}</p>
        </div>
        {botao && <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: 'var(--accent-text)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>{botao}<ChevronRight size={16} /></span>}
        <button onClick={dispensar} style={{ color: 'var(--text3)', flexShrink: 0, display: 'flex', minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' }} aria-label={t.dispensar}>
          <X size={18} />
        </button>
      </div>
      {passos && atual === 'ios' && (
        <ol style={{ margin: '10px 0 0 52px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45 }}>
          <li style={{ display: 'flex', alignItems: 'center', gap: 6 }}>1. {t.iosPasso1} <Share size={14} /></li>
          <li>2. {t.iosPasso2}</li>
          <li>3. {t.iosPasso3}</li>
        </ol>
      )}
      {passos && atual === 'android' && (
        <ol style={{ margin: '10px 0 0 52px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45 }}>
          <li>1. {t.androidPasso1}</li>
          <li>2. {t.androidPasso2}</li>
          <li>3. {t.androidPasso3}</li>
          <li style={{ color: 'var(--text3)' }}>{t.androidDicaWhats}</li>
        </ol>
      )}
    </div>
  )
}
