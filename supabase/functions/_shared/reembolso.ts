// Reembolso de arrependimento (art. 49 do CDC) quando o Asaas recusa o estorno — peças usadas pelo
// asaas-cancelar (cria o pendente), pela função reembolsos (tenta de novo / painel) e pelo asaas-webhook
// (PAYMENT_REFUNDED fecha o pendente se o dono estornou direto no Asaas). Tabela: reembolsos_pendentes (0129).
//
// Regras (27/11/2026, combinado com o Raul):
//  - Só vira pendente quando o Asaas recusa por FALTA DE SALDO. Outro erro: nada muda e a tela mostra erro.
//  - Pendente = assinatura cancelada NA HORA (nenhuma cobrança nova, acesso encerrado) + prazo prometido ao
//    cliente de 2 DIAS ÚTEIS (seg–sex; feriado não é descontado — conte com folga).
//  - O dono é avisado na hora e de novo a cada ~20 h enquanto estiver pendente (urgente se o prazo vencer).
//  - Ao estornar: e-mail "seu reembolso foi feito" pro cliente (uma vez só).
import { layoutEmail, enviarEmail, esc } from './email.ts'

export const PRAZO_DIAS_UTEIS = 2

// O Asaas respondeu que não há saldo pra devolver.
export const ehFaltaDeSaldo = (msg: string) => /saldo/i.test(msg || '')

// Fim do N-ésimo dia útil a partir de `base`, no horário de Brasília (23:59). Sáb/dom não contam.
export function prazoEmDiasUteis(base = new Date(), n = PRAZO_DIAS_UTEIS): Date {
  const brt = new Date(base.getTime() - 3 * 3600 * 1000) // relógio de Brasília (UTC-3, sem horário de verão)
  let y = brt.getUTCFullYear(), m = brt.getUTCMonth(), d = brt.getUTCDate()
  let faltam = n
  while (faltam > 0) {
    d += 1
    const dia = new Date(Date.UTC(y, m, d)).getUTCDay()
    if (dia !== 0 && dia !== 6) faltam -= 1
  }
  return new Date(Date.UTC(y, m, d, 23 + 3, 59, 0)) // 23:59 BRT = 02:59 UTC do dia seguinte
}

export const dataBR = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
export const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Asaas = (path: string, init?: RequestInit) => Promise<any>

// Pede o estorno no Asaas (parcelamento inteiro no anual 12x; senão a cobrança). Lança erro com a mensagem do Asaas.
export async function estornar(asaas: Asaas, r: { asaas_installment_id?: string | null; asaas_payment_id?: string | null }) {
  if (r.asaas_installment_id) return asaas(`/installments/${r.asaas_installment_id}/refund`, { method: 'POST', body: '{}' })
  if (r.asaas_payment_id) return asaas(`/payments/${r.asaas_payment_id}/refund`, { method: 'POST', body: '{}' })
  throw new Error('sem cobrança para estornar')
}

// E-mails de todos os admins (o dono).
// deno-lint-ignore no-explicit-any
export async function emailsDosAdmins(sb: any): Promise<string[]> {
  const { data: admins } = await sb.from('usuarios').select('id').eq('is_admin', true)
  const out: string[] = []
  for (const a of admins || []) {
    const { data: u } = await sb.auth.admin.getUserById(a.id)
    if (u?.user?.email) out.push(u.user.email)
  }
  return out
}

// Aviso ao dono: 'novo' (acabou de entrar), 'lembrete' (segue pendente) ou 'vencido' (passou do prazo).
// deno-lint-ignore no-explicit-any
export async function avisarDono(sb: any, r: any, tipo: 'novo' | 'lembrete' | 'vencido') {
  const emails = await emailsDosAdmins(sb)
  if (!emails.length) return false
  const titulo = tipo === 'vencido' ? '⚠️ Reembolso ATRASADO' : tipo === 'novo' ? 'Reembolso para fazer' : 'Reembolso ainda pendente'
  const corpo = `<p>${tipo === 'vencido'
      ? '<strong>O prazo prometido ao cliente já passou.</strong> Resolva hoje.'
      : tipo === 'novo'
      ? 'Um cliente pediu o reembolso nos 7 dias (art. 49 do CDC) e o Asaas recusou o estorno por falta de saldo. A assinatura <strong>já foi cancelada</strong> (nenhuma cobrança nova). Falta devolver o dinheiro.'
      : 'Este reembolso ainda não foi feito.'}</p>
    <ul>
      <li><strong>Cliente:</strong> ${esc(r.nome || '—')} (${esc(r.email || 'sem e-mail')})</li>
      <li><strong>Valor:</strong> ${reais(r.valor_centavos)} (${esc(r.metodo || '—')})</li>
      <li><strong>Pedido em:</strong> ${dataBR(r.pedido_em)}</li>
      <li><strong>Prazo prometido:</strong> ${dataBR(r.prazo_em)} (2 dias úteis)</li>
      <li><strong>Motivo do Asaas:</strong> ${esc(r.ultimo_erro || r.motivo || '—')}</li>
    </ul>
    <p><strong>Como resolver:</strong> coloque saldo na conta do Asaas (um Pix seu para a chave da conta) — o app tenta
    de novo sozinho a cada hora. Ou, no painel do HopeFin, em <strong>Financeiro › Reembolsos</strong>, use
    <strong>Tentar agora</strong>. Se você estornar direto no painel do Asaas, o app percebe pelo aviso do Asaas e fecha
    sozinho.</p>`
  const html = layoutEmail({ titulo, corpoHtml: corpo, preheader: `${reais(r.valor_centavos)} — prazo ${dataBR(r.prazo_em)}` })
  for (const para of emails) await enviarEmail({ para, assunto: `HopeFin · ${titulo} · ${reais(r.valor_centavos)}`, html, etiqueta: 'reembolso-dono' })
  await sb.from('reembolsos_pendentes').update({ ultimo_alerta_dono_em: new Date().toISOString() }).eq('id', r.id)
  return true
}

// Marca como feito e avisa o cliente (uma vez). `por`: automatico | painel | asaas | manual.
// deno-lint-ignore no-explicit-any
export async function concluir(sb: any, r: any, por: string, status: 'feito' | 'feito_manual' = 'feito') {
  const agora = new Date().toISOString()
  const { data: upd } = await sb.from('reembolsos_pendentes')
    .update({ status, feito_em: agora, feito_por: por }).eq('id', r.id).eq('status', 'pendente').select('*').maybeSingle()
  // Só quem virou o status manda o e-mail (a função e o aviso do Asaas podem chegar juntos).
  if (!upd) return
  const row = upd
  if (row.aviso_cliente_em || !row.email) return
  const ola = row.nome ? `Olá, ${esc(String(row.nome).split(' ')[0])}!<br><br>` : ''
  const ondeVolta = row.metodo === 'cartao'
    ? 'O valor volta para o mesmo cartão — pode levar até duas faturas para aparecer, conforme o banco do cartão.'
    : 'O valor volta para a mesma conta de onde saiu o pagamento.'
  const html = layoutEmail({
    titulo: 'Reembolso feito',
    preheader: `Devolvemos ${reais(row.valor_centavos)}.`,
    corpoHtml: `${ola}Fizemos o reembolso integral de <strong>${reais(row.valor_centavos)}</strong> referente à sua assinatura do HopeFin.<br><br>${ondeVolta}<br><br>Qualquer dúvida, é só responder este e-mail ou escrever para contato@hopefin.com.br.`,
  })
  const env = await enviarEmail({ para: row.email, assunto: 'Seu reembolso do HopeFin foi feito', html, etiqueta: 'reembolso-feito' })
  if (env.ok) await sb.from('reembolsos_pendentes').update({ aviso_cliente_em: new Date().toISOString() }).eq('id', row.id)
}
