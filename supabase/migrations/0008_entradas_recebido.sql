-- 8: entradas previstas podem ser confirmadas como recebidas (espelho do "conta paga").
alter table public.entradas add column if not exists recebido boolean not null default false;
alter table public.entradas add column if not exists data_recebimento date;
-- Backfill: o que já tem data no passado/hoje conta como recebido.
update public.entradas set recebido = true where recebido = false and data <= current_date;
