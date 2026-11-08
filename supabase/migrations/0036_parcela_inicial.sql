-- 0036_parcela_inicial — permite cadastrar um parcelamento que JÁ começou (ex.: 4/10).
-- parcelas_pagas = quantas parcelas já foram quitadas antes de entrar no app. O trigger
-- gera todas as parcelas normalmente e marca as primeiras `parcelas_pagas` como pagas.
-- Retrocompatível: default 0 => comportamento idêntico ao anterior (nenhuma marcada).

alter table public.parcelamentos add column if not exists parcelas_pagas int not null default 0;

create or replace function public.gerar_parcelas()
returns trigger
language plpgsql
as $$
declare
  i int;
begin
  for i in 1..new.num_parcelas loop
    insert into public.parcelas (grupo_id, parcelamento_id, numero, valor, data_vencimento, paga)
    values (
      new.grupo_id,
      new.id,
      i,
      new.valor_parcela,
      (new.data_primeira_parcela + make_interval(months => i - 1))::date,
      i <= coalesce(new.parcelas_pagas, 0)
    );
  end loop;
  return new;
end;
$$;
