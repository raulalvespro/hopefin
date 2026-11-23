import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Sparkles, CalendarDays, CheckCircle2, MessageSquarePlus, Users, ChevronLeft, ChevronRight, Radio,
  ExternalLink, Copy, Film, GalleryHorizontal, LayoutGrid, Image, Send, Loader, RefreshCw,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

// Agência de marketing (Fase 2 do docs/PLANO_AGENCIA_MARKETING.md, migração 0121).
// Mesa de controle do conteúdo do @hopefinapp: calendário das peças, aprovação, pedidos pra agência e a equipe.
// Quem produz são os agentes do Claude Code (repo hopefin-social, skill /agencia); eles leem e escrevem
// nestas mesmas tabelas. Acesso só de admin com o código do celular (RLS sou_admin()).

// Ordem do fluxo (reel): ideia → roteiro → aguardando_narracao → aguardando_musica → producao → revisao →
// pronto → agendado → postado. `voce` = está esperando o Raul (aparece em "Esperando você").
const STATUS = {
  ideia: { nome: 'Ideia', tag: '' },
  roteiro: { nome: 'Equipe escrevendo o roteiro', tag: 'tag-blue' },
  aguardando_narracao: { nome: 'Grave a narração', tag: 'tag-amber', voce: true },
  aguardando_musica: { nome: 'Escolha a música', tag: 'tag-amber', voce: true },
  producao: { nome: 'Equipe montando', tag: 'tag-blue' },
  revisao: { nome: 'Em revisão', tag: 'tag-blue' },
  aprovacao: { nome: 'Aprove a peça', tag: 'tag-amber', voce: true },
  pronto: { nome: 'Aprove a peça', tag: 'tag-amber', voce: true },
  agendado: { nome: 'Aprovado · sai no horário', tag: 'tag-green' },
  postado: { nome: 'Postado', tag: 'tag-green' },
  atrasado: { nome: 'Atrasado', tag: 'tag-red' },
  cancelado: { nome: 'Cancelado', tag: 'tag-red' },
}
const FORMATO = {
  reel: { nome: 'Reel', icon: Film },
  tirinha: { nome: 'Tirinha', icon: LayoutGrid },
  carrossel: { nome: 'Carrossel', icon: GalleryHorizontal },
  estatico: { nome: 'Estático', icon: Image },
  story: { nome: 'Story', icon: Image },
}
const PEDIDO_STATUS = { novo: 'Novo', andamento: 'Em andamento', feito: 'Feito', cancelado: 'Cancelado' }
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const deIso = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d) }
const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const segunda = (d) => somaDias(d, -((d.getDay() + 6) % 7))
const diaMes = (s) => { const d = deIso(s); return `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }
const hora = (h) => (h ? h.slice(0, 5) : '')
/** o horário planejado da peça (data + horário, no fuso do computador) já passou? */
const horarioPassou = (p) => {
  if (!p?.data) return false
  const [hh, mm] = (p.horario || '23:59').split(':').map(Number)
  const d = deIso(p.data); d.setHours(hh, mm, 0, 0)
  return d.getTime() < Date.now()
}
/** "AAAA-MM-DDTHH:MM" pra input datetime-local: agora + `min` minutos, arredondado pra cima de 5 em 5 */
const sugestaoHorario = (min = 60) => {
  const d = new Date(Date.now() + min * 60000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  return `${iso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const msgErro = (e) => (e?.message?.includes('row-level') || e?.code === '42501' ? 'Sem permissão (precisa do código do celular).' : e?.message || 'Não deu certo.')

function Pilula({ ativo, onClick, children }) {
  return (
    <button onClick={onClick} aria-pressed={ativo}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
        border: `1.5px solid ${ativo ? 'var(--accent)' : 'var(--border2)'}`, background: ativo ? 'var(--accent-dim)' : 'var(--bg2)',
        color: ativo ? 'var(--accent-text)' : 'var(--text2)' }}>
      {children}
    </button>
  )
}

export default function Agencia() {
  const { toast } = useToast()
  const [aba, setAba] = useState('calendario')
  const [pecas, setPecas] = useState(null)
  const [aberta, setAberta] = useState(null) // id da peça aberta

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('mkt_pecas').select('*').order('data').order('horario', { nullsFirst: true })
    if (error) { toast(msgErro(error), 'erro'); setPecas([]); return }
    setPecas(data || [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  const salvarPeca = useCallback(async (id, campos, aviso) => {
    const { data, error } = await supabase.from('mkt_pecas').update(campos).eq('id', id).select().single()
    if (error) { toast(msgErro(error), 'erro'); return false }
    setPecas(lista => lista.map(p => (p.id === id ? data : p)))
    if (aviso) toast(aviso, 'ok')
    return true
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const paraAprovar = useMemo(() => (pecas || []).filter(p => STATUS[p.status]?.voce), [pecas])

  return (
    <section className="adm-sec">
      <h2><Sparkles size={16} color="var(--accent)" /> Agência de marketing</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '-4px 0 12px', lineHeight: 1.5 }}>
        O conteúdo do @hopefinapp: o que vai sair, o que está pronto pra você aprovar, os pedidos pra equipe e quem é quem.
        A equipe trabalha no Claude Code (diga “gerente, …” numa conversa na pasta hopefin-social) e atualiza esta tela.
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <Pilula ativo={aba === 'calendario'} onClick={() => setAba('calendario')}><CalendarDays size={14} /> Calendário</Pilula>
        <Pilula ativo={aba === 'aprovar'} onClick={() => setAba('aprovar')}>
          <CheckCircle2 size={14} /> Esperando você {paraAprovar.length > 0 && <span className="tag tag-amber" style={{ padding: '0 7px' }}>{paraAprovar.length}</span>}
        </Pilula>
        <Pilula ativo={aba === 'pedidos'} onClick={() => setAba('pedidos')}><MessageSquarePlus size={14} /> Pedidos</Pilula>
        <Pilula ativo={aba === 'equipe'} onClick={() => setAba('equipe')}><Users size={14} /> Equipe</Pilula>
        <Pilula ativo={aba === 'postagem'} onClick={() => setAba('postagem')}><Radio size={14} /> Postagem automática</Pilula>
        <button className="btn-ghost" onClick={carregar} title="Atualizar" style={{ marginLeft: 'auto', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {pecas === null && <div style={{ padding: 24, textAlign: 'center' }}><Loader size={20} className="spin" color="var(--accent)" /></div>}
      {pecas && aba === 'calendario' && <Calendario pecas={pecas} aberta={aberta} setAberta={setAberta} salvarPeca={salvarPeca} />}
      {pecas && aba === 'aprovar' && <ParaAprovar pecas={paraAprovar} aberta={aberta} setAberta={setAberta} salvarPeca={salvarPeca} />}
      {aba === 'pedidos' && <Pedidos />}
      {aba === 'equipe' && <Equipe />}
      {pecas && aba === 'postagem' && <Postagem pecas={pecas} aberta={aberta} setAberta={setAberta} salvarPeca={salvarPeca} />}
    </section>
  )
}

/* ───────────── Calendário ───────────── */

function Resumo({ pecas, inicio }) {
  const fim = iso(somaDias(inicio, 6))
  const ini = iso(inicio)
  const semana = pecas.filter(p => p.data >= ini && p.data <= fim)
  const n = (f) => semana.filter(f).length
  const cards = [
    ['Peças na semana', semana.length],
    ['Prontas / aprovadas', n(p => ['pronto', 'aprovacao', 'agendado'].includes(p.status))],
    ['Falta produzir', n(p => ['ideia', 'producao', 'revisao'].includes(p.status))],
    ['Postadas', n(p => p.status === 'postado')],
  ]
  return (
    <div className="adm-cards" style={{ marginBottom: 14 }}>
      {cards.map(([k, v]) => <div key={k} className="adm-card"><div className="k">{k}</div><div className="v">{v}</div></div>)}
    </div>
  )
}

function Calendario({ pecas, aberta, setAberta, salvarPeca }) {
  const [inicio, setInicio] = useState(() => segunda(new Date()))
  const dias = Array.from({ length: 7 }, (_, i) => iso(somaDias(inicio, i)))
  const hoje = iso(new Date())
  const titulo = `${diaMes(dias[0])} a ${diaMes(dias[6])}`
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button className="adm-icbtn" onClick={() => setInicio(somaDias(inicio, -7))} aria-label="Semana anterior"><ChevronLeft size={16} /></button>
        <strong style={{ fontSize: 14 }}>{titulo}</strong>
        <button className="adm-icbtn" onClick={() => setInicio(somaDias(inicio, 7))} aria-label="Próxima semana"><ChevronRight size={16} /></button>
        <button className="btn-ghost" onClick={() => setInicio(segunda(new Date()))} style={{ padding: '5px 10px', fontSize: 12 }}>Esta semana</button>
      </div>
      <Resumo pecas={pecas} inicio={inicio} />
      {dias.map(d => {
        const doDia = pecas.filter(p => p.data === d)
        return (
          <div key={d} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: d === hoje ? 'var(--accent-text)' : 'var(--text2)', margin: '0 0 6px', textTransform: 'capitalize' }}>
              {diaMes(d)}{d === hoje ? ' · hoje' : ''}
            </div>
            {doDia.length === 0
              ? <div style={{ fontSize: 12.5, color: 'var(--text3, var(--text2))', padding: '6px 2px' }}>Nada planejado.</div>
              : doDia.map(p => <PecaLinha key={p.id} p={p} aberta={aberta === p.id} onAbrir={() => setAberta(aberta === p.id ? null : p.id)} salvarPeca={salvarPeca} />)}
          </div>
        )
      })}
    </>
  )
}

function PecaLinha({ p, aberta, onAbrir, salvarPeca }) {
  const F = FORMATO[p.formato] || FORMATO.estatico
  const st = STATUS[p.status] || STATUS.ideia
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 6, background: 'var(--bg2)' }}>
      <button onClick={onAbrir} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: 'none', border: 0, textAlign: 'left', color: 'inherit', cursor: 'pointer' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)', width: 38, flexShrink: 0 }}>{hora(p.horario)}</span>
        <F.icon size={15} color="var(--accent)" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0 }}>
          {p.titulo}
          {p.comemorativa && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, color: 'var(--text2)' }}>{p.comemorativa}</span>}
        </span>
        <span className={`tag ${st.tag}`} style={{ flexShrink: 0 }}>{st.nome}</span>
      </button>
      {aberta && <PecaDetalhe p={p} salvarPeca={salvarPeca} />}
    </div>
  )
}

/* ───────────── Narração e música do reel (0123) ───────────── */

const caixa = { background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 12, display: 'grid', gap: 10 }
const tituloCaixa = { fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }

function useUrlAssinada(path) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!path) { setUrl(null); return }
    let vivo = true
    supabase.storage.from('mkt-midia').createSignedUrl(path, 3600).then(({ data }) => { if (vivo) setUrl(data?.signedUrl || null) })
    return () => { vivo = false }
  }, [path])
  return url
}

/** Próximo status do reel depois que o Raul fez a parte dele. */
function proximoStatus(p, { temNarracao, temMusica }) {
  if (!['ideia', 'roteiro', 'aguardando_narracao', 'aguardando_musica'].includes(p.status)) return p.status
  if (temNarracao && temMusica) return 'producao'
  if (!temNarracao) return 'aguardando_narracao'
  return 'aguardando_musica'
}

function Narracao({ p, salvarPeca }) {
  const { toast } = useToast()
  const url = useUrlAssinada(p.narracao_path)
  const [gravando, setGravando] = useState(null) // { rec, inicio }
  const [segundos, setSegundos] = useState(0)
  const [gravado, setGravado] = useState(null) // { blob, url }
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!gravando) return
    const t = setInterval(() => setSegundos(Math.round((Date.now() - gravando.inicio) / 1000)), 500)
    return () => clearInterval(t)
  }, [gravando])
  useEffect(() => () => { if (gravado?.url) URL.revokeObjectURL(gravado.url) }, [gravado])

  async function comecar() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const tipo = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => window.MediaRecorder?.isTypeSupported?.(t)) || ''
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined)
      const partes = []
      rec.ondataavailable = e => e.data.size && partes.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(partes, { type: rec.mimeType || 'audio/webm' })
        setGravado({ blob, url: URL.createObjectURL(blob) })
      }
      rec.start()
      setGravado(null); setSegundos(0); setGravando({ rec, inicio: Date.now() })
    } catch {
      toast('Não consegui usar o microfone. Libere o acesso no navegador ou suba um arquivo.', 'erro')
    }
  }
  function parar() { gravando?.rec.stop(); setGravando(null) }

  async function enviar(blob) {
    const tipo = (blob.type || 'audio/webm').split(';')[0]
    const ext = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg' }[tipo] || 'webm'
    const caminho = `narracao/${p.slug || p.id}-${Date.now()}.${ext}`
    setEnviando(true)
    const { error } = await supabase.storage.from('mkt-midia').upload(caminho, blob, { contentType: tipo, upsert: false })
    if (error) { setEnviando(false); toast(msgErro(error), 'erro'); return }
    const status = proximoStatus(p, { temNarracao: true, temMusica: !!p.musica_escolhida })
    await salvarPeca(p.id, { narracao_path: caminho, narracao_em: new Date().toISOString(), status },
      status === 'producao' ? 'Narração recebida. A equipe já pode montar o reel.' : 'Narração recebida. Agora escolha a música.')
    setEnviando(false); setGravado(null)
  }
  const copiar = async () => { try { await navigator.clipboard.writeText(p.roteiro_narracao || ''); toast('Roteiro copiado.', 'ok') } catch { /* ignore */ } }

  return (
    <div style={caixa}>
      <div style={tituloCaixa}>🎙️ Narração {p.narracao_path ? <span className="tag tag-green">recebida</span> : <span className="tag tag-amber">falta gravar</span>}</div>
      {p.roteiro_narracao
        ? (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'var(--bg2)', borderRadius: 10, padding: '10px 12px' }}>{p.roteiro_narracao}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              Leia como se falasse com um amigo e faça uma pausa de 1 segundo entre as linhas. Errou? Grave de novo.
              <button className="btn-ghost" onClick={copiar} style={{ padding: '2px 8px', fontSize: 11.5, display: 'inline-flex', gap: 4, alignItems: 'center' }}><Copy size={11} /> Copiar</button>
            </div>
          </>
        )
        : <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>A equipe ainda vai escrever o roteiro da narração.</div>}
      {url && !gravado && <audio src={url} controls preload="metadata" style={{ width: '100%' }} />}
      {gravado && (
        <div style={{ display: 'grid', gap: 6 }}>
          <audio src={gravado.url} controls style={{ width: '100%' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={() => enviar(gravado.blob)} disabled={enviando} style={{ padding: '7px 14px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
              {enviando ? <Loader size={13} className="spin" /> : <Send size={13} />} Enviar essa gravação
            </button>
            <button className="btn-ghost" onClick={() => setGravado(null)} disabled={enviando} style={{ padding: '7px 14px', fontSize: 13 }}>Descartar</button>
          </div>
        </div>
      )}
      {p.roteiro_narracao && !gravado && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {gravando
            ? <button className="btn-primary" onClick={parar} style={{ padding: '7px 14px', fontSize: 13, background: 'var(--red)', borderColor: 'var(--red)' }}>■ Parar ({segundos}s)</button>
            : <button className="btn-primary" onClick={comecar} disabled={enviando} style={{ padding: '7px 14px', fontSize: 13 }}>● {p.narracao_path ? 'Gravar de novo' : 'Gravar agora'}</button>}
          <label className="btn-ghost" style={{ padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>
            Subir um arquivo
            <input type="file" accept="audio/*" style={{ display: 'none' }} disabled={enviando || !!gravando}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) enviar(f) }} />
          </label>
          {enviando && <Loader size={15} className="spin" color="var(--accent)" />}
        </div>
      )}
    </div>
  )
}

function OpcaoMusica({ m, escolhida, onEscolher, ocupado }) {
  const url = useUrlAssinada(m.path)
  return (
    <div style={{ border: `1.5px solid ${escolhida ? 'var(--accent)' : 'var(--border)'}`, background: escolhida ? 'var(--accent-dim)' : 'var(--bg2)', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13.5 }}>{m.titulo}</strong>
        {m.artista && <span style={{ fontSize: 12, color: 'var(--text2)' }}>{m.artista}</span>}
        {m.clima && <span className="tag" style={{ fontSize: 11 }}>{m.clima}</span>}
        {m.duracao && <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{m.duracao}</span>}
        {escolhida
          ? <span className="tag tag-green" style={{ marginLeft: 'auto' }}>escolhida</span>
          : <button className="btn-ghost" onClick={onEscolher} disabled={ocupado} style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: 12.5 }}>Escolher</button>}
      </div>
      {m.motivo && <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 }}>{m.motivo}</div>}
      {url ? <audio src={url} controls preload="none" style={{ width: '100%', height: 34 }} /> : m.path && <Loader size={14} className="spin" color="var(--accent)" />}
    </div>
  )
}

function Musica({ p, salvarPeca }) {
  const [ocupado, setOcupado] = useState(false)
  const opcoes = Array.isArray(p.musica_opcoes) ? p.musica_opcoes : []
  async function escolher(m) {
    setOcupado(true)
    const status = proximoStatus(p, { temNarracao: !!p.narracao_path, temMusica: true })
    await salvarPeca(p.id, { musica_escolhida: m, status },
      status === 'producao' ? `“${m.titulo}” escolhida. A equipe já pode montar o reel.` : `“${m.titulo}” escolhida. Falta a narração.`)
    setOcupado(false)
  }
  return (
    <div style={caixa}>
      <div style={tituloCaixa}>🎵 Música (Meta Sound Collection) {p.musica_escolhida ? <span className="tag tag-green">escolhida</span> : opcoes.length ? <span className="tag tag-amber">escolha 1 de {opcoes.length}</span> : null}</div>
      {opcoes.length === 0
        ? <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>A equipe ainda vai separar 5 opções pra esse reel.</div>
        : opcoes.map((m, i) => (
          <OpcaoMusica key={m.path || i} m={m} ocupado={ocupado} onEscolher={() => escolher(m)}
            escolhida={!!p.musica_escolhida && (p.musica_escolhida.path ? p.musica_escolhida.path === m.path : p.musica_escolhida.titulo === m.titulo)} />
        ))}
    </div>
  )
}

/** Prévia da peça (bucket privado mkt-midia, 0122): reel em player 9:16 com a capa; carrossel/tirinha em faixa
 *  com rolagem lateral, como no Instagram. URLs assinadas por 1 h (só admin com o código do celular). */
function Previa({ midia }) {
  const [urls, setUrls] = useState(null)
  const [atual, setAtual] = useState(0)
  const chave = (midia || []).map(m => m.path).join('|')

  useEffect(() => {
    const lista = midia || []
    if (!lista.length) { setUrls({}); return }
    let vivo = true
    supabase.storage.from('mkt-midia').createSignedUrls(lista.map(m => m.path), 3600).then(({ data }) => {
      if (!vivo) return
      const mapa = {}
      for (const d of data || []) if (d.signedUrl) mapa[d.path] = d.signedUrl
      setUrls(mapa)
    })
    return () => { vivo = false }
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!midia?.length) return <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>Sem prévia ainda (a equipe sobe quando marca a peça como pronta).</div>
  if (!urls) return <Loader size={18} className="spin" color="var(--accent)" />

  const video = midia.find(m => m.tipo === 'video')
  const capa = midia.find(m => m.tipo === 'capa')
  if (video) {
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <video src={urls[video.path]} poster={capa ? urls[capa.path] : undefined} controls playsInline preload="metadata"
          style={{ width: 270, aspectRatio: '9 / 16', borderRadius: 14, background: '#000', boxShadow: '0 10px 28px rgba(15,23,42,0.18)' }} />
        {capa && (
          <a href={urls[capa.path]} target="_blank" rel="noreferrer" title="Abrir a capa"
            style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: 'var(--text2)', textDecoration: 'none' }}>
            <img src={urls[capa.path]} alt="Capa do reel" style={{ width: 120, aspectRatio: '9 / 16', objectFit: 'cover', borderRadius: 10 }} />
            capa
          </a>
        )}
      </div>
    )
  }

  const imagens = midia.filter(m => m.tipo === 'imagem')
  const ir = (i) => {
    const alvo = Math.max(0, Math.min(imagens.length - 1, i))
    setAtual(alvo)
    // rola só a faixa (scrollIntoView mexia na página inteira)
    const faixa = document.getElementById(`faixa-${chave}`)
    const slide = document.getElementById(`previa-${chave}-${alvo}`)
    if (faixa && slide) faixa.scrollTo({ left: slide.offsetLeft - faixa.offsetLeft, behavior: 'smooth' })
  }
  return (
    // minWidth 0: sem isso a faixa (item de grid/flex) cresce até caber todos os slides e estoura o painel
    <div style={{ minWidth: 0, maxWidth: '100%' }}>
      <div id={`faixa-${chave}`} style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 6, maxWidth: '100%' }}
        onScroll={e => { const w = e.currentTarget.firstChild?.getBoundingClientRect().width || 1; setAtual(Math.round(e.currentTarget.scrollLeft / (w + 10))) }}>
        {imagens.map((m, i) => (
          <a key={m.path} id={`previa-${chave}-${i}`} href={urls[m.path]} target="_blank" rel="noreferrer" title={`Slide ${i + 1} (abrir grande)`}
            style={{ flex: '0 0 auto', scrollSnapAlign: 'start' }}>
            <img src={urls[m.path]} alt={`Slide ${i + 1}`} loading="lazy"
              style={{ width: 'min(260px, 70vw)', aspectRatio: '4 / 5', objectFit: 'cover', borderRadius: 12, display: 'block', boxShadow: '0 8px 22px rgba(15,23,42,0.14)' }} />
          </a>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12, color: 'var(--text2)' }}>
        <button className="adm-icbtn" onClick={() => ir(atual - 1)} disabled={atual <= 0} aria-label="Slide anterior"><ChevronLeft size={15} /></button>
        <span>{Math.min(atual + 1, imagens.length)} / {imagens.length}</span>
        <button className="adm-icbtn" onClick={() => ir(atual + 1)} disabled={atual >= imagens.length - 1} aria-label="Próximo slide"><ChevronRight size={15} /></button>
      </div>
    </div>
  )
}

function PecaDetalhe({ p, salvarPeca }) {
  const { toast } = useToast()
  const [legenda, setLegenda] = useState(p.legenda || '')
  const [link, setLink] = useState(p.link_post || '')
  const [comentarios, setComentarios] = useState(null)
  const [nota, setNota] = useState('')

  const carregarComentarios = useCallback(async () => {
    const { data } = await supabase.from('mkt_comentarios').select('*').eq('peca_id', p.id).order('criado_em')
    setComentarios(data || [])
  }, [p.id])
  useEffect(() => { carregarComentarios() }, [carregarComentarios])

  async function comentar(tipo, texto) {
    const { error } = await supabase.from('mkt_comentarios').insert({ peca_id: p.id, autor: 'raul', tipo, texto })
    if (error) { toast(msgErro(error), 'erro'); return false }
    carregarComentarios()
    return true
  }
  const [quando, setQuando] = useState(null) // pergunta "postar agora ou remarcar?" aberta
  const [novaHora, setNovaHora] = useState('')
  const vencida = horarioPassou(p)

  async function aprovar() {
    // aprovou depois do horário planejado? pergunta antes: postar agora ou outro horário
    if (vencida) { setQuando('aprovar'); setNovaHora(sugestaoHorario()); return }
    if (await salvarPeca(p.id, { status: 'agendado' }, 'Aprovado. Fica pronto pra sair no horário.')) await comentar('aprovado', nota.trim())
    setNota('')
  }
  async function definirHorario(agora) {
    const alvo = agora ? sugestaoHorario(0) : novaHora
    if (!alvo) { toast('Escolha a data e a hora.', 'erro'); return }
    const [data, hh] = alvo.split('T')
    const aprovando = quando === 'aprovar'
    const ok = await salvarPeca(p.id, { status: 'agendado', data, horario: `${hh}:00` },
      agora ? 'Aprovado pra sair agora: a equipe posta assim que pegar.' : `Aprovado pra ${diaMes(data)} às ${hh}.`)
    if (!ok) return
    if (aprovando) await comentar('aprovado', [agora ? 'Postar agora.' : `Novo horário: ${diaMes(data)} ${hh}.`, nota.trim()].filter(Boolean).join(' '))
    else await comentar('comentario', agora ? 'Horário passou: postar agora.' : `Remarcado pra ${diaMes(data)} ${hh}.`)
    setNota(''); setQuando(null)
  }
  async function pedirAjuste() {
    if (!nota.trim()) { toast('Escreva o que ajustar.', 'erro'); return }
    if (await comentar('ajuste', nota.trim())) await salvarPeca(p.id, { status: 'producao' }, 'Ajuste pedido. A equipe vê na próxima rodada.')
    setNota('')
  }
  async function marcarPostado() {
    await salvarPeca(p.id, { status: 'postado', link_post: link.trim() || null, postado_em: new Date().toISOString() }, 'Marcado como postado.')
  }
  const copiar = async () => { try { await navigator.clipboard.writeText(legenda); toast('Legenda copiada.', 'ok') } catch { toast('Não deu pra copiar.', 'erro') } }

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      {p.ideia && <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}><strong style={{ color: 'var(--text)' }}>Ideia: </strong>{p.ideia}</div>}
      {p.formato === 'reel' && <Narracao p={p} salvarPeca={salvarPeca} />}
      {p.formato === 'reel' && <Musica p={p} salvarPeca={salvarPeca} />}
      <Previa midia={p.midia} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {p.arquivo_url
          ? <a className="btn-ghost" href={p.arquivo_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '6px 12px' }}><ExternalLink size={13} /> Ver no Drive</a>
          : <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>Ainda sem arquivo.</span>}
        {p.link_post && <a className="btn-ghost" href={p.link_post} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '6px 12px' }}><ExternalLink size={13} /> Ver no Instagram</a>}
        {p.slug && <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>roteiro: {p.slug}</span>}
        <label style={{ fontSize: 12.5, color: 'var(--text2)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          Status
          <select value={p.status} onChange={e => salvarPeca(p.id, { status: e.target.value }, 'Status atualizado.')} style={{ fontSize: 12.5, padding: '4px 8px' }}>
            {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.nome}</option>)}
          </select>
        </label>
      </div>

      <div className="form-group" style={{ margin: 0 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Legenda
          {legenda && <button className="btn-ghost" onClick={copiar} style={{ padding: '2px 8px', fontSize: 11.5, display: 'inline-flex', gap: 4, alignItems: 'center' }}><Copy size={11} /> Copiar</button>}
        </label>
        <textarea rows={legenda ? 6 : 2} value={legenda} onChange={e => setLegenda(e.target.value)} placeholder="A equipe escreve; você pode ajustar aqui."
          style={{ width: '100%', resize: 'vertical', fontSize: 13 }} />
        {legenda !== (p.legenda || '') && (
          <button className="btn-primary" onClick={() => salvarPeca(p.id, { legenda }, 'Legenda salva.')} style={{ marginTop: 6, padding: '6px 12px', fontSize: 12.5 }}>Salvar legenda</button>
        )}
      </div>

      <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Recado pra equipe (vai junto com a aprovação ou o pedido de ajuste)</label>
          <textarea rows={2} value={nota} onChange={e => setNota(e.target.value)} placeholder="Ex.: troca o gancho por uma pergunta; o Joca está pequeno no último slide." style={{ width: '100%', resize: 'vertical', fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={aprovar} disabled={p.status === 'agendado' || p.status === 'postado'} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '7px 14px', fontSize: 13 }}><CheckCircle2 size={14} /> Aprovar</button>
          <button className="btn-ghost" onClick={pedirAjuste} style={{ padding: '7px 14px', fontSize: 13 }}>Pedir ajuste</button>
          {nota.trim() && <button className="btn-ghost" onClick={async () => { if (await comentar('comentario', nota.trim())) setNota('') }} style={{ padding: '7px 14px', fontSize: 13 }}>Só comentar</button>}
        </div>
        {!quando && p.status === 'agendado' && vencida && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--amber-text)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            Aprovada pra {diaMes(p.data)} às {hora(p.horario)}, mas o horário passou e ainda não saiu.
            <button className="btn-ghost" onClick={() => { setQuando('remarcar'); setNovaHora(sugestaoHorario()) }} style={{ padding: '4px 10px', fontSize: 12.5 }}>Resolver</button>
          </div>
        )}
        {quando && (
          <div style={{ marginTop: 10, border: '1.5px solid var(--amber)', borderRadius: 10, padding: 12, display: 'grid', gap: 10, background: 'var(--bg2)' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              O horário planejado ({diaMes(p.data)} às {hora(p.horario)}) já passou. Quando essa peça sai?
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <button className="btn-primary" onClick={() => definirHorario(true)} style={{ padding: '7px 14px', fontSize: 13 }}>Postar agora</button>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>ou</span>
              <input type="datetime-local" value={novaHora} min={sugestaoHorario(0)} onChange={e => setNovaHora(e.target.value)} style={{ fontSize: 13, padding: '5px 8px' }} />
              <button className="btn-ghost" onClick={() => definirHorario(false)} style={{ padding: '7px 14px', fontSize: 13 }}>Usar esse horário</button>
              <button className="btn-ghost" onClick={() => setQuando(null)} style={{ padding: '7px 10px', fontSize: 12.5 }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 220 }}>
          <label>Link do post no Instagram</label>
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://www.instagram.com/p/…" />
        </div>
        <button className="btn-ghost" onClick={marcarPostado} disabled={p.status === 'postado' && link === (p.link_post || '')} style={{ padding: '8px 14px', fontSize: 13 }}>Marcar como postado</button>
      </div>

      {comentarios && comentarios.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>Histórico</div>
          {comentarios.map(c => (
            <div key={c.id} style={{ fontSize: 12.5, padding: '6px 0', borderTop: '1px dashed var(--border)' }}>
              <span className={`tag ${c.tipo === 'aprovado' ? 'tag-green' : c.tipo === 'ajuste' ? 'tag-amber' : ''}`} style={{ marginRight: 6 }}>
                {c.tipo === 'aprovado' ? 'aprovado' : c.tipo === 'ajuste' ? 'ajuste' : c.autor}
              </span>
              {c.texto || '—'}
              <span style={{ color: 'var(--text2)', marginLeft: 6, fontSize: 11.5 }}>{new Date(c.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ───────────── Pra aprovar ───────────── */

function ParaAprovar({ pecas, aberta, setAberta, salvarPeca }) {
  if (!pecas.length) return <div style={{ fontSize: 13, color: 'var(--text2)', padding: '10px 2px' }}>Nada esperando você agora. 🎉</div>
  return (
    <>
      <p style={{ fontSize: 12.5, color: 'var(--text2)', margin: '0 0 10px' }}>
        O que está parado esperando você: gravar a narração do reel, escolher a música ou aprovar a peça pronta
        (ou pedir ajuste com um recado). Abra cada uma.
      </p>
      {pecas.map(p => (
        <div key={p.id}>
          <div style={{ fontSize: 12, color: 'var(--text2)', margin: '8px 0 4px', textTransform: 'capitalize' }}>{diaMes(p.data)}</div>
          <PecaLinha p={p} aberta={aberta === p.id} onAbrir={() => setAberta(aberta === p.id ? null : p.id)} salvarPeca={salvarPeca} />
        </div>
      ))}
    </>
  )
}

/* ───────────── Postagem automática (Fase 3, 0124 + função mkt-publicar) ───────────── */

function Interruptor({ ligado, onChange, disabled, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <input type="checkbox" checked={!!ligado} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />
      {children}
    </label>
  )
}

function Postagem({ pecas, aberta, setAberta, salvarPeca }) {
  const { toast } = useToast()
  const [cfg, setCfg] = useState(null)
  const [confirmar, setConfirmar] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('mkt_config').select('*').eq('id', 1).maybeSingle()
    if (error) toast(msgErro(error), 'erro')
    setCfg(data || {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  async function salvar(campos, aviso) {
    const { error } = await supabase.from('mkt_config').update(campos).eq('id', 1)
    if (error) { toast(msgErro(error), 'erro'); return }
    toast(aviso, 'ok'); setConfirmar(false); carregar()
  }

  const agendadas = pecas.filter(p => p.status === 'agendado').sort((a, b) => `${a.data}${a.horario}`.localeCompare(`${b.data}${b.horario}`))
  const vencidas = agendadas.filter(horarioPassou)
  const comErro = pecas.filter(p => p.pub_erro)
  const conectado = !!(cfg?.ig_user_id)

  if (!cfg) return <Loader size={18} className="spin" color="var(--accent)" />
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="adm-card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>Postagem automática</strong>
          {cfg.publicar_ativo ? <span className="tag tag-green">ligada</span> : <span className="tag tag-amber">desligada</span>}
          {conectado ? <span className="tag tag-green">Meta conectada</span> : <span className="tag tag-red">Meta não conectada</span>}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
          Ligada, a cada 5 minutos o sistema publica as peças <strong>aprovadas</strong> cujo horário chegou: reel, carrossel, tirinha e
          imagem no @hopefinapp (e na Página, se ligar abaixo). Música só a que já vem dentro do vídeo; carrossel e tirinha sem música.
          {conectado && <> Instagram id {cfg.ig_user_id} · Página id {cfg.fb_page_id || '—'}.</>}
        </div>
        {!cfg.publicar_ativo && !confirmar && (
          <button className="btn-primary" disabled={!conectado} onClick={() => setConfirmar(true)} style={{ justifySelf: 'start', padding: '8px 16px' }}>Ligar postagem automática</button>
        )}
        {!cfg.publicar_ativo && confirmar && (
          <div style={{ border: '1.5px solid var(--amber)', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {vencidas.length
                ? `Ao ligar, ${vencidas.length === 1 ? 'esta peça aprovada sai' : `estas ${vencidas.length} peças aprovadas saem`} em até 5 minutos, porque o horário já passou:`
                : 'Nenhuma peça aprovada está com o horário vencido. As próximas saem no horário marcado.'}
            </div>
            {vencidas.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{vencidas.map(p => <li key={p.id}>{diaMes(p.data)} {hora(p.horario)} · {FORMATO[p.formato]?.nome} · {p.titulo}</li>)}</ul>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={() => salvar({ publicar_ativo: true }, 'Postagem automática ligada.')} style={{ padding: '7px 14px' }}>Sim, ligar</button>
              <button className="btn-ghost" onClick={() => setConfirmar(false)} style={{ padding: '7px 14px' }}>Cancelar</button>
            </div>
          </div>
        )}
        {cfg.publicar_ativo && (
          <button className="btn-ghost" onClick={() => salvar({ publicar_ativo: false }, 'Postagem automática desligada. Nada sai até ligar de novo.')} style={{ justifySelf: 'start', padding: '8px 16px', color: 'var(--red-text)' }}>Desligar (pausa tudo)</button>
        )}
        <div style={{ display: 'grid', gap: 6, borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
          <Interruptor ligado={cfg.publicar_instagram} onChange={v => salvar({ publicar_instagram: v }, v ? 'Instagram ligado.' : 'Instagram desligado.')}>Publicar no Instagram (@hopefinapp)</Interruptor>
          <Interruptor ligado={cfg.publicar_facebook} onChange={v => salvar({ publicar_facebook: v }, v ? 'Página do Facebook ligada.' : 'Página do Facebook desligada.')}>Publicar também na Página do Facebook</Interruptor>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Próximas a sair (aprovadas)</div>
        {agendadas.length === 0
          ? <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>Nenhuma peça aprovada. Aprove na aba Esperando você.</div>
          : agendadas.slice(0, 10).map(p => (
            <div key={p.id}>
              <div style={{ fontSize: 12, color: horarioPassou(p) ? 'var(--amber-text)' : 'var(--text2)', margin: '6px 0 4px', textTransform: 'capitalize' }}>
                {diaMes(p.data)}{horarioPassou(p) ? ' · horário já passou' : ''}
              </div>
              <PecaLinha p={p} aberta={aberta === p.id} onAbrir={() => setAberta(aberta === p.id ? null : p.id)} salvarPeca={salvarPeca} />
            </div>
          ))}
      </div>

      {comErro.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--red-text)' }}>Com erro na publicação</div>
          {comErro.map(p => (
            <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 6, fontSize: 12.5 }}>
              <strong>{diaMes(p.data)} {hora(p.horario)} · {p.titulo}</strong> — tentativa {p.pub_tentativas || 0}/3
              <div style={{ color: 'var(--red-text)', marginTop: 4 }}>{p.pub_erro}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ───────────── Pedidos ───────────── */

function Pedidos() {
  const { toast } = useToast()
  const [lista, setLista] = useState(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('mkt_pedidos').select('*').order('criado_em', { ascending: false })
    if (error) toast(msgErro(error), 'erro')
    setLista(data || [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  async function enviar() {
    if (texto.trim().length < 3) return
    setEnviando(true)
    const { error } = await supabase.from('mkt_pedidos').insert({ texto: texto.trim() })
    setEnviando(false)
    if (error) { toast(msgErro(error), 'erro'); return }
    setTexto(''); toast('Pedido anotado. O gerente pega na próxima rodada.', 'ok'); carregar()
  }
  async function mudarStatus(p, status) {
    const { error } = await supabase.from('mkt_pedidos').update({ status }).eq('id', p.id)
    if (error) { toast(msgErro(error), 'erro'); return }
    carregar()
  }

  return (
    <>
      <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 14 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>O que você quer da agência?</label>
          <textarea rows={3} value={texto} onChange={e => setTexto(e.target.value)} style={{ width: '100%', resize: 'vertical' }}
            placeholder="Ex.: um reel sobre o 13º pra segunda; carrossel de Natal mais leve; testar postar às 21h." />
        </div>
        <button className="btn-primary" onClick={enviar} disabled={enviando || texto.trim().length < 3} style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Send size={14} /> Mandar pro gerente
        </button>
      </div>
      {lista === null ? <Loader size={18} className="spin" color="var(--accent)" />
        : lista.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text2)' }}>Nenhum pedido ainda.</div>
          : lista.map(p => (
            <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{p.texto}</div>
                <select value={p.status} onChange={e => mudarStatus(p, e.target.value)} style={{ fontSize: 12, padding: '3px 6px' }}>
                  {Object.entries(PEDIDO_STATUS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </div>
              {p.resposta && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}><strong style={{ color: 'var(--text)' }}>Gerente: </strong>{p.resposta}</div>}
              <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--text2)' }}>{new Date(p.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
            </div>
          ))}
    </>
  )
}

/* ───────────── Equipe ───────────── */

function Equipe() {
  const { toast } = useToast()
  const [lista, setLista] = useState(null)
  const [rascunho, setRascunho] = useState({})

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('mkt_agentes').select('*').order('ordem')
    if (error) toast(msgErro(error), 'erro')
    setLista(data || [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  async function salvar(a, campos, aviso) {
    const { error } = await supabase.from('mkt_agentes').update(campos).eq('id', a.id)
    if (error) { toast(msgErro(error), 'erro'); return }
    toast(aviso, 'ok')
    setRascunho(r => { const x = { ...r }; delete x[a.id]; return x })
    carregar()
  }

  if (lista === null) return <Loader size={18} className="spin" color="var(--accent)" />
  return (
    <>
      <p style={{ fontSize: 12.5, color: 'var(--text2)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Cada membro da agência. Em “Como eu quero que trabalhe” você molda o jeito dele: o gerente lê essas notas no começo de cada rodada
        e elas valem por cima das instruções padrão. Regras que valem pra todos ficam em docs/agencia/REGRAS-DA-MARCA.md (hopefin-social).
      </p>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {lista.map(a => {
          const val = rascunho[a.id] ?? a.instrucoes ?? ''
          const mudou = val !== (a.instrucoes ?? '')
          return (
            <div key={a.id} className="adm-card" style={{ opacity: a.ativo ? 1 : 0.65 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <strong style={{ fontSize: 14 }}>{a.nome}</strong>
                {!a.ativo && <span className="tag">fase 4</span>}
                <label style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input type="checkbox" checked={a.ativo} onChange={e => salvar(a, { ativo: e.target.checked }, e.target.checked ? `${a.nome} ativado.` : `${a.nome} pausado.`)} /> ativo
                </label>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45, marginBottom: 8 }}>{a.funcao}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{a.id === 'gerente' ? 'skill /agencia' : `.claude/agents/${a.id}.md`}</div>
              <textarea rows={3} value={val} onChange={e => setRascunho(r => ({ ...r, [a.id]: e.target.value }))}
                placeholder="Como eu quero que trabalhe (ex.: ganchos sempre em forma de pergunta; nada de emoji no título)."
                style={{ width: '100%', resize: 'vertical', fontSize: 12.5 }} />
              {mudou && <button className="btn-primary" onClick={() => salvar(a, { instrucoes: val.trim() || null }, `Notas do ${a.nome} salvas.`)} style={{ marginTop: 6, padding: '5px 12px', fontSize: 12.5 }}>Salvar</button>}
            </div>
          )
        })}
      </div>
    </>
  )
}
