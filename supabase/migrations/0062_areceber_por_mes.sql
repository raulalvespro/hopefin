-- 0062_areceber_por_mes.sql
-- A Receber por mês e origem de cada item (A1.13 / A1.15, 18/11/2026).
--
--  1) "Já paguei" no cadastro de parcelado de OUTRA pessoa = a pessoa já te pagou
--     (decisão do Raul, 18/11): as primeiras `parcelas_pagas` nascem pagas E recebidas,
--     então não aparecem no A Receber nem na cobrança. As parcelas que ficam pagas
--     depois (porque a fatura do cartão foi paga) continuam "a receber".
--  2) a_receber.conta_fixa_id — "referente à conta fixa" (opcional), só para mostrar a
--     origem no A Receber ("Conta fixa: Aluguel"). Não divide a conta em si (o "dividir
--     conta", A1.11, foi cancelado em 16/11).
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

create or replace function public.gerar_parcelas()
returns trigger
language plpgsql
as $$
declare
  i int;
begin
  for i in 1..new.num_parcelas loop
    insert into public.parcelas (grupo_id, parcelamento_id, numero, valor, data_vencimento, paga, recebido)
    values (
      new.grupo_id,
      new.id,
      i,
      new.valor_parcela,
      (new.data_primeira_parcela + make_interval(months => i - 1))::date,
      i <= coalesce(new.parcelas_pagas, 0),
      new.pessoa_id is not null and i <= coalesce(new.parcelas_pagas, 0)
    );
  end loop;
  return new;
end;
$$;

alter table public.a_receber
  add column if not exists conta_fixa_id uuid references public.contas_fixas(id) on delete set null;
