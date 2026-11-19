-- 0071_areceber_parcelado.sql
-- A receber parcelado (A8.17, 19/11/2026): "Lançar a receber" ganha "Parcelado em N vezes"
-- (ex.: vendi algo em 3x pra alguém próximo, "na palavra"). O app cria uma linha de a_receber
-- por mês na mesma série (serie_id), cada uma entra na cobrança do seu mês e é recebida
-- parcela por parcela. Espelho do que a 0069 fez nas entradas.
--
--  • parcela_num / parcela_total: "2/3" na lista e na cobrança. Nulos nos valores comuns.
--  • recorrente = false nas parcelas: o garantir_series_grupo só estende série cuja última
--    linha é recorrente, então a série parcelada nunca "cresce" sozinha.
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

alter table public.a_receber add column if not exists parcela_num int;
alter table public.a_receber add column if not exists parcela_total int;

do $$ begin
  alter table public.a_receber add constraint a_receber_parcela_chk check (
    (parcela_num is null and parcela_total is null)
    or (parcela_total between 2 and 120 and parcela_num between 1 and parcela_total
        and serie_id is not null and recorrente = false));
exception when duplicate_object then null; end $$;
