-- 0073_assinatura_cancelada.sql
-- Assinatura cancelada não some das faturas antigas (A8.3, 19/11/2026).
-- Até aqui, "excluir" a assinatura (ativo = false) tirava ela de TODOS os meses — até de
-- fatura já paga. Agora o app pergunta:
--  • "Cancelei o serviço": ativo = false + cancelada_em = data → as cobranças até essa data
--    continuam nas faturas/meses delas; depois dela, não cobra mais;
--  • "Lancei errado": ativo = false e cancelada_em nulo → some de tudo (como sempre foi).
-- A conta fica no motor (supabase/functions/_shared/motor.js: assinaturaConta + cobrancaNoMes).
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

alter table public.assinaturas add column if not exists cancelada_em date;

comment on column public.assinaturas.cancelada_em is
  'A8.3: serviço cancelado nesta data — cobranças depois dela não contam; as de antes continuam. Nulo com ativo=false = removida de tudo (lançada por engano).';
