// modelos.ts — lê o texto de um e-mail automático no banco (email_modelos, 0090) e monta o HTML.
// Usado por todas as funções que mandam e-mail sozinhas. Regras:
//   - linha não existe ou o banco falhou → devolve null e a função usa o texto que já está no código;
//   - desligado no Painel (e não é essencial) → { desligado: true } e a função não manda;
//   - remarketing / automação criada no Painel → remetente de campanha + "não quero receber".
import { layoutEmail } from './email.ts'
import { montarConteudo, ehCampanha } from './modelo.js'
import { linkDescadastro } from './descadastro.ts'

export type Modelo = {
  chave: string; nome: string; categoria: string; ligado: boolean; essencial: boolean; editavel: boolean
  personalizado: boolean; gatilho: string | null; dias: number | null; data_envio: string | null
  condicao: string | null; sequencia: string | null; ordem: number
  assunto: string | null; titulo: string | null; preheader: string | null; corpo: string | null
  botao_texto: string | null; botao_link: string | null
}
export type Montado = { desligado: true } | { desligado?: false; assunto: string; html: string; modelo: Modelo }
type CTA = { texto: string; url: string }

// deno-lint-ignore no-explicit-any
export async function lerModelo(admin: any, chave: string): Promise<Modelo | null> {
  try {
    const { data, error } = await admin.from('email_modelos').select('*').eq('chave', chave).maybeSingle()
    if (error) return null
    return (data as Modelo) || null
  } catch {
    return null
  }
}

// Monta a partir de um modelo já lido. usuarioId = quem recebe (pro link "não quero receber").
export async function montarModelo(m: Modelo, vars: Record<string, unknown>, opts: { cta?: CTA; usuarioId?: string | null; teste?: boolean } = {}) {
  const c = montarConteudo(m, vars)
  let rodapeExtra = ''
  if (ehCampanha(m) && opts.usuarioId) {
    const sair = await linkDescadastro(opts.usuarioId)
    rodapeExtra = `Não quer receber novidades do HopeFin por e-mail? <a href="${sair}" style="color:#64748b;">Clique aqui</a>.`
  }
  const tag = opts.teste ? '[Teste] ' : ''
  const html = layoutEmail({ titulo: c.titulo, corpoHtml: c.corpoHtml, preheader: c.preheader, cta: opts.cta || c.cta, rodapeExtra })
  return { assunto: tag + c.assunto, html }
}

// Atalho das funções antigas: lê + monta. null = use o texto do código.
// deno-lint-ignore no-explicit-any
export async function doModelo(admin: any, chave: string, vars: Record<string, unknown>, opts: { cta?: CTA; usuarioId?: string | null } = {}): Promise<Montado | null> {
  const m = await lerModelo(admin, chave)
  if (!m || !m.editavel || !m.assunto || !m.corpo) return null
  if (!m.ligado && !m.essencial) return { desligado: true }
  try {
    const r = await montarModelo(m, vars, opts)
    return { ...r, modelo: m }
  } catch (e) {
    console.error('[modelos] falhou ao montar', chave, (e as Error).message)
    return null
  }
}

// Remetente de campanha (email_config): "Lari, do HopeFin <novidades@hopefin.com.br>".
// deno-lint-ignore no-explicit-any
export async function remetenteCampanha(admin: any): Promise<{ de: string; responderPara: string }> {
  try {
    const { data } = await admin.from('email_config').select('remetente_campanha, responder_campanha').eq('id', 1).maybeSingle()
    if (data?.remetente_campanha) return { de: data.remetente_campanha, responderPara: data.responder_campanha || 'contato@hopefin.com.br' }
  } catch { /* usa o padrão */ }
  return { de: 'Lari, do HopeFin <novidades@hopefin.com.br>', responderPara: 'contato@hopefin.com.br' }
}
