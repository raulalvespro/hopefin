-- 0040_parcelamento_terceiro — compra PARCELADA que é de outra pessoa (vão te pagar).
--
-- Igual ao "gasto de terceiro" (0037), mas pra parcelamentos: a compra passou pelo seu cartão
-- e cada parcela é de outra pessoa. Cada parcela vira um "a receber" NO MÊS em que ela vence
-- (não tudo de uma vez), e você marca o que já recebeu parcela a parcela.
--
--  - parcelamentos.pessoa_id setado = parcelamento de terceiro (mesma tabela `pessoas` da 0037).
--  - parcelas.recebido = essa parcela já foi acertada com a pessoa (independe de `paga`, que é
--    sobre a fatura do cartão). 'A receber' = parcela de parcelamento com pessoa_id e recebido=false.
--  - Continua na fatura do cartão (você paga a fatura inteira), mas é NEUTRO nos seus resumos.
-- Aditiva e retrocompatível: colunas nulas/false => todo parcelamento atual segue normal.

alter table public.parcelamentos add column if not exists pessoa_id uuid references public.pessoas(id) on delete set null;
alter table public.parcelas add column if not exists recebido boolean not null default false;

create index if not exists parcelamentos_pessoa_idx on public.parcelamentos (grupo_id, pessoa_id) where pessoa_id is not null;
