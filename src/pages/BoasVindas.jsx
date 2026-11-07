// Boas-vindas depois do cadastro: checklist "N de 3" (renda, cartão, conta fixa)
// com o progresso vindo dos DADOS REAIS do grupo (contagem de entradas/cartões/
// contas fixas). Cada item abre o formulário certo; há atalho para convidar a
// família. Não muda auth nem banco — só lê contagens e navega.
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, UserPlus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, Meter } from '../components/ui'
import { copy } from '../copy/pt-BR'

const t = copy.boasVindas
// Ordem dos passos e como cada um é considerado "feito" no banco.
const PASSOS = [
  { key: 'renda', rota: '/entradas', tabela: 'entradas', soAtivo: false },
  { key: 'cartao', rota: '/cartoes', tabela: 'cartoes', soAtivo: true },
  { key: 'conta', rota: '/contas-fixas', tabela: 'contas_fixas', soAtivo: true },
]

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

function Item({ feito, titulo, subtitulo, onClick }) {
  return (
    <button type="button" onClick={feito ? undefined : onClick} disabled={feito}
      style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, cursor: feito ? 'default' : 'pointer' }}>
      {feito ? (
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="14" cy="14" r="14" fill="var(--accent)" />
          <path className="hf-check" d="M8 14.5 L12.5 19 L20 10" fill="none" stroke="var(--on-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" style={{ flexShrink: 0 }}>
          <circle cx="14" cy="14" r="13" fill="none" stroke="var(--text3)" strokeWidth="2" />
        </svg>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 500, fontSize: 15, color: 'var(--text)' }}>{titulo}</span>
        <span style={{ fontSize: 13, color: feito ? 'var(--accent-text)' : 'var(--text2)' }}>{feito ? t.feito : subtitulo}</span>
      </span>
      {!feito && <ChevronRight size={18} color="var(--text2)" style={{ flexShrink: 0 }} />}
    </button>
  )
}

export default function BoasVindas() {
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const [feitos, setFeitos] = useState(null) // { renda, cartao, conta } | null (carregando)

  useEffect(() => {
    const gid = perfil?.grupo_id
    if (!gid) return
    let vivo = true
    Promise.all(PASSOS.map(p => {
      let q = supabase.from(p.tabela).select('id', { count: 'exact', head: true }).eq('grupo_id', gid)
      if (p.soAtivo) q = q.eq('ativo', true)
      return q
    })).then(res => {
      if (!vivo) return
      const f = {}
      PASSOS.forEach((p, i) => { f[p.key] = (res[i]?.count || 0) > 0 })
      setFeitos(f)
    })
    return () => { vivo = false }
  }, [perfil?.grupo_id])

  const itens = PASSOS.map((p, i) => ({ ...p, ...t.passos[i], feito: feitos ? !!feitos[p.key] : false }))
  const totalFeitos = itens.filter(it => it.feito).length
  const proximo = itens.find(it => !it.feito)

  return (
    <div className="boas-vindas">
      <div className="boas-vindas-conteudo">
        <div style={{ display: 'flex', justifyContent: 'center' }}><IlustraCofre /></div>

        <div className="hf-in" style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontFamily: "'Syne', system-ui, sans-serif", fontWeight: 700, fontSize: 26, lineHeight: '30px' }}>{t.titulo}</h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: '22px', color: 'var(--text2)' }}>
            {totalFeitos === 3 ? t.tudoPronto : t.subtitulo}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)' }}>
            <span>{t.comeceAqui}</span><span>{t.contador(totalFeitos)}</span>
          </div>
          <Meter valor={(totalFeitos / 3) * 100} cor="var(--accent)" altura={8} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {itens.map(it => (
            <Item key={it.key} feito={it.feito} titulo={it.titulo} subtitulo={it.subtitulo} onClick={() => navigate(it.rota)} />
          ))}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button onClick={() => navigate(proximo ? proximo.rota : '/')} style={{ width: '100%' }}>
            {proximo ? proximo.cta : t.irInicio}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/configuracoes')} style={{ width: '100%' }}>
            <UserPlus size={18} /> {t.convidar}
          </Button>
          {proximo && (
            <button type="button" onClick={() => navigate('/')} style={{ fontSize: 14, color: 'var(--text3)', margin: '2px auto 0' }}>
              {t.irInicio}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
