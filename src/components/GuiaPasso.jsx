import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { X, CheckCircle2, Lightbulb } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { copy } from '../copy/pt-BR'
import { usePrimeirosPassos, passoAtivo, iniciarPasso, encerrarPasso, marcarManual } from '../lib/primeirosPassos'

const t = copy.primeirosPassos

// Faixa no topo da tela de um passo guiado (A8.10): diz o que fazer ali e, quando o passo fica feito
// (o dado aparece no banco), troca por "Feito! Bora pro próximo?". Só aparece na tela do passo que a
// pessoa abriu pela lista dos Primeiros passos (ou pelo card do Início).
export default function GuiaPasso() {
  const { perfil, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [ativo, setAtivo] = useState(() => passoAtivo())
  const pp = usePrimeirosPassos(perfil, user)

  useEffect(() => { setAtivo(passoAtivo()) }, [location.pathname])
  const it = pp.itens.find(i => i.key === ativo)
  const naTela = !!it && location.pathname === it.base

  // Enquanto a faixa está na tela, confere de tempos em tempos se o passo já foi feito.
  const { recarregar } = pp
  useEffect(() => {
    if (!naTela || it.feito || it.manual) return
    const id = setInterval(recarregar, 4000)
    return () => clearInterval(id)
  }, [naTela, it?.feito, it?.manual, recarregar]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!naTela) return null

  const fechar = () => { encerrarPasso(); setAtivo(null) }
  const verPassos = () => { encerrarPasso(); setAtivo(null); navigate('/boas-vindas') }
  const proximo = () => {
    const p = pp.proximo
    if (!p) return verPassos()
    iniciarPasso(p.key); setAtivo(p.key); navigate(p.rota)
  }
  const pronto = () => { marcarManual(user?.id, it.key); pp.recarregar(); verPassos() }

  return (
    <div role="status" style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-dim)', border: '1px solid var(--accent)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {it.feito
        ? <CheckCircle2 size={18} color="var(--accent-text)" style={{ flexShrink: 0, marginTop: 1 }} />
        : <Lightbulb size={18} color="var(--accent-text)" style={{ flexShrink: 0, marginTop: 1 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t.faixaPasso(it.numero, pp.total)} · {it.titulo}
        </p>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 4 }}>{it.feito ? t.faixaFeito : it.dica}</p>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
          {it.feito
            ? <button type="button" onClick={proximo} style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-text)', minHeight: 32 }}>{pp.proximo ? t.faixaProximo : t.irInicio} →</button>
            : it.manual && <button type="button" onClick={pronto} style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-text)', minHeight: 32 }}>{t.faixaPronto}</button>}
          <button type="button" onClick={verPassos} style={{ fontSize: 13, color: 'var(--text2)', minHeight: 32 }}>{t.faixaVoltar}</button>
        </div>
      </div>
      <button type="button" onClick={fechar} aria-label={copy.minhaConta.fechar} style={{ flexShrink: 0, minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={16} color="var(--text2)" />
      </button>
    </div>
  )
}
