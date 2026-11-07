-- 0030_primeira_cobranca.sql
-- Data da PRIMEIRA cobrança confirmada da assinatura: base dos 7 dias de arrependimento
-- (art. 49 do CDC) para o reembolso automático em Configurações → Minha assinatura.
-- Renovações NÃO reiniciam o prazo. Preenchida pelo asaas-webhook na 1ª confirmação.
-- Linhas que já estavam ativas: usa o início do período atual como melhor aproximação.

alter table public.subscriptions
  add column if not exists primeira_cobranca_em timestamptz;

update public.subscriptions
   set primeira_cobranca_em = coalesce(current_period_start, atualizado_em)
 where primeira_cobranca_em is null and status in ('active', 'past_due', 'canceled');
