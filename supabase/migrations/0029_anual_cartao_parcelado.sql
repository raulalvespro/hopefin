-- 0029_anual_cartao_parcelado.sql
-- Anual no cartão passa a ser COBRANÇA PARCELADA de verdade (1 a 12x, mesmo total), e não
-- mais uma assinatura YEARLY — no Asaas o installmentCount é ignorado em assinatura (cobrava
-- o valor cheio de uma vez; validado no sandbox em 07/11/2026). A renovação anual é feita por
-- nós, recobrando o cartão pelo token (função renovar-cartao + cron diário).
--
--   subscriptions.parcelas            -> em quantas vezes a pessoa escolheu pagar (1..12)
--   subscriptions.asaas_installment_id-> id do parcelamento no Asaas (quando parcelas > 1)
--   subscriptions.asaas_periodo_ref   -> cobrança/parcelamento que JÁ estendeu o período
--                                        (o webhook chega uma vez por parcela; só a 1ª estende)
--   subscription_secrets              -> token do cartão no Asaas (NUNCA o número do cartão).
--                                        Tabela à parte, RLS ligada SEM policy: só a service_role
--                                        (Edge Functions) lê — o app nunca vê o token.

alter table public.subscriptions
  add column if not exists parcelas             integer not null default 1 check (parcelas between 1 and 12),
  add column if not exists asaas_installment_id text,
  add column if not exists asaas_periodo_ref    text;

create index if not exists subscriptions_installment_idx on public.subscriptions (asaas_installment_id);

create table if not exists public.subscription_secrets (
  grupo_id       uuid primary key references public.grupos(id) on delete cascade,
  asaas_card_token text,
  atualizado_em  timestamptz not null default now()
);
alter table public.subscription_secrets enable row level security;
-- (sem policy proposital: acesso só pela service_role das Edge Functions)
