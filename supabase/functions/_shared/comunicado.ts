// comunicado.ts — entrega de um comunicado já gravado (A8.15): card no app (entregas), notificação
// e e-mail com o "não quero receber". Usado pelo envio na hora (admin-comunicado) e pelo agendado
// (comunicados-agendados). Atualiza as contagens no próprio comunicado.
import { enviarEmail, layoutEmail, esc } from './email.ts'
import { pushParaGrupo } from './push.ts'
import { linkDescadastro } from './descadastro.ts'

const APP = 'https://app.hopefin.com.br'
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms))
const paraHtml = (s: string) => esc(s).replace(/\n/g, '<br>')

export type Dest = { usuario_id: string; grupo_id: string; nome: string | null; email: string | null; recebe_email: boolean }
export type Comunicado = {
  id: string; titulo: string; texto: string; botao_texto: string | null; botao_rota: string | null; canais: string[]; teste?: boolean
}

// deno-lint-ignore no-explicit-any
export async function entregarComunicado(admin: any, com: Comunicado, dest: Dest[]) {
  const canais = com.canais || []
  const tag = com.teste ? '[Teste] ' : ''
  const erros: string[] = []
  let push = 0
  let emails = 0

  const { error: errEnt } = await admin.from('comunicado_entregas').upsert(
    dest.map(d => ({ comunicado_id: com.id, usuario_id: d.usuario_id, no_app: canais.includes('app') })),
    { onConflict: 'comunicado_id,usuario_id', ignoreDuplicates: true })
  if (errEnt) erros.push(`entregas: ${errEnt.message}`)

  if (canais.includes('push')) {
    for (const d of dest) {
      try {
        const r = await pushParaGrupo(admin, d.grupo_id, { title: `${tag}${com.titulo}`, body: com.texto.slice(0, 140), url: com.botao_rota || '/', tag: `comunicado-${com.id}` }, d.usuario_id)
        push += r.enviados || 0
      } catch (e) { erros.push(`push: ${(e as Error).message}`) }
    }
  }

  if (canais.includes('email')) {
    for (const d of dest) {
      if (!d.email || !d.recebe_email) continue
      const primeiro = String(d.nome || '').trim().split(/\s+/)[0]
      const sair = await linkDescadastro(d.usuario_id)
      const html = layoutEmail({
        titulo: `${tag}${com.titulo}`,
        corpoHtml: `${primeiro ? `<p>Oi, ${esc(primeiro)}!</p>` : ''}<p>${paraHtml(com.texto)}</p>`,
        preheader: com.texto.slice(0, 100),
        cta: com.botao_texto ? { texto: com.botao_texto, url: `${APP}${com.botao_rota || '/'}` } : undefined,
        rodapeExtra: `Não quer receber novidades do HopeFin por e-mail? <a href="${esc(sair)}" style="color:#64748b;">Clique aqui</a>.`,
      })
      const r = await enviarEmail({ para: d.email, assunto: `${tag}${com.titulo}`, html })
      if (r.ok) emails++
      else erros.push(`e-mail: ${r.erro || 'erro'}`)
      await pausa(550) // limite de envio do Resend
    }
  }

  await admin.from('comunicados').update({ destinatarios: dest.length, enviados_push: push, enviados_email: emails, enviado_em: new Date().toISOString() }).eq('id', com.id)
  return { destinatarios: dest.length, push, emails, erros: erros.slice(0, 5) }
}
