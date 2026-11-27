// asaas-validar-saque — "Mecanismo para validação de saque via webhooks" do Asaas (27/11/2026).
//
// PREPARADO E DESLIGADO: só passa a valer quando o Raul cadastrar a URL desta função no Asaas
// (Integrações › Mecanismos de segurança) com o token ASAAS_SAQUE_TOKEN e marcar "Ativar autorização de saque
// para estornos Pix". Passo a passo e cuidados: docs/REEMBOLSOS.md.
//
// O Asaas faz POST com o header `asaas-access-token` antes de cada saída de dinheiro. Respondemos
// { status: 'APPROVED' } só para estorno Pix de um reembolso aberto pelo app (regra em decidir.js); o resto é
// REFUSED. Qualquer erro nosso também vira REFUSED (o estorno é cancelado e o cron `reembolsos` pede de novo).
// Deploy SEM verificação de JWT (o Asaas não manda JWT):
//   npx supabase functions deploy asaas-validar-saque --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2'
import { decidir, resumoSeguro } from './decidir.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TOKEN = Deno.env.get('ASAAS_SAQUE_TOKEN') || ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405)
  // Sem token configurado = desligado: nada é aprovado.
  if (!TOKEN || req.headers.get('asaas-access-token') !== TOKEN) return json({ error: 'não autorizado' }, 401)

  const corpo = await req.json().catch(() => ({}))
  const resumo = resumoSeguro(corpo)
  const pagamento: string | null = corpo?.pixRefund?.payment || null

  let decisao: { status: string; refuseReason?: string; reembolsoId?: string }
  try {
    let pendentes: any[] = []
    let aprovados: string[] = []
    if (corpo?.type === 'PIX_REFUND' && pagamento) {
      const p = await admin.from('reembolsos_pendentes')
        .select('id, asaas_payment_id, valor_centavos, status').eq('asaas_payment_id', pagamento)
      if (p.error) throw p.error
      pendentes = p.data || []
      const l = await admin.from('webhook_log').select('payload')
        .eq('origem', 'asaas-saque').eq('payment_id', pagamento).eq('status', 'APPROVED')
      if (l.error) throw l.error
      aprovados = (l.data || []).map((x: any) => x?.payload?.id).filter(Boolean)
    }
    decisao = decidir(corpo, pendentes, aprovados)
  } catch (e) {
    decisao = { status: 'REFUSED', refuseReason: 'Falha ao conferir no HopeFin; tente de novo.' }
    console.error('asaas-validar-saque', String((e as Error)?.message || e))
  }

  try {
    await admin.from('webhook_log').insert({
      origem: 'asaas-saque', evento: corpo?.type || null, payment_id: pagamento,
      status: decisao.status, payload: resumo, erro: decisao.refuseReason || null,
    })
  } catch { /* log é best-effort; a decisão já está tomada */ }

  const { reembolsoId: _r, ...resposta } = decisao
  return json(resposta)
})
