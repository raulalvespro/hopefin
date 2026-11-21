import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, ChevronRight, Settings, Users, Database, LifeBuoy, ShieldCheck, FileText, Info, Bell, MessageCircle, Share2, LogOut, UserPlus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import { fmtData } from '../lib/format'
import { redimensionar } from '../lib/foto'
import { statusPush, ativarPush } from '../lib/push'
import { useAssinatura } from '../hooks/useAssinatura'
import { useFlags } from '../hooks/useFlags'
import Avatar from '../components/Avatar'
import { EVENTO_ABRIR_AJUDA } from '../components/Ajuda'
import { copy } from '../copy/pt-BR'

// Minha conta (A8.12) — tela própria, aberta pela foto do perfil. Formato inspirado no "Minha conta"
// do Kywo (21/11/2026): cabeçalho com foto/nome/situação, seções com título pequeno (Minha família,
// Conta, Conexões, Mais), linhas "rótulo × valor" e, no fim, Sair e Apagar conta.
// Tudo que o menu antigo tinha continua aqui: Meu plano, Configurações, Pessoas, Meus dados, Ajuda e Sair.
const t = copy.minhaConta
const MAX_PESSOAS = 6
const LINK_INDICAR = 'https://app.hopefin.com.br/cadastro'
const VERSAO = typeof __VERSAO_APP__ !== 'undefined' ? __VERSAO_APP__ : 'dev' // eslint-disable-line no-undef

const COR_ESTADO = {
  cortesia: 'var(--accent-text)', ativa: 'var(--accent-text)', trial: 'var(--amber-text, var(--amber))',
  cancelada: 'var(--amber-text, var(--amber))', pendente: 'var(--red-text)', encerrada: 'var(--red-text)',
}

const mesAno = (iso) => {
  try { return new Date(iso).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) } catch { return '' }
}

function Secao({ titulo, children }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 4px 10px' }}>{titulo}</p>
      {children}
    </section>
  )
}

function CardTitulo({ titulo, sub, acao }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16 }}>{titulo}</p>
        {sub && <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{sub}</p>}
      </div>
      {acao}
    </div>
  )
}

// Linha "rótulo ........ valor" (como no Kywo).
function Linha({ rotulo, children, ultima }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: ultima ? 'none' : '1px solid var(--border)' }}>
      <span style={{ fontSize: 14, color: 'var(--text2)', flexShrink: 0 }}>{rotulo}</span>
      <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </div>
  )
}

const botaoPilula = { padding: '7px 14px', borderRadius: 'var(--radius-pill, 999px)', border: '1px solid var(--border2)', fontSize: 13, fontWeight: 600, color: 'var(--text)', background: 'var(--bg3)', textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap' }

// Linha de menu (ícone + texto + valor/seta), dentro de um card-lista.
function ItemMenu({ icon: Icon, label, valor, corValor, to, onClick, ultima }) {
  const estilo = { width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', minHeight: 52, textAlign: 'left', color: 'var(--text)', textDecoration: 'none', borderBottom: ultima ? 'none' : '1px solid var(--border)', background: 'none' }
  const conteudo = (
    <>
      <Icon size={18} color="var(--text2)" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5 }}>{label}</span>
      {valor ? <span style={{ fontSize: 13, color: corValor || 'var(--text2)', fontWeight: corValor ? 600 : 400 }}>{valor}</span> : <ChevronRight size={16} color="var(--text3)" />}
    </>
  )
  return to ? <Link to={to} style={estilo}>{conteudo}</Link> : <button type="button" onClick={onClick} style={estilo}>{conteudo}</button>
}

export default function MinhaConta() {
  const { perfil, user, logout, carregarPerfil } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const plano = useAssinatura()
  const flags = useFlags()
  const fotoRef = useRef(null)
  const [salvandoFoto, setSalvandoFoto] = useState(false)
  const [membros, setMembros] = useState(null)
  const [push, setPush] = useState(null) // { suportado, permissao, inscrito }
  const [ativandoPush, setAtivandoPush] = useState(false)

  useEffect(() => {
    if (!perfil?.grupo_id) return
    supabase.from('usuarios').select('id, nome, foto_url').eq('grupo_id', perfil.grupo_id).order('criado_em')
      .then(({ data }) => setMembros(data || []))
  }, [perfil?.grupo_id])
  useEffect(() => { statusPush().then(setPush) }, [])

  if (!perfil) return null

  async function aoEscolherFoto(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast(t.fotoArquivo, 'erro'); return }
    setSalvandoFoto(true)
    try {
      const url = await redimensionar(file)
      const { error } = await supabase.from('usuarios').update({ foto_url: url }).eq('id', perfil.id)
      if (error) throw error
      await carregarPerfil(user)
      toast(t.fotoOk, 'ok')
    } catch { toast(t.fotoErro, 'erro') }
    setSalvandoFoto(false)
  }

  async function ligarPush() {
    if (!push?.suportado || push.inscrito || push.permissao === 'denied') return
    setAtivandoPush(true)
    try {
      await ativarPush(perfil.id, perfil.grupo_id)
      toast(t.notifOk, 'ok')
      setPush(await statusPush())
    } catch (e) { toast(e?.message || copy.avisos?.notifErro || 'Não foi possível ativar.', 'erro') }
    setAtivandoPush(false)
  }

  async function indicar() {
    const dados = { title: 'HopeFin', text: t.indicarMsg, url: LINK_INDICAR }
    try {
      if (navigator.share) { await navigator.share(dados); return }
      await navigator.clipboard.writeText(`${t.indicarMsg} ${LINK_INDICAR}`)
      toast(t.indicarCopiado, 'ok')
    } catch { /* cancelou o compartilhamento */ }
  }

  async function sair() {
    await logout()
    navigate('/login')
  }

  // Situação do plano (mesmos textos do menu antigo).
  const situacao = (() => {
    if (plano.loading) return ''
    const r = t.plano[plano.estado] ?? t.plano.sem_assinatura
    if (typeof r !== 'function') return r
    if (plano.estado === 'trial') return r(plano.diasRestantes)
    const d = plano.estado === 'ativa' ? plano.renovaEm : plano.terminaEm
    return r(d ? fmtData(String(d).slice(0, 10), 'dd/MM/yyyy') : '')
  })()
  const corSituacao = COR_ESTADO[plano.estado] || 'var(--accent-text)'

  const valorPush = !push ? '…'
    : !push.suportado ? t.notifSemSuporte
    : push.inscrito ? t.notifAtivas
    : push.permissao === 'denied' ? t.notifBloqueadas
    : ativandoPush ? '…' : t.notifAtivar
  const corPush = push?.inscrito ? 'var(--accent-text)' : push?.suportado && push.permissao !== 'denied' ? 'var(--accent-text)' : undefined

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* Cabeçalho: foto (troca direto), nome, situação do plano e desde quando */}
      <input ref={fotoRef} type="file" accept="image/*" onChange={aoEscolherFoto} style={{ display: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 4px 22px', marginBottom: 22, borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => fotoRef.current?.click()} aria-label={t.trocarFoto} title={t.trocarFoto} disabled={salvandoFoto}
          style={{ position: 'relative', borderRadius: '50%', flexShrink: 0, opacity: salvandoFoto ? 0.6 : 1 }}>
          <Avatar nome={perfil.nome} foto={perfil.foto_url} size={84} />
          <span style={{ position: 'absolute', right: 0, bottom: 0, width: 28, height: 28, borderRadius: '50%', background: 'var(--bg3)', border: '2px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Camera size={14} color="var(--text2)" />
          </span>
        </button>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 24, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(perfil.nome || '').split(/\s+/)[0]}</h2>
          {situacao && (
            <p style={{ fontSize: 14, marginTop: 4 }}>
              <span style={{ color: corSituacao, fontWeight: 600 }}>{situacao}</span>
              {perfil.grupos?.nome && <span style={{ color: 'var(--text2)' }}> · {perfil.grupos.nome}</span>}
            </p>
          )}
          {user?.created_at && <p style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 4 }}>{t.desde(mesAno(user.created_at))}</p>}
        </div>
      </div>

      <Secao titulo={t.secFamilia}>
        <div className="card">
          <CardTitulo titulo={t.grupoTitulo} sub={t.grupoSub}
            acao={<Link to="/configuracoes" style={{ ...botaoPilula, display: 'inline-flex', alignItems: 'center', gap: 6 }}><UserPlus size={14} /> {t.convidar}</Link>} />
          {perfil.grupos?.nome && <Linha rotulo={t.grupoNome}>{perfil.grupos.nome}</Linha>}
          <Linha rotulo={t.grupoPessoas} ultima>
            {membros == null ? '…' : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-flex' }}>
                  {membros.slice(0, 6).map((m, i) => (
                    <span key={m.id} title={m.nome} style={{ marginLeft: i ? -8 : 0, borderRadius: '50%', border: '2px solid var(--bg2)', display: 'inline-flex' }}>
                      <Avatar nome={m.nome} foto={m.foto_url} size={26} />
                    </span>
                  ))}
                </span>
                {t.grupoQtd(membros.length, MAX_PESSOAS)}
              </span>
            )}
          </Linha>
        </div>
        <div className="card" style={{ padding: 0, marginTop: 12 }}>
          <ItemMenu icon={Users} label={t.pessoas} to="/pessoas" ultima />
        </div>
      </Secao>

      <Secao titulo={t.secConta}>
        <div className="card" style={{ marginBottom: 12 }}>
          <CardTitulo titulo={t.dadosTitulo} acao={<Link to="/configuracoes" style={botaoPilula}>{t.editar}</Link>} />
          <Linha rotulo={t.nome}>{perfil.nome}</Linha>
          <Linha rotulo={t.email} ultima>{user?.email || perfil.email}</Linha>
        </div>
        <Link to="/planos" className="card" style={{ display: 'block', textDecoration: 'none', color: 'var(--text)' }}>
          <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16 }}>{t.assinatura}</p>
          <p style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>Plano Família</p>
          <p style={{ fontSize: 13, marginTop: 2, color: corSituacao, fontWeight: 600 }}>{situacao}</p>
          <p style={{ fontSize: 13, color: 'var(--accent-text)', fontWeight: 600, marginTop: 10, display: 'flex', alignItems: 'center', gap: 4 }}>{t.verPlano} <ChevronRight size={15} /></p>
        </Link>
      </Secao>

      <Secao titulo={t.secConexoes}>
        <div className="card" style={{ padding: 0 }}>
          <ItemMenu icon={Bell} label={t.notificacoes} valor={valorPush} corValor={corPush} onClick={ligarPush} ultima={!flags?.whatsapp_app} />
          {flags?.whatsapp_app && <ItemMenu icon={MessageCircle} label={t.whatsapp} to="/configuracoes" ultima />}
        </div>
      </Secao>

      <Secao titulo={t.secMais}>
        <div className="card" style={{ marginBottom: 12, background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t.indicarTitulo}</p>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 12 }}>{t.indicarTexto}</p>
          <button type="button" onClick={indicar} className="btn-ghost" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--accent-text)', borderColor: 'var(--accent)' }}>
            <Share2 size={16} /> {t.indicarBotao}
          </button>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <ItemMenu icon={Settings} label={t.configuracoes} to="/configuracoes" />
          <ItemMenu icon={Database} label={t.meusDados} to="/meus-dados" />
          {flags?.ajuda && (
            <ItemMenu icon={LifeBuoy} label={copy.ajuda.menuConta}
              onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_AJUDA, { detail: { vista: 'inicio' } }))} />
          )}
          <ItemMenu icon={ShieldCheck} label={t.privacidade} to="/privacidade" />
          <ItemMenu icon={FileText} label={t.termos} to="/termos" />
          <ItemMenu icon={Info} label={t.versao} valor={`HopeFin ${VERSAO}`} onClick={() => {}} ultima />
        </div>
      </Secao>

      <button onClick={sair} className="btn-ghost" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48 }}>
        <LogOut size={16} /> {t.sairConta}
      </button>
      <Link to="/meus-dados" style={{ display: 'block', textAlign: 'center', margin: '16px 0 8px', fontSize: 14, color: 'var(--red-text)', textDecoration: 'none' }}>
        {t.apagarConta}
      </Link>
    </div>
  )
}
