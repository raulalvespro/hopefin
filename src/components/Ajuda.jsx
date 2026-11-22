import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { HelpCircle, X, ChevronDown, ChevronLeft, ChevronRight, Mail, Compass, Search, MessageSquarePlus, Inbox, Loader, CheckCircle2 } from 'lucide-react'
import { copy } from '../copy/pt-BR'
import { useMascote } from '../lib/mascote'
import {
  abrirChamado, meusChamados, respostasNovas, marcarRespostasVistas, codChamado, telaAtual,
  rotuloCategoriaChamado, diaCurto, diaEHora, MENSAGEM_MIN, MENSAGEM_MAX, ASSUNTO_MAX,
} from '../lib/chamados'

const t = copy.ajuda
const tc = t.chamado
// Outro lugar do app abre a Ajuda disparando este evento (ex.: menu Minha conta), com { vista }.
export const EVENTO_ABRIR_AJUDA = 'hf-abrir-ajuda'

// Perguntas da tela aberta (curadoria por tela, L29). Tela sem curadoria: só as gerais.
export function perguntasDaTela(caminho) {
  const limpo = String(caminho || '/').replace(/\/+$/, '') || '/'
  return t.telas[limpo] || null
}

// Pergunta com `chave` só aparece pra quem tem aquela chave de recurso (WhatsApp, busca, importar).
export const perguntaVisivel = (flags) => (item) => !item.chave || !!flags?.[item.chave]

const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Raiz simples da palavra: "cancelar" acha "cancelo" e "cancelada"; "fatura" acha "faturas".
const raiz = (w) => (w.length >= 6 ? w.slice(0, Math.max(5, w.length - 3)) : w)

// Busca em TODAS as perguntas (de todas as telas + gerais): todas as palavras precisam aparecer
// na pergunta ou na resposta (pela raiz). Sem acento e sem maiúscula. Devolve no máximo 30.
export function buscarPerguntas(termo, flags) {
  const palavras = normalizar(termo).trim().split(/\s+/).filter((w) => w.length > 0).map(raiz)
  if (normalizar(termo).trim().length < 2) return []
  const todas = [
    ...Object.entries(t.telas).flatMap(([rota, tela]) => tela.perguntas.filter(perguntaVisivel(flags)).map((item) => ({ ...item, tela: tela.nome, rota }))),
    ...t.perguntasGerais.filter(perguntaVisivel(flags)).map((item) => ({ ...item, tela: null, rota: null })),
  ]
  const vistas = new Set()
  return todas.filter((item) => {
    const texto = normalizar(`${item.p} ${item.r}`)
    if (!palavras.every((w) => texto.includes(w))) return false
    const k = `${item.p}|${item.r}`
    if (vistas.has(k)) return false
    vistas.add(k)
    return true
  }).slice(0, 30)
}

const rotuloSecao = { fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 2px 2px' }

function Pergunta({ item, aberta, onToggle, id, tela }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button type="button" onClick={onToggle} aria-expanded={aberta} aria-controls={id}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 2px', minHeight: 44, textAlign: 'left', color: 'var(--text)', fontSize: 14, fontWeight: 500 }}>
        <span>
          {item.p}
          {tela && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--text2)', marginTop: 2 }}>{tela}</span>}
        </span>
        <ChevronDown size={16} color="var(--text2)" aria-hidden="true"
          style={{ flexShrink: 0, transform: aberta ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-fast, .15s) var(--ease, ease)' }} />
      </button>
      {aberta && (
        <p id={id} style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text2)', margin: '0 2px 12px' }}>{item.r}</p>
      )}
    </div>
  )
}

function Topo({ titulo, onVoltar, onFechar, icone: Icone = HelpCircle }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        {onVoltar && (
          <button type="button" onClick={onVoltar} aria-label={t.voltar} title={t.voltar}
            style={{ minWidth: 40, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', color: 'var(--text2)' }}>
            <ChevronLeft size={22} />
          </button>
        )}
        <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {!onVoltar && <Icone size={18} color="var(--accent)" aria-hidden="true" />} {titulo}
        </h2>
      </div>
      <button type="button" onClick={onFechar} aria-label={t.fechar}
        style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <X size={20} color="var(--text2)" />
      </button>
    </div>
  )
}

const COR_SITUACAO = {
  aberto: { bg: 'var(--amber-dim)', fg: 'var(--amber-text)' },
  respondido: { bg: 'var(--accent-dim)', fg: 'var(--accent-text)' },
  encerrado: { bg: 'var(--bg3)', fg: 'var(--text2)' },
}

function Chamado({ c, aberto, onToggle }) {
  const cor = COR_SITUACAO[c.situacao] || COR_SITUACAO.aberto
  const id = `chamado-${c.id}`
  return (
    <div className="card" style={{ margin: '0 0 10px', padding: 0, overflow: 'hidden', borderColor: c.resposta_nova ? 'var(--accent)' : undefined }}>
      <button type="button" onClick={onToggle} aria-expanded={aberto} aria-controls={id}
        style={{ width: '100%', textAlign: 'left', padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', color: 'var(--text)' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: cor.bg, color: cor.fg }}>{tc.situacao[c.situacao] || c.situacao}</span>
            {c.resposta_nova && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)' }}>{tc.nova}</span>}
            <span style={{ fontSize: 11.5, color: 'var(--text2)', fontFamily: 'monospace' }}>{codChamado(c.id)}</span>
          </span>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: aberto ? 'normal' : 'nowrap' }}>{c.assunto}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            {rotuloCategoriaChamado(c.categoria)} · {tc.abertoEm(diaCurto(c.recebido_em))}
            {c.situacao === 'aberto' && c.prazo_em ? ` · ${tc.respostaAte(diaCurto(c.prazo_em))}` : ''}
            {c.respondido_em && c.situacao !== 'aberto' ? ` · ${tc.respondidoEm(diaCurto(c.respondido_em))}` : ''}
          </span>
        </span>
        <ChevronDown size={16} color="var(--text2)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 4, transform: aberto ? 'rotate(180deg)' : 'none' }} />
      </button>
      {aberto && (
        <div id={id} style={{ padding: '0 14px 14px' }}>
          <p style={{ ...rotuloSecao, margin: '2px 0 4px' }}>{tc.suaMensagem}</p>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text2)', whiteSpace: 'pre-wrap', margin: 0 }}>{c.corpo}</p>
          {c.resposta && (
            <div style={{ marginTop: 12, borderLeft: '3px solid var(--accent)', paddingLeft: 12 }}>
              <p style={{ ...rotuloSecao, color: 'var(--accent-text)', margin: '0 0 4px' }}>{tc.respostaEquipe}{c.respondido_em ? ` · ${diaEHora(c.respondido_em)}` : ''}</p>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap', margin: 0 }}>{c.resposta}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Botão "Ajuda" do topo + folha de Ajuda (perguntas por tela, busca, chamados).
// O Layout só mostra com a chave de recurso "ajuda". `flags` filtra as perguntas com `chave`.
export default function Ajuda({ flags }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [aberto, setAberto] = useState(false)
  const { mascote } = useMascote()
  const [vista, setVista] = useState('inicio') // inicio | novo | enviado | meus
  const [abertaId, setAbertaId] = useState(null)
  const [busca, setBusca] = useState('')
  const [novas, setNovas] = useState(0)
  // formulário
  const [categoria, setCategoria] = useState('duvida')
  const [assunto, setAssunto] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(null) // { id, prazo }
  // meus chamados
  const [lista, setLista] = useState(null) // null = carregando
  const [erroLista, setErroLista] = useState('')
  const [chamadoAberto, setChamadoAberto] = useState(null)

  const tela = perguntasDaTela(location.pathname)
  const nomeTela = tela?.nome || 'o app'
  const assuntoEmail = encodeURIComponent(t.assuntoEmail(nomeTela))
  const daTela = (tela?.perguntas || []).filter(perguntaVisivel(flags))
  const gerais = t.perguntasGerais.filter(perguntaVisivel(flags))
  const achadas = buscarPerguntas(busca, flags)
  const buscando = busca.trim().length >= 2

  // Bolinha: respostas que a pessoa ainda não viu. Confere ao abrir o app e ao voltar pra ele.
  const atualizarNovas = useCallback(() => { respostasNovas().then(setNovas).catch(() => {}) }, [])
  useEffect(() => {
    atualizarNovas()
    const aoVoltar = () => { if (document.visibilityState === 'visible') atualizarNovas() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [atualizarNovas])

  const abrir = useCallback((v = 'inicio') => {
    setAbertaId(null); setBusca(''); setErro(''); setChamadoAberto(null)
    setVista(v); setAberto(true)
  }, [])

  // Aberta por outro lugar do app (menu Minha conta).
  useEffect(() => {
    const aoPedir = (e) => abrir(e?.detail?.vista || 'inicio')
    window.addEventListener(EVENTO_ABRIR_AJUDA, aoPedir)
    return () => window.removeEventListener(EVENTO_ABRIR_AJUDA, aoPedir)
  }, [abrir])

  // Link do e-mail / da notificação da resposta: ?ajuda=chamados abre "Meus chamados".
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    const pedido = p.get('ajuda')
    if (!pedido) return
    p.delete('ajuda')
    const resto = p.toString()
    navigate({ pathname: location.pathname, search: resto ? `?${resto}` : '' }, { replace: true })
    abrir(pedido === 'chamados' ? 'meus' : pedido === 'novo' ? 'novo' : 'inicio')
  }, [location.search]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Meus chamados": carrega e, depois de mostrar o que é novo, marca como visto.
  useEffect(() => {
    if (!aberto || vista !== 'meus') return
    let vivo = true
    setLista(null); setErroLista('')
    meusChamados().then(async (r) => {
      if (!vivo) return
      if (r.erro) { setErroLista(r.erro); setLista([]); return }
      setLista(r.lista)
      const primeiraNova = r.lista.find((c) => c.resposta_nova)
      if (primeiraNova) setChamadoAberto(primeiraNova.id)
      if (r.lista.some((c) => c.resposta_nova)) { await marcarRespostasVistas(); if (vivo) setNovas(0) }
    })
    return () => { vivo = false }
  }, [aberto, vista])

  function fechar() { setAberto(false); atualizarNovas() }
  const alternar = (id) => setAbertaId((a) => (a === id ? null : id))

  async function enviar(e) {
    e?.preventDefault?.()
    if (enviando) return
    const msg = mensagem.trim()
    if (msg.length < MENSAGEM_MIN) { setErro(tc.erros.mensagem_curta); return }
    setEnviando(true); setErro('')
    const r = await abrirChamado({ categoria, assunto, mensagem: msg, tela: telaAtual(location.pathname) })
    setEnviando(false)
    if (r.erro) { setErro(r.erro); return }
    setEnviado({ id: r.id, prazo: r.prazo })
    setAssunto(''); setMensagem(''); setCategoria('duvida')
    setVista('enviado')
  }

  const faltaTexto = Math.max(0, MENSAGEM_MIN - mensagem.trim().length)
  const podeEnviar = faltaTexto === 0 && !enviando

  return (
    <>
      {/* Botão do topo = o Joca com um "?" grudado (21/11/2026): o Joca é o "mordomo" do app que ajuda.
          Com o mascote desligado no painel, volta o ícone de interrogação. */}
      <button type="button" onClick={() => abrir('inicio')} aria-label={novas ? t.botaoNovas(novas) : t.botao} title={novas ? t.botaoNovas(novas) : t.botao}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-dim)', border: '1.5px solid var(--accent)', padding: 0 }}>
        {mascote
          ? <img src="/joca/joca-base-320.webp" alt="" width={34} height={34} draggable={false}
              style={{ width: 34, height: 34, objectFit: 'cover', objectPosition: '50% 18%', borderRadius: '50%' }} />
          : <HelpCircle size={20} color="var(--accent-text)" aria-hidden="true" />}
        <span aria-hidden="true" style={{ position: 'absolute', right: -4, bottom: -3, width: 17, height: 17, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent, #fff)', border: '2px solid var(--bg2, var(--bg))', fontFamily: 'Syne', fontWeight: 700, fontSize: 10.5, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</span>
        {novas > 0 && (
          <span aria-hidden="true" style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#dc2626', color: '#fff', fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{novas}</span>
        )}
      </button>

      {/* Portal: o cabeçalho é "sticky" com camada própria; fora dele a folha cobre tudo */}
      {aberto && createPortal(
        <div className="modal-overlay" onClick={fechar}>
          <div className="modal" role="dialog" aria-label={t.titulo} onClick={(e) => e.stopPropagation()}>

            {vista === 'inicio' && (
              <>
                <Topo titulo={t.titulo} onFechar={fechar} />

                {/* Busca em todas as perguntas */}
                <label style={{ position: 'relative', display: 'block', marginBottom: 14 }}>
                  <Search size={16} color="var(--text2)" aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                  <input type="text" inputMode="search" enterKeyHint="search" value={busca} onChange={(e) => { setBusca(e.target.value); setAbertaId(null) }} placeholder={t.buscarPh}
                    aria-label={t.buscarLabel} style={{ width: '100%', paddingLeft: 36, paddingRight: busca ? 40 : 12 }} />
                  {busca && (
                    <button type="button" onClick={() => setBusca('')} aria-label={t.limparBusca}
                      style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={16} color="var(--text2)" />
                    </button>
                  )}
                </label>

                {buscando ? (
                  <section style={{ marginBottom: 18 }} aria-live="polite">
                    <p style={rotuloSecao}>{achadas.length ? t.resultados(achadas.length) : ''}</p>
                    {achadas.length === 0 && <p style={{ fontSize: 13.5, color: 'var(--text2)', margin: '4px 2px 8px' }}>{t.semResultado}</p>}
                    {achadas.map((item, i) => (
                      <Pergunta key={`b${i}`} id={`ajuda-b${i}`} item={item} tela={item.tela ? t.nestaTela(item.tela) : t.gerais}
                        aberta={abertaId === `b${i}`} onToggle={() => alternar(`b${i}`)} />
                    ))}
                  </section>
                ) : (
                  <>
                    {daTela.length > 0 && (
                      <section style={{ marginBottom: 18 }}>
                        <p style={rotuloSecao}>{t.nestaTela(tela.nome)}</p>
                        {daTela.map((item, i) => (
                          <Pergunta key={`t${i}`} id={`ajuda-t${i}`} item={item} aberta={abertaId === `t${i}`} onToggle={() => alternar(`t${i}`)} />
                        ))}
                      </section>
                    )}
                    <section style={{ marginBottom: 18 }}>
                      <p style={rotuloSecao}>{t.gerais}</p>
                      {gerais.map((item, i) => (
                        <Pergunta key={`g${i}`} id={`ajuda-g${i}`} item={item} aberta={abertaId === `g${i}`} onToggle={() => alternar(`g${i}`)} />
                      ))}
                    </section>
                  </>
                )}

                {/* Fale com a gente: chamado (resposta no app e no e-mail) */}
                <div className="card" style={{ margin: 0, background: 'var(--bg3)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 2 }}>{t.naoAchou}</p>
                  <p style={{ fontWeight: 700, fontFamily: 'Syne', fontSize: 15, marginBottom: 10 }}>{t.falar}</p>
                  <button type="button" className="btn-primary" onClick={() => { setErro(''); setVista('novo') }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <MessageSquarePlus size={18} aria-hidden="true" /> {tc.abrir}
                  </button>
                  <p style={{ fontSize: 12, color: 'var(--text2)', margin: '6px 2px 10px', textAlign: 'center' }}>{tc.abrirSub} {tc.prazo}</p>
                  <button type="button" onClick={() => setVista('meus')}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '8px 2px', textAlign: 'left', color: 'var(--text)', borderTop: '1px solid var(--border)' }}>
                    <Inbox size={18} color="var(--accent)" aria-hidden="true" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{tc.meus}</span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)' }}>{tc.meusSub}</span>
                    </span>
                    {novas > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)' }}>{novas} {tc.nova.toLowerCase()}{novas > 1 ? 's' : ''}</span>}
                    <ChevronRight size={16} color="var(--text2)" aria-hidden="true" />
                  </button>
                  <a href={`mailto:${t.email}?subject=${assuntoEmail}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text)', minHeight: 44, borderTop: '1px solid var(--border)', padding: '8px 2px' }}>
                    <Mail size={18} color="var(--accent)" aria-hidden="true" />
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t.porEmail} <span style={{ color: 'var(--accent-text)', fontWeight: 500 }}>{t.email}</span></span>
                  </a>
                  <Link to="/tour?rever=1" onClick={() => setAberto(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--accent-text)', fontSize: 13, fontWeight: 500, minHeight: 44, borderTop: '1px solid var(--border)', padding: '8px 2px' }}>
                    <Compass size={16} aria-hidden="true" /> {t.passeio}
                  </Link>
                </div>
              </>
            )}

            {vista === 'novo' && (
              <form onSubmit={enviar} noValidate>
                <Topo titulo={tc.tituloNovo} onVoltar={() => setVista('inicio')} onFechar={fechar} />
                <fieldset style={{ border: 'none', padding: 0, margin: '0 0 14px' }}>
                  <legend style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>{tc.categoriaLabel}</legend>
                  <div role="radiogroup" aria-label={tc.categoriaLabel} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {tc.categorias.map((c) => {
                      const sel = categoria === c.id
                      return (
                        <button key={c.id} type="button" role="radio" aria-checked={sel} onClick={() => setCategoria(c.id)}
                          style={{ padding: '8px 12px', minHeight: 40, borderRadius: 999, fontSize: 13, fontWeight: 500, border: `1px solid ${sel ? 'var(--accent)' : 'var(--field-line)'}`, background: sel ? 'var(--accent-dim)' : 'transparent', color: sel ? 'var(--accent-text)' : 'var(--text)' }}>
                          {c.rotulo}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
                <div className="form-group">
                  <label htmlFor="chamado-assunto">{tc.assuntoLabel}</label>
                  <input id="chamado-assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={ASSUNTO_MAX} placeholder={tc.assuntoPh} />
                </div>
                <div className="form-group">
                  <label htmlFor="chamado-mensagem">{tc.mensagemLabel} <span style={{ fontWeight: 400, color: 'var(--text2)' }}>· {tc.minimo(MENSAGEM_MIN)}</span></label>
                  <textarea id="chamado-mensagem" value={mensagem} onChange={(e) => { setMensagem(e.target.value); if (erro) setErro('') }} rows={6} maxLength={MENSAGEM_MAX}
                    placeholder={tc.mensagemPh} style={{ width: '100%', resize: 'vertical' }} aria-describedby="chamado-dica" />
                  <p id="chamado-dica" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                    <span>{tc.cuidado}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{tc.contador(mensagem.length, MENSAGEM_MAX)}</span>
                  </p>
                </div>
                {erro && <p role="alert" style={{ fontSize: 13, color: 'var(--red-text)', marginBottom: 10 }}>{erro}</p>}
                <button type="submit" className="btn-primary" disabled={!podeEnviar}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: podeEnviar ? 1 : 0.6 }}>
                  {enviando ? <><Loader size={18} className="spin" aria-hidden="true" /> {tc.enviando}</> : <><MessageSquarePlus size={18} aria-hidden="true" /> {tc.enviar}</>}
                </button>
                {faltaTexto > 0 && !enviando && (
                  <p id="chamado-porque" aria-live="polite" style={{ fontSize: 12.5, color: 'var(--amber-text)', textAlign: 'center', marginTop: 8 }}>{tc.porqueCinza(faltaTexto, MENSAGEM_MIN)}</p>
                )}
                <p style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', marginTop: 8 }}>{tc.prazo}</p>
              </form>
            )}

            {vista === 'enviado' && enviado && (
              <>
                <Topo titulo={t.titulo} onFechar={fechar} />
                <div style={{ textAlign: 'center', padding: '8px 4px 4px' }}>
                  <CheckCircle2 size={44} color="var(--accent)" aria-hidden="true" />
                  <p role="status" style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, margin: '10px 0 6px' }}>{tc.enviadoTitulo(codChamado(enviado.id))}</p>
                  <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 16 }}>{tc.enviadoSub(diaCurto(enviado.prazo))}</p>
                  <button type="button" className="btn-primary" onClick={() => setVista('meus')} style={{ width: '100%', marginBottom: 8 }}>{tc.verMeus}</button>
                  <button type="button" className="btn-ghost" onClick={() => setVista('inicio')} style={{ width: '100%' }}>{t.voltar}</button>
                </div>
              </>
            )}

            {vista === 'meus' && (
              <>
                <Topo titulo={tc.meus} onVoltar={() => setVista('inicio')} onFechar={fechar} />
                {lista === null ? (
                  <p style={{ fontSize: 13.5, color: 'var(--text2)', padding: '12px 2px' }}>{tc.carregando}</p>
                ) : erroLista ? (
                  <p role="alert" style={{ fontSize: 13.5, color: 'var(--red-text)', padding: '12px 2px' }}>{erroLista}</p>
                ) : lista.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: 'var(--text2)', padding: '12px 2px', lineHeight: 1.55 }}>{tc.vazio}</p>
                ) : (
                  <div style={{ marginBottom: 6 }}>
                    {lista.map((c) => (
                      <Chamado key={c.id} c={c} aberto={chamadoAberto === c.id} onToggle={() => setChamadoAberto((a) => (a === c.id ? null : c.id))} />
                    ))}
                  </div>
                )}
                <button type="button" className="btn-ghost" onClick={() => { setErro(''); setVista('novo') }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 }}>
                  <MessageSquarePlus size={16} aria-hidden="true" /> {lista?.length ? tc.outro : tc.abrir}
                </button>
                <p style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', marginTop: 8 }}>{tc.prazo}</p>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
