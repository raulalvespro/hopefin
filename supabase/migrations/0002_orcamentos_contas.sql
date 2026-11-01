-- 0002: Orçamento por categoria + Contas (saldos / patrimônio)

-- ===== ORÇAMENTOS (teto mensal por categoria de gasto) =====
create table if not exists public.orcamentos (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references public.grupos(id) on delete cascade,
  categoria  text not null,
  valor      numeric(12,2) not null,
  criado_em  timestamptz not null default now(),
  unique (grupo_id, categoria)
);

-- ===== CONTAS (banco / carteira) para saldos e patrimônio =====
create table if not exists public.contas (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references public.grupos(id) on delete cascade,
  nome       text not null,
  tipo       text not null default 'corrente', -- corrente | poupanca | carteira | investimento
  saldo      numeric(12,2) not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create index if not exists idx_orcamentos_grupo on public.orcamentos(grupo_id);
create index if not exists idx_contas_grupo on public.contas(grupo_id);

-- RLS por grupo (mesmo padrão do schema base)
alter table public.orcamentos enable row level security;
alter table public.contas     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['orcamentos','contas'] loop
    execute format('drop policy if exists %I_todas on public.%I;', t, t);
    execute format(
      'create policy %I_todas on public.%I for all to authenticated
         using (grupo_id = public.meu_grupo_id())
         with check (grupo_id = public.meu_grupo_id());', t, t);
  end loop;
end $$;
