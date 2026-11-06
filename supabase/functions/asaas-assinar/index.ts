// asaas-assinar — checkout transparente. Cria/reusa o cliente no Asaas e abre a
// assinatura do grupo pagando por Pix (QR na tela), boleto ou cartão (tokenizado).
// Chamada pelo nosso checkout (página /checkout).
//
// Corpo (JSON):
//   { ciclo: "mensal"|"anual",
//     metodo: "pix"|"boleto"|"cartao",
//     cpfCnpj: string, telefone?: string,
//     // só quando metodo === "cartao":
//     cartao: { holderName, number, expiryMonth, expiryYear, ccv },
//     titular: { cep, numero } }
//
// CPF e dados do cartão vão DIRETO pro Asaas; nada disso fica no nosso banco.
// Requer JWT de usuário. Segredos: ASAAS_API_KEY, ASAAS_BASE_URL (opcional).

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ASAAS_KEY = Deno.env.get('ASAAS_API_KEY') || ''
const ASAAS_BASE = Deno.env.get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function asaas(path: string, init: RequestInit = {}) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    ...init,
    headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.errors?.[0]?.description || `Asaas HTTP ${res.status}`)
  return data
}

const hoje = () => new Date().toISOString().slice(0, 10)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405)
  if (!ASAAS_KEY) return json({ error: 'ASAAS_API_KEY não configurada' }, 500)

  // 1) Autentica e descobre o grupo.
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: u } = await admin.auth.getUser(jwt)
  if (!u?.user) return json({ error: 'não autenticado' }, 401)

  const body = await req.json().catch(() => ({}))
  const ciclo = body.ciclo === 'anual' ? 'anual' : 'mensal'
  const metodo = ['pix', 'boleto', 'cartao'].includes(body.metodo) ? body.metodo : 'pix'
  const cpfCnpj = String(body.cpfCnpj || '').replace(/\D/g, '')
  const telefone = String(body.telefone || '').replace(/\D/g, '')
  if (cpfCnpj.length < 11) return json({ error: 'CPF/CNPJ inválido' }, 400)

  const { data: perfil } = await admin
    .from('usuarios').select('grupo_id, nome, email, telefone').eq('id', u.user.id).maybeSingle()
  if (!perfil?.grupo_id) return json({ error: 'usuário sem grupo' }, 400)
  const emailCobranca = String(body.email || perfil.email || '').trim()

  // 2) Preço conforme ciclo e método. Anual aplica o preço de LANÇAMENTO
  //    enquanto estiver vigente (até cfg.lancamento_ate). Sem "fundador".
  const { data: cfg } = await admin.from('planos_config').select('*').eq('id', 1).maybeSingle()
  if (!cfg) return json({ error: 'planos_config ausente' }, 500)
  const lanc = new Date() < new Date(cfg.lancamento_ate)
  const noLancamento = ciclo === 'anual' && lanc
  let centavos: number
  let parcelas = 0
  if (ciclo === 'mensal') {
    centavos = cfg.mensal_centavos
  } else if (metodo === 'cartao') {
    centavos = lanc ? cfg.lanc_anual_cartao_centavos : cfg.anual_cartao_centavos
    parcelas = 12 // 12x no cartão (ver nota no payload)
  } else {
    centavos = lanc ? cfg.lanc_anual_pix_centavos : cfg.anual_pix_centavos
  }

  // 3) Captura de lead / carrinho (antes de cobrar): telefone + marca de checkout.
  if (telefone && telefone !== perfil.telefone) {
    await admin.from('usuarios').update({ telefone }).eq('id', u.user.id)
  }
  await admin.from('subscriptions').update({
    checkout_iniciado_em: new Date().toISOString(), metodo_pagamento: metodo, ciclo,
  }).eq('grupo_id', perfil.grupo_id)

  const { data: sub } = await admin
    .from('subscriptions').select('*').eq('grupo_id', perfil.grupo_id).maybeSingle()

  try {
    // 4) Cliente no Asaas (reusa se já houver).
    let customerId = sub?.asaas_customer_id
    if (!customerId) {
      const cli = await asaas('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: body.nome || perfil.nome || 'Cliente HopeFin',
          email: emailCobranca, cpfCnpj, mobilePhone: telefone || undefined,
          // Não deixamos o Asaas mandar e-mail/SMS padrão (com o nome/CPF do
          // titular). Toda comunicação com o cliente é nossa, com a marca
          // HopeFin, via Resend (prompt 7).
          notificationDisabled: true,
        }),
      })
      customerId = cli.id
    }

    // 5) Assinatura: paga agora para ativar (checkout = pagar para ter acesso).
    const billingType = metodo === 'cartao' ? 'CREDIT_CARD' : metodo === 'boleto' ? 'BOLETO' : 'PIX'
    const payload: Record<string, unknown> = {
      customer: customerId,
      billingType,
      value: centavos / 100,
      cycle: ciclo === 'anual' ? 'YEARLY' : 'MONTHLY',
      nextDueDate: hoje(),
      description: `HopeFin Família (${ciclo})`,
      externalReference: perfil.grupo_id,
    }
    // Anual no cartão: parcelar em 12x. OBS: no Asaas o parcelamento
    // (installmentCount) é documentado para cobranças avulsas; em assinatura
    // YEARLY ainda precisa ser validado no sandbox. Se o Asaas recusar o campo,
    // o try/catch devolve o erro e a gente revisa (ver nota do prompt 2.1).
    if (parcelas > 1 && metodo === 'cartao') {
      payload.installmentCount = parcelas
    }
    if (metodo === 'cartao') {
      const c = body.cartao || {}
      const t = body.titular || {}
      payload.creditCard = {
        holderName: c.holderName, number: String(c.number || '').replace(/\s/g, ''),
        expiryMonth: c.expiryMonth, expiryYear: c.expiryYear, ccv: c.ccv,
      }
      payload.creditCardHolderInfo = {
        name: body.nome || perfil.nome, email: emailCobranca, cpfCnpj,
        postalCode: String(t.cep || '').replace(/\D/g, ''),
        addressNumber: String(t.numero || 'S/N'),
        phone: telefone || undefined,
      }
      payload.remoteIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || undefined
    }

    const assinatura = await asaas('/subscriptions', { method: 'POST', body: JSON.stringify(payload) })

    await admin.from('subscriptions').update({
      titular_id: u.user.id, ciclo, preco_centavos: centavos,
      asaas_customer_id: customerId, asaas_subscription_id: assinatura.id,
    }).eq('grupo_id', perfil.grupo_id)

    // 6) Busca a 1ª cobrança para devolver QR do Pix / linha do boleto / status do cartão.
    let primeira: Record<string, unknown> | null = null
    for (let i = 0; i < 2 && !primeira; i++) {
      const pg = await asaas(`/subscriptions/${assinatura.id}/payments?limit=1`)
      primeira = pg?.data?.[0] || null
    }
    const paymentId = primeira?.id as string | undefined

    if (metodo === 'pix' && paymentId) {
      const qr = await asaas(`/payments/${paymentId}/pixQrCode`)
      return json({
        ok: true, metodo, lancamento: noLancamento, subscriptionId: assinatura.id, paymentId,
        pix: { imagem: `data:image/png;base64,${qr.encodedImage}`, copiaECola: qr.payload, vencimento: qr.expirationDate },
      })
    }
    if (metodo === 'boleto' && paymentId) {
      let linha = ''
      try { linha = (await asaas(`/payments/${paymentId}/identificationField`))?.identificationField || '' } catch (_) { /* ok */ }
      return json({
        ok: true, metodo, lancamento: noLancamento, subscriptionId: assinatura.id, paymentId,
        boleto: { url: primeira?.bankSlipUrl || primeira?.invoiceUrl, linhaDigitavel: linha, vencimento: primeira?.dueDate },
      })
    }
    // cartão: cobrança imediata; status CONFIRMED/RECEIVED = aprovado (webhook também confirma)
    return json({
      ok: true, metodo, lancamento: noLancamento, subscriptionId: assinatura.id, paymentId,
      status: primeira?.status || 'PENDING',
    })
  } catch (err) {
    console.error('[asaas-assinar]', (err as Error)?.message)
    return json({ error: (err as Error)?.message || 'falha ao criar assinatura' }, 502)
  }
})
