-- ============================================================
-- 0022 — Registro de aceite dos Termos/Privacidade — prompt 9
-- ------------------------------------------------------------
-- Guarda QUAL versão dos termos o usuário aceitou e QUANDO, no cadastro.
-- Fonte única da versão: src/lib/legal.js (VERSAO_LEGAL). Non-destructive.
-- DDL só via scripts/db.mjs. Idempotente.
-- ============================================================
alter table public.usuarios add column if not exists termos_versao     text;
alter table public.usuarios add column if not exists termos_aceito_em   timestamptz;
