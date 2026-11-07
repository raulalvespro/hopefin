// Módulo compartilhado de e-mail do HopeFin (prompt 7).
// Envio via Resend, com domínio verificado hopefin.com.br.
// Remetente: avisos@ ; respostas vão para contato@.
// Reutilizado pela função enviar-email e pelos crons (fim de trial, vencimentos,
// resumo mensal). NÃO mexe em MX/SPF/_dmarc — só usa o envio do Resend.
//
// VISUAL: segue a biblioteca de design (docs/design/). Base do cabeçalho:
// docs/design/telas/email-topo.html + docs/design/tokens/tokens.json.
//   - barra verde de 8px no topo (accent #10b981)
//   - logo: PNG hospedado (ícone "H" + wordmark "hopefin" em Syne) — ver LOGO_URL
//   - títulos em Syne, corpo em DM Sans (com fallback de sistema)
//   - links/realces em accent-text #047857 (passa 4,5:1 — tokens.json)
// Obs.: Gmail ignora fontes web (o TÍTULO cai no fallback sans) e remove <svg>
// inline — por isso o logo é <img> PNG (aparece igual em todo cliente). O título
// em Syne só aparece em clientes que carregam fonte web (ex.: Apple Mail).

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
export const REMETENTE = 'HopeFin <avisos@hopefin.com.br>'
export const REPLY_TO = 'contato@hopefin.com.br'

// Paleta inline a partir do tokens.json (tema claro — e-mail é sempre light).
const COR = {
  bg: '#f6f7f9', // bg
  card: '#ffffff', // bg2
  barra: '#10b981', // accent — barra do topo e botão
  borda: '#eef1f5', // bg3 — borda do card
  ink: '#0f172a', // text — títulos e "hope" do wordmark
  corpo: '#334155', // corpo do e-mail (passa contraste sobre branco)
  sub: '#475569', // subtítulo (igual à referência email-topo)
  leve: '#94a3b8', // text3 — rodapé
  fin: '#059669', // accent2 — "fin" do wordmark
  link: '#047857', // accent-text — links (passa 4,5:1 sobre branco)
  onAccent: '#06281e', // on-accent — texto do botão
}

// Famílias do tokens.json, com fallback de sistema para clientes sem fonte web.
const FONTE_TITULO = "'Syne','Segoe UI',system-ui,Arial,sans-serif"
const FONTE_CORPO = "'DM Sans',-apple-system,'Segoe UI',system-ui,Arial,sans-serif"

// Logo HopeFin (ícone "H" + wordmark "hopefin" em Syne) como PNG hospedado.
// É imagem (não SVG) porque o Gmail remove SVG inline e ignora fontes web —
// assim a marca aparece igual em todo cliente. Fonte: Supabase Storage (bucket
// público "publico"). PNG 408x120 (3x), exibido a 136x40. Fundo branco (casa com
// o cabeçalho). Para regerar: scratchpad storage_prep.mjs + canvas no navegador.
const LOGO_URL = 'https://oapcjmkklzaodgpuwjsh.supabase.co/storage/v1/object/public/publico/email/logo-hopefin.png'
const LOGO_IMG =
  `<img src="${LOGO_URL}" width="136" height="40" alt="HopeFin" style="display:block;border:0;outline:none;text-decoration:none;height:40px;width:136px;">`

type CTA = { texto: string; url: string }

// Escapa texto simples para uso em HTML (nunca injetar dado cru).
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

// Monta o e-mail completo (responsivo, light) a partir do conteúdo do corpo.
// corpoHtml é confiável (montado por nós); dados do usuário devem passar por esc().
export function layoutEmail(opts: {
  titulo: string
  corpoHtml: string
  preheader?: string
  cta?: CTA
  rodapeExtra?: string
}): string {
  const { titulo, corpoHtml, preheader = '', cta, rodapeExtra = '' } = opts
  const botao = cta ? `
    <tr><td style="padding:10px 0 2px;">
      <a href="${esc(cta.url)}" style="display:inline-block;background:${COR.barra};color:${COR.onAccent};text-decoration:none;font-family:${FONTE_TITULO};font-weight:700;font-size:15px;letter-spacing:.02em;padding:13px 26px;border-radius:8px;">${esc(cta.texto)}</a>
    </td></tr>` : ''
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(titulo)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Syne:wght@700&amp;family=DM+Sans:wght@400;500&amp;display=swap">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:wght@400;500&display=swap');
  body{margin:0;padding:0;background:${COR.bg};-webkit-font-smoothing:antialiased;}
  a{color:${COR.link};}
</style>
</head>
<body style="margin:0;padding:0;background:${COR.bg};font-family:${FONTE_CORPO};">
  <span style="display:none!important;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR.bg};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COR.card};border:1px solid ${COR.borda};border-radius:16px;overflow:hidden;">
        <!-- barra verde do topo -->
        <tr><td style="height:8px;line-height:8px;font-size:0;background:${COR.barra};">&nbsp;</td></tr>
        <!-- logo -->
        <tr><td style="padding:24px 28px 0;">
          ${LOGO_IMG}
        </td></tr>
        <!-- corpo -->
        <tr><td style="padding:18px 28px 26px;color:${COR.ink};">
          <h1 style="font-family:${FONTE_TITULO};font-size:26px;line-height:30px;font-weight:700;margin:4px 0 14px;color:${COR.ink};">${esc(titulo)}</h1>
          <div style="font-family:${FONTE_CORPO};font-size:15px;line-height:1.6;color:${COR.corpo};">${corpoHtml}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;">${botao}</table>
        </td></tr>
        <!-- rodapé -->
        <tr><td style="padding:16px 28px 24px;border-top:1px solid ${COR.borda};font-family:${FONTE_CORPO};font-size:12px;line-height:1.6;color:${COR.leve};">
          Você recebe este e-mail porque tem uma conta no HopeFin.<br>
          Dúvidas? É só responder — chega em <a href="mailto:${REPLY_TO}" style="color:${COR.link};text-decoration:none;font-weight:500;">${REPLY_TO}</a>.${rodapeExtra ? '<br>' + rodapeExtra : ''}
        </td></tr>
      </table>
      <div style="font-family:${FONTE_CORPO};font-size:11px;color:${COR.leve};margin-top:14px;">HopeFin · as finanças da sua família, no mesmo lugar</div>
    </td></tr>
  </table>
</body></html>`
}

// Envia um e-mail já montado (html) via Resend. Retorna { ok, id?, erro? }.
export async function enviarEmail(opts: {
  para: string | string[]
  assunto: string
  html: string
}): Promise<{ ok: boolean; id?: string; erro?: string }> {
  if (!RESEND_API_KEY) return { ok: false, erro: 'RESEND_API_KEY não configurada' }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: REMETENTE,
      to: Array.isArray(opts.para) ? opts.para : [opts.para],
      reply_to: REPLY_TO,
      subject: opts.assunto,
      html: opts.html,
    }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) return { ok: false, erro: data?.message || data?.name || `HTTP ${r.status}` }
  return { ok: true, id: data?.id }
}
