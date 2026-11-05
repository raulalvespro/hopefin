-- ============================================================
-- 0018 — Checkout próprio + captura de lead (prompt 4 completo)
-- ------------------------------------------------------------
-- WhatsApp e consentimento de marketing no usuário (lead desde o trial);
-- método de pagamento e marca de início de checkout (carrinho abandonado)
-- na assinatura. CPF NÃO é guardado (fica no Asaas).
-- Idempotente. Não mexe em RLS: a policy usuarios_update já deixa o usuário
-- editar a própria linha (sem trocar grupo_id).
-- ============================================================

alter table public.usuarios add column if not exists telefone text;              -- WhatsApp (só dígitos)
alter table public.usuarios add column if not exists marketing_optin boolean not null default false;
alter table public.usuarios add column if not exists marketing_optin_em timestamptz;

alter table public.subscriptions add column if not exists metodo_pagamento text;  -- pix | boleto | cartao
alter table public.subscriptions add column if not exists checkout_iniciado_em timestamptz;
