// Primeiros passos (A8.10, 21/11/2026): a lista completa dos passos guiados, com o progresso vindo
// dos DADOS REAIS do grupo (lib/primeirosPassos.js). Tocar num passo abre a tela certa já com o
// formulário aberto e a faixa de dica no topo. Cada passo tem "Fazer depois". Antes era um checklist
// de 3 itens (renda, cartão, conta fixa) — os 3 continuam aqui.
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Clock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button, Meter } from '../components/ui'
import { copy } from '../copy/pt-BR'
import Joca from '../components/Joca'
import { useMascote } from '../lib/mascote'
import { usePrimeirosPassos, iniciarPasso } from '../lib/primeirosPassos'

const t = copy.primeirosPassos

// Cofrinho com moedas caindo (ilustração da referência).
function IlustraCofre() {
  return (
    <svg width="220" height="170" viewBox="0 0 220 170" aria-hidden="true">
      <circle className="hf-coin" cx="110" cy="30" r="14" fill="#fbbf24" style={{ animationDelay: '0s' }} />
      <circle className="hf-coin" cx="88" cy="40" r="11" fill="#10b981" style={{ animationDelay: '.9s' }} />
      <circle className="hf-coin" cx="132" cy="42" r="11" fill="#10b981" style={{ animationDelay: '1.8s' }} />
      <rect x="40" y="70" width="140" height="90" rx="24" fill="#10b981" />
      <rect x="86" y="64" width="48" height="12" rx="6" fill="#0f172a" />
      <path d="M78 128 L104 108 L124 118 L150 96" fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Item({ it, onAbrir, onAdiar }) {
  const { feito, adiado } = it
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
      {feito ? (
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="14" cy="14" r="14" fill="var(--accent)" />
          <path className="hf-check" d="M8 14.5 L12.5 19 L20 10" fill="none" stroke="var(--on-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text2)', flexShrink: 0 }}>{it.numero}</span>
      )}
      <button type="button" onClick={feito ? undefined : onAbrir} disabled={feito}
        style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, textAlign: 'left', cursor: feito ? 'default' : 'pointer', color: 'var(--text)', minHeight: 44 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 500, fontSize: 15 }}>{it.titulo}</span>
          <span style={{ fontSize: 13, color: feito ? 'var(--accent-text)' : 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {feito ? t.feito : adiado ? <><Clock size={12} /> {t.adiado}</> : it.subtitulo}
          </span>
        </span>
        {!feito && <ChevronRight size={18} color="var(--text2)" style={{ flexShrink: 0 }} />}
      </button>
      {!feito && !adiado && (
        <button type="button" onClick={onAdiar} style={{ fontSize: 12, color: 'var(--text2)', flexShrink: 0, minHeight: 44, padding: '0 2px' }}>{t.fazerDepois}</button>
      )}
    </div>
  )
}

export default function BoasVindas() {
  const { perfil, user } = useAuth()
  const navigate = useNavigate()
  const { mascote } = useMascote()
  const pp = usePrimeirosPassos(perfil, user)
  const tudo = !pp.carregando && pp.feitos === pp.total
  const abrir = (it) => { iniciarPasso(it.key); navigate(it.rota) }

  return (
    <div className="boas-vindas">
      <div className="boas-vindas-conteudo">
        <div style={{ display: 'flex', justifyContent: 'center' }}>{mascote ? <Joca pose={tudo ? 'comemorando' : 'base'} tamanho={170} eager /> : <IlustraCofre />}</div>

        <div className="hf-in" style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 26, lineHeight: '30px' }}>{t.titulo}</h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: '22px', color: 'var(--text2)' }}>{tudo ? t.tudoPronto : t.subtitulo}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 13, color: 'var(--text2)' }}>
            <span>{t.contador(pp.feitos, pp.total)}</span>
          </div>
          <Meter valor={(pp.feitos / pp.total) * 100} cor="var(--accent)" altura={8} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pp.itens.map(it => (
            <Item key={it.key} it={it} onAbrir={() => abrir(it)} onAdiar={() => pp.adiar(it.key)} />
          ))}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button onClick={() => (pp.proximo ? abrir(pp.proximo) : navigate('/'))} style={{ width: '100%' }}>
            {pp.proximo ? pp.proximo.cta : t.irInicio}
          </Button>
          {pp.proximo && (
            <button type="button" onClick={() => navigate('/')} style={{ fontSize: 14, color: 'var(--text2)', margin: '2px auto 0', minHeight: 44 }}>
              {t.irInicio}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
