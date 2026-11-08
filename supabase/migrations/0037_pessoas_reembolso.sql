-- 0037_pessoas_reembolso — "compra de terceiro": um gasto que passou pelo seu cartão/bolso
-- mas é de outra pessoa (ex.: o pai usou seu cartão) e vai ser acertado depois. A pessoa
-- NÃO entra no grupo — é só um cadastro leve pra você identificar e cobrar.
--
-- Regras de produto:
--  - pessoa_id setado = gasto de terceiro. reembolso_status: 'pendente' (a receber) | 'quitado'.
--  - O gasto CONTINUA na fatura do cartão (você paga a fatura inteira) e na projeção.
--  - Mas é NEUTRO nos seus resumos pessoais (o front filtra pessoa_id is null nesses agregados).
--  - Receber é neutro: ao quitar, não vira receita — só fecha o "a receber".
-- Aditiva e retrocompatível: colunas nulas => todo gasto atual segue sendo gasto normal.

-- Cadastro leve de pessoas de fora do grupo (reaproveitável entre lançamentos).
create table if not exists public.pessoas (
  id        uuid primary key default gen_random_uuid(),
  grupo_id  uuid not null references public.grupos(id) on delete cascade,
  nome      text not null,
  criado_em timestamptz not null default now()
);

alter table public.pessoas enable row level security;
drop policy if exists pessoas_all on public.pessoas;
create policy pessoas_all on public.pessoas
  for all using (grupo_id = meu_grupo_id()) with check (grupo_id = meu_grupo_id());

create index if not exists pessoas_grupo_idx on public.pessoas (grupo_id, nome);

-- Marcação de reembolso no gasto.
alter table public.gastos add column if not exists pessoa_id uuid references public.pessoas(id) on delete set null;
alter table public.gastos add column if not exists reembolso_status text
  check (reembolso_status in ('pendente', 'quitado'));
alter table public.gastos add column if not exists reembolso_quitado_em date;

create index if not exists gastos_pessoa_idx on public.gastos (grupo_id, pessoa_id) where pessoa_id is not null;
