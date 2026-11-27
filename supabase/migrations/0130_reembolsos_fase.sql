-- 0130 — Fase do reembolso (27/11/2026). Achado no 1º estorno real: o Asaas ACEITA o pedido de estorno mas
-- segura em "AWAITING_CRITICAL_ACTION_AUTHORIZATION" até o dono autorizar (código do app/SMS do Asaas). O app
-- marcava "feito" cedo demais. Agora TODO pedido de reembolso vira uma linha aqui e só fecha quando o Asaas
-- confirma (estorno DONE / aviso PAYMENT_REFUNDED).
--   fase: pedindo | sem_saldo | aguardando_autorizacao | em_andamento | recusado | feito
alter table public.reembolsos_pendentes add column if not exists fase text not null default 'sem_saldo';
alter table public.reembolsos_pendentes add column if not exists asaas_refund_status text;
alter table public.reembolsos_pendentes alter column motivo drop not null;
