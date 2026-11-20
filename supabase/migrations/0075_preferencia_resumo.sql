-- ============================================================
-- HopeFin — Migração 0075: preferência "Resumo do mês" (A8.14, 19/11/2026 noite)
--
-- No dia 1º, junto com o e-mail do resumo, vai um push "Seu resumo de <mês> chegou" e o
-- Início mostra um cartão até o dia 7. Quem não quiser desliga em Notificações.
-- Ausência de linha = ligado (mesma regra das outras preferências). Idempotente.
-- ============================================================

alter table public.preferencias_notificacao
  add column if not exists alertar_resumo boolean not null default true;

comment on column public.preferencias_notificacao.alertar_resumo is
  'A8.14: aviso do resumo do mês (push do dia 1º + cartão no Início). Default ligado.';
