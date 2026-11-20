import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { HelpCircle, X, ChevronDown, Mail, Compass } from 'lucide-react'
import { copy } from '../copy/pt-BR'

const t = copy.ajuda

// Perguntas da tela aberta (curadoria por tela, L29). Tela sem curadoria: só as gerais.
export function perguntasDaTela(caminho) {
  const limpo = String(caminho || '/').replace(/\/+$/, '') || '/'
  return t.telas[limpo] || null
}

function Pergunta({ item, aberta, onToggle, id }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button type="button" onClick={onToggle} aria-expanded={aberta} aria-controls={id}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 2px', minHeight: 44, textAlign: 'left', color: 'var(--text)', fontSize: 14, fontWeight: 500 }}>
        <span>{item.p}</span>
        <ChevronDown size={16} color="var(--text3)" aria-hidden="true"
          style={{ flexShrink: 0, transform: aberta ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-fast, .15s) var(--ease, ease)' }} />
      </button>
      {aberta && (
        <p id={id} style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text2)', margin: '0 2px 12px' }}>{item.r}</p>
      )}
    </div>
  )
}

// Botão "?" do topo + folha de Ajuda. O Layout só mostra com a chave de recurso "ajuda".
export default function Ajuda() {
  const location = useLocation()
  const [aberto, setAberto] = useState(false)
  const [abertaId, setAbertaId] = useState(null)
  const tela = perguntasDaTela(location.pathname)
  const nomeTela = tela?.nome || 'o app'
  const assunto = encodeURIComponent(t.assuntoEmail(nomeTela))

  function abrir() { setAbertaId(null); setAberto(true) }
  const alternar = (id) => setAbertaId((a) => (a === id ? null : id))

  return (
    <>
      <button type="button" onClick={abrir} aria-label={t.botao} title={t.botao}
        style={{ display: 'flex', alignItems: 'center', color: aberto ? 'var(--accent)' : 'var(--text3)' }}>
        <HelpCircle size={19} />
      </button>

      {/* Portal: o cabeçalho é "sticky" com camada própria; fora dele a folha cobre tudo */}
      {aberto && createPortal(
        <div className="modal-overlay" onClick={() => setAberto(false)}>
          <div className="modal" role="dialog" aria-label={t.titulo} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <HelpCircle size={18} color="var(--accent)" /> {t.titulo}
              </h2>
              <button type="button" onClick={() => setAberto(false)} aria-label={t.fechar}
                style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <X size={20} color="var(--text2)" />
              </button>
            </div>

            {tela && (
              <section style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 2px 2px' }}>{t.nestaTela(tela.nome)}</p>
                {tela.perguntas.map((item, i) => (
                  <Pergunta key={`t${i}`} id={`ajuda-t${i}`} item={item} aberta={abertaId === `t${i}`} onToggle={() => alternar(`t${i}`)} />
                ))}
              </section>
            )}

            <section style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 2px 2px' }}>{t.gerais}</p>
              {t.perguntasGerais.map((item, i) => (
                <Pergunta key={`g${i}`} id={`ajuda-g${i}`} item={item} aberta={abertaId === `g${i}`} onToggle={() => alternar(`g${i}`)} />
              ))}
            </section>

            <div className="card" style={{ margin: 0, background: 'var(--bg3)' }}>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>{t.naoAchou}</p>
              <a href={`mailto:${t.email}?subject=${assunto}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text)', minHeight: 44 }}>
                <Mail size={18} color="var(--accent)" />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontFamily: 'Syne', fontSize: 14 }}>{t.falar}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)' }}>{t.email} · {t.falarSub}</span>
                </span>
              </a>
              <Link to="/tour?rever=1" onClick={() => setAberto(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--accent-text)', fontSize: 13, fontWeight: 500, marginTop: 6, minHeight: 44 }}>
                <Compass size={16} /> {t.passeio}
              </Link>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
