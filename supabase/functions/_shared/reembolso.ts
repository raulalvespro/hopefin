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

type Ref = { asaas_installment_id?: string | null; asaas_payment_id?: string | null }

// Pede o estorno no Asaas (parcelamento inteiro no anual 12x; senão a cobrança). Lança erro com a mensagem do Asaas.
// ATENÇÃO (27/11): "pedido aceito" NÃO é "dinheiro devolvido" — o Asaas pode segurar esperando o dono autorizar.
// Depois de pedir, use consultarEstorno() pra saber a fase de verdade.
export async function estornar(asaas: Asaas, r: Ref) {
  if (r.asaas_installment_id) return asaas(`/installments/${r.asaas_installment_id}/refund`, { method: 'POST', body: '{}' })
  if (r.asaas_payment_id) return asaas(`/payments/${r.asaas_payment_id}/refund`, { method: 'POST', body: '{}' })
  throw new Error('sem cobrança para estornar')
}

export type Fase = 'feito' | 'aguardando_autorizacao' | 'em_andamento' | 'recusado' | 'nao_pedido'

// Status do estorno no Asaas → fase do app.
function faseDoRefund(st: string | undefined): Fase {
  if (!st) return 'nao_pedido'
  if (st === 'DONE') return 'feito'
  if (st === 'AWAITING_CRITICAL_ACTION_AUTHORIZATION') return 'aguardando_autorizacao'
  if (st === 'CANCELLED') return 'recusado'
  return 'em_andamento' // PENDING, AWAITING_CUSTOMER_EXTERNAL_AUTHORIZATION…
}

// Em que pé está o estorno no Asaas (sem mudar nada lá). { fase, status } — status = texto do Asaas.
export async function consultarEstorno(asaas: Asaas, r: Ref): Promise<{ fase: Fase; status: string | null }> {
  let pagId = r.asaas_payment_id || null
  if (r.asaas_installment_id) {
    const lista = await asaas(`/installments/${r.asaas_installment_id}/payments?limit=100`)
    const pags = (lista?.data || []).filter((p: any) => !p.deleted)
    if (pags.length && pags.every((p: any) => p.status === 'REFUNDED')) return { fase: 'feito', status: 'REFUNDED' }
    pagId = (pags.find((p: any) => ['REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'RECEIVED', 'CONFIRMED'].includes(p.status)) || pags[0])?.id || null
  }
  if (!pagId) return { fase: 'nao_pedido', status: null }
  const pag = await asaas(`/payments/${pagId}`)
  if (pag?.status === 'REFUNDED') return { fase: 'feito', status: 'REFUNDED' }
  const refunds = (await asaas(`/payments/${pagId}/refunds`))?.data || []
  const ultimo = refunds.sort((a: any, b: any) => String(b.dateCreated).localeCompare(String(a.dateCreated)))[0]
  return { fase: faseDoRefund(ultimo?.status), status: ultimo?.status || pag?.status || null }
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
  const titulo = tipo === 'vencido' ? '⚠️ Reembolso ATRASADO'
    : r.fase === 'aguardando_autorizacao' ? 'Autorize o reembolso no Asaas'
    : tipo === 'novo' ? 'Reembolso para fazer' : 'Reembolso ainda pendente'
  const oQueFazer = r.fase === 'aguardando_autorizacao'
    ? '<strong>Falta VOCÊ AUTORIZAR no Asaas.</strong> O estorno já foi pedido, mas o Asaas segura até o dono confirmar: abra o app ou o site do Asaas, procure a notificação / "Ações pendentes de autorização" e confirme com o código. O dinheiro só sai depois disso.'
    : r.fase === 'em_andamento'
    ? 'O estorno já foi pedido e autorizado; o Asaas está processando. Não precisa fazer nada — o app avisa o cliente quando o dinheiro sair.'
    : r.fase === 'recusado'
    ? '<strong>O estorno foi cancelado no Asaas</strong> (autorização negada ou expirada). Use <strong>Tentar agora</strong> no painel pra pedir de novo e autorize.'
    : '<strong>Falta saldo no Asaas.</strong> Mande um Pix seu para a chave da conta Asaas — o app pede o estorno de novo sozinho a cada hora (ou use <strong>Tentar agora</strong> no painel). Depois, autorize no Asaas.'
  const corpo = `<p>${tipo === 'vencido'
      ? '<strong>O prazo prometido ao cliente já passou.</strong> Resolva hoje.'
      : tipo === 'novo'
      ? 'Um cliente pediu o reembolso nos 7 dias (art. 49 do CDC). A assinatura <strong>já foi cancelada</strong> (nenhuma cobrança nova). Falta o dinheiro sair.'
      : 'Este reembolso ainda não foi concluído.'}</p>
    <p>${oQueFazer}</p>
    <ul>
      <li><strong>Cliente:</strong> ${esc(r.nome || '—')} (${esc(r.email || 'sem e-mail')})</li>
      <li><strong>Valor:</strong> ${reais(r.valor_centavos)} (${esc(r.metodo || '—')})</li>
      <li><strong>Pedido em:</strong> ${dataBR(r.pedido_em)}</li>
      <li><strong>Prazo prometido:</strong> ${dataBR(r.prazo_em)} (2 dias úteis)</li>
      <li><strong>Motivo do Asaas:</strong> ${esc(r.ultimo_erro || r.motivo || '—')}</li>
    </ul>
    <p>Acompanhe em <strong>Painel › Financeiro › Reembolsos</strong>. O app confere no Asaas de hora em hora e só marca
    como devolvido quando o Asaas confirmar que o dinheiro saiu (aí o cliente recebe o e-mail).</p>`
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
    .update({ status, fase: 'feito', feito_em: agora, feito_por: por }).eq('id', r.id).eq('status', 'pendente').select('*').maybeSingle()
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

// Um passo no reembolso: confere no Asaas; se ainda não foi pedido (ou foi recusado), pede; se já saiu, conclui.
// Usado pelo cron e pelo botão "Tentar agora". Devolve a fase em que ficou.
// deno-lint-ignore no-explicit-any
export async function avancar(sb: any, asaas: Asaas, r: any, por: string): Promise<{ id: string; fase: string; feito: boolean; erro?: string }> {
  const agora = new Date().toISOString()
  let tentativas = r.tentativas || 0
  let st: { fase: Fase | 'sem_saldo'; status: string | null }
  try {
    st = await consultarEstorno(asaas, r)
    if (st.fase === 'nao_pedido' || st.fase === 'recusado') {
      tentativas += 1
      try {
        await estornar(asaas, r)
        st = await consultarEstorno(asaas, r)
      } catch (e) {
        const erro = (e as Error)?.message || 'erro'
        const fase = ehFaltaDeSaldo(erro) ? 'sem_saldo' : r.fase
        await sb.from('reembolsos_pendentes').update({ fase, tentativas, ultima_tentativa_em: agora, ultimo_erro: erro }).eq('id', r.id)
        return { id: r.id, fase, feito: false, erro }
      }
    }
  } catch (e) {
    const erro = (e as Error)?.message || 'erro'
    await sb.from('reembolsos_pendentes').update({ ultima_tentativa_em: agora, ultimo_erro: `consulta ao Asaas: ${erro}` }).eq('id', r.id)
    return { id: r.id, fase: r.fase, feito: false, erro }
  }
  await sb.from('reembolsos_pendentes').update({
    fase: st.fase, asaas_refund_status: st.status, tentativas, ultima_tentativa_em: agora, ultimo_erro: null,
  }).eq('id', r.id)
  if (st.fase === 'feito') { await concluir(sb, { ...r, fase: 'feito' }, por); return { id: r.id, fase: 'feito', feito: true } }
  return { id: r.id, fase: st.fase, feito: false }
}
