// Primeiros passos guiados (A8.10, 21/11/2026). O 1º acesso ensina a USAR o app (decisão 19/11):
// um passo por coisa básica, cada um abrindo a tela certa já com o formulário aberto e uma faixa
// no topo dizendo o que fazer. "Feito" vem dos DADOS REAIS do grupo (não de clique), exceto
// Categorias (só olhar e ajustar — marca quando a pessoa toca "Pronto" na faixa).
// "Fazer depois" e o "Esconder" do Início ficam no aparelho (localStorage, por pessoa).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { copy } from '../copy/pt-BR'

const t = copy.primeirosPassos

// key · rota (com ?novo=1 abre o formulário) · como saber que está feito.
export const PASSOS = [
  { key: 'renda', rota: '/entradas?novo=1', base: '/entradas', conta: { tabela: 'entradas' } },
  { key: 'gasto', rota: '/gastos?novo=1', base: '/gastos', conta: { tabela: 'gastos' } },
  { key: 'cartao', rota: '/cartoes?novo=1', base: '/cartoes', conta: { tabela: 'cartoes', soAtivo: true } },
  { key: 'conta', rota: '/contas-fixas?novo=1', base: '/contas-fixas', conta: { tabela: 'contas_fixas', soAtivo: true } },
  { key: 'categorias', rota: '/categorias', base: '/categorias', manual: true },
  { key: 'convidar', rota: '/configuracoes', base: '/configuracoes', membros: true },
]

const chave = (uid, nome) => `hf_pp_${nome}_${uid || 'anon'}`
function ler(uid, nome, padrao) {
  try { const v = localStorage.getItem(chave(uid, nome)); return v ? JSON.parse(v) : padrao } catch { return padrao }
}
function gravar(uid, nome, valor) {
  try { localStorage.setItem(chave(uid, nome), JSON.stringify(valor)) } catch { /* sem storage: segue */ }
}

// Passo em andamento (a faixa do topo mostra a dica enquanto a pessoa está na tela dele).
const CHAVE_ATIVO = 'hf_pp_ativo'
export function iniciarPasso(key) { try { sessionStorage.setItem(CHAVE_ATIVO, key) } catch { /* ignore */ } }
export function passoAtivo() { try { return sessionStorage.getItem(CHAVE_ATIVO) } catch { return null } }
export function encerrarPasso() { try { sessionStorage.removeItem(CHAVE_ATIVO) } catch { /* ignore */ } }

export function marcarManual(uid, key) { gravar(uid, 'manuais', { ...ler(uid, 'manuais', {}), [key]: true }) }
export function esconderNoInicio(uid) { gravar(uid, 'escondido', true) }
export function escondidoNoInicio(uid) { return !!ler(uid, 'escondido', false) }

// Ordem dos itens: feitos e "fazer depois" não mudam a ordem; o próximo é o 1º pendente que não
// foi adiado (se todos os pendentes foram adiados, volta pro 1º adiado).
export function montarItens(feitos, adiados) {
  const itens = PASSOS.map((p, i) => ({ ...p, ...t.passos[p.key], numero: i + 1, feito: !!feitos?.[p.key], adiado: !feitos?.[p.key] && !!adiados?.[p.key] }))
  const pendentes = itens.filter(it => !it.feito)
  const proximo = pendentes.find(it => !it.adiado) || pendentes[0] || null
  return { itens, total: itens.length, feitos: itens.length - pendentes.length, proximo }
}

export function usePrimeirosPassos(perfil, user) {
  const uid = user?.id
  const gid = perfil?.grupo_id
  const [feitos, setFeitos] = useState(null)
  const [adiados, setAdiados] = useState(() => ler(uid, 'adiados', {}))

  const carregar = useCallback(async () => {
    if (!gid) return
    const manuais = ler(uid, 'manuais', {})
    const res = await Promise.all(PASSOS.map(p => {
      if (p.manual) return Promise.resolve({ ok: !!manuais[p.key] })
      if (p.membros) {
        return supabase.from('usuarios').select('id', { count: 'exact', head: true }).eq('grupo_id', gid)
          .then(({ count }) => ({ ok: (count || 0) > 1 }))
      }
      let q = supabase.from(p.conta.tabela).select('id', { count: 'exact', head: true }).eq('grupo_id', gid)
      if (p.conta.soAtivo) q = q.eq('ativo', true)
      return q.then(({ count }) => ({ ok: (count || 0) > 0 }))
    }))
    const f = {}
    PASSOS.forEach((p, i) => { f[p.key] = res[i].ok })
    setFeitos(f)
  }, [gid, uid])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setAdiados(ler(uid, 'adiados', {})) }, [uid])

  const adiar = useCallback((key) => {
    const novo = { ...ler(uid, 'adiados', {}), [key]: true }
    gravar(uid, 'adiados', novo); setAdiados(novo)
  }, [uid])

  return { carregando: feitos == null, ...montarItens(feitos, adiados), adiar, recarregar: carregar }
}
