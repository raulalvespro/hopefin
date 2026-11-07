import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import termosRaw from '../../docs/LGPD_TERMOS_DE_USO.md?raw'
import privacidadeRaw from '../../docs/LGPD_POLITICA_DE_PRIVACIDADE.md?raw'

// Renderizador de Markdown mínimo (suficiente para os docs legais): títulos,
// citações, listas, negrito, links, linha horizontal e parágrafos.
function inline(txt, key) {
  // Divide por **negrito** e [texto](link), mantendo a ordem.
  const partes = []
  let resto = txt, i = 0
  const re = /\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)/
  let m
  while ((m = resto.match(re))) {
    if (m.index > 0) partes.push(resto.slice(0, m.index))
    if (m[1] != null) partes.push(<strong key={key + '-b' + i}>{m[1]}</strong>)
    else partes.push(
      m[3].startsWith('http')
        ? <a key={key + '-l' + i} href={m[3]} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-text)' }}>{m[2]}</a>
        : <span key={key + '-l' + i}>{m[2]}</span>  // links internos a outros .md: mostra só o texto
    )
    resto = resto.slice(m.index + m[0].length); i++
  }
  if (resto) partes.push(resto)
  return partes
}

function renderMarkdown(md) {
  const linhas = md.split('\n')
  const out = []
  let lista = null
  const fechaLista = () => { if (lista) { out.push(<ul key={'ul' + out.length} style={{ paddingLeft: 20, margin: '8px 0', color: 'var(--text2)' }}>{lista}</ul>); lista = null } }
  linhas.forEach((ln, idx) => {
    const t = ln.trimEnd()
    if (/^\s*[-*]\s+/.test(t)) { lista = lista || []; lista.push(<li key={idx} style={{ marginBottom: 4 }}>{inline(t.replace(/^\s*[-*]\s+/, ''), idx)}</li>); return }
    fechaLista()
    if (t === '') return
    if (t === '---') { out.push(<hr key={idx} style={{ border: 0, borderTop: '1px solid var(--border)', margin: '18px 0' }} />); return }
    if (t.startsWith('### ')) { out.push(<h3 key={idx} style={{ fontSize: 16, marginTop: 18, marginBottom: 6 }}>{inline(t.slice(4), idx)}</h3>); return }
    if (t.startsWith('## ')) { out.push(<h2 key={idx} style={{ fontSize: 18, marginTop: 22, marginBottom: 8 }}>{inline(t.slice(3), idx)}</h2>); return }
    if (t.startsWith('# ')) { out.push(<h1 key={idx} style={{ fontSize: 24, marginBottom: 12 }}>{inline(t.slice(2), idx)}</h1>); return }
    if (t.startsWith('> ')) { out.push(<blockquote key={idx} style={{ borderLeft: '3px solid var(--amber)', background: 'var(--amber-dim)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', margin: '10px 0', fontSize: 13, color: 'var(--text2)' }}>{inline(t.slice(2), idx)}</blockquote>); return }
    out.push(<p key={idx} style={{ margin: '8px 0', color: 'var(--text2)', lineHeight: 1.6 }}>{inline(t, idx)}</p>)
  })
  fechaLista()
  return out
}

export default function Legal({ doc }) {
  const corpo = useMemo(() => renderMarkdown(doc === 'termos' ? termosRaw : privacidadeRaw), [doc])
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 18px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Link to="/login" className="btn-ghost" style={{ padding: 8, display: 'flex' }} aria-label="Voltar"><ArrowLeft size={18} /></Link>
          <span style={{ fontSize: 14, color: 'var(--accent-text)', fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>HopeFin</span>
        </div>
        <div style={{ fontSize: 14.5 }}>{corpo}</div>
        <div style={{ marginTop: 32, display: 'flex', gap: 16, fontSize: 13 }}>
          <Link to="/termos" style={{ color: 'var(--text2)' }}>Termos de Uso</Link>
          <Link to="/privacidade" style={{ color: 'var(--text2)' }}>Política de Privacidade</Link>
        </div>
      </div>
    </div>
  )
}
