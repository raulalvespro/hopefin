-- 0069_entradas_parceladas.sql
-- Entradas parceladas (A3.4, 19/11/2026): além de "uma vez" e "todo mês", uma entrada pode ser
-- PARCELADA (ex.: venda em 3x). O app cria uma entrada por mês na mesma série (serie_id), cada
-- uma "a receber" até marcar recebida — parcela por parcela.
--
--  • parcela_num / parcela_total: "2/3" na lista. Nulos nas entradas comuns.
--  • origem 'parcelada' (o CHECK da 0061 só aceitava manual/recorrente/reembolso/saldo_anterior).
--  • recorrente = false nas parcelas: o garantir_series_grupo (0061) só estende séries cuja última
--    entrada é recorrente, então a série parcelada nunca "cresce" sozinha.
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

alter table public.entradas add column if not exists parcela_num int;
alter table public.entradas add column if not exists parcela_total int;

alter table public.entradas drop constraint if exists entradas_origem_chk;
alter table public.entradas add constraint entradas_origem_chk
  check (origem in ('manual', 'recorrente', 'reembolso', 'saldo_anterior', 'parcelada'));

do $$ begin
  alter table public.entradas add constraint entradas_parcela_chk check (
    (parcela_num is null and parcela_total is null)
    or (parcela_total between 2 and 120 and parcela_num between 1 and parcela_total));
exception when duplicate_object then null; end $$;
