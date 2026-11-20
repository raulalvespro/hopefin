// Chamados de suporte pelo app (Ajuda › "Abrir um chamado", migração 0081).
// Tudo passa pelas RPCs (a pessoa não lê a tabela direto): abrir, listar os meus, contar as
// respostas novas (bolinha da Ajuda) e marcar como vistas. O dono responde no painel.
import { supabase } from './supabase'
import { copy } from '../copy/pt-BR'

const tc = copy.ajuda.chamado
export const MENSAGEM_MIN = 10
export const MENSAGEM_MAX = 4000
export const ASSUNTO_MAX = 120

// Código curto e estável do chamado (o mesmo do painel e do e-mail): HF- + 6 primeiros do id.
export function codChamado(id) {
  return 'HF-' + String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase()
}

// Erro do banco -> frase pra pessoa (as do banco vêm como 'mensagem_curta', 'muitos_chamados'…).
export function mensagemErroChamado(error) {
  const m = String(error?.message || error || '')
  for (const k of Object.keys(tc.erros)) if (k !== 'generico' && m.includes(k)) return tc.erros[k]
  return tc.erros.generico
}

// Tela de onde a pessoa abriu (só o caminho, sem nada da URL depois do "?").
export function telaAtual(pathname) {
  const p = String(pathname || '/').split('?')[0].replace(/\/+$/, '') || '/'
  return /^\/[a-z0-9/-]*$/.test(p) ? p.slice(0, 60) : null
}

export async function abrirChamado({ categoria, assunto, mensagem, tela }) {
  const { data, error } = await supabase.rpc('suporte_abrir_chamado', {
    p_categoria: categoria || 'outro',
    p_assunto: String(assunto || '').trim().slice(0, ASSUNTO_MAX),
    p_mensagem: String(mensagem || '').trim(),
    p_tela: tela || null,
  })
  if (error) return { erro: mensagemErroChamado(error) }
  return { ok: true, id: data?.id, prazo: data?.prazo_em }
}

export async function meusChamados() {
  const { data, error } = await supabase.rpc('suporte_meus_chamados')
  if (error) return { erro: tc.erroLista }
  return { lista: Array.isArray(data) ? data : [] }
}

export async function respostasNovas() {
  const { data, error } = await supabase.rpc('suporte_respostas_novas')
  return error ? 0 : Number(data) || 0
}

export async function marcarRespostasVistas() {
  await supabase.rpc('suporte_marcar_respostas_vistas')
}

// Datas no horário de Brasília: "24/11" e "20/11 às 09:45".
const fmtDia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
export function diaCurto(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : fmtDia.format(d)
}
export function diaEHora(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${fmtDia.format(d)} às ${fmtHora.format(d)}`
}

// Rótulo da categoria (Dúvida, Algo não funciona…).
export function rotuloCategoriaChamado(id) {
  return tc.categorias.find((c) => c.id === id)?.rotulo || tc.categorias.find((c) => c.id === 'outro').rotulo
}
