-- HopeFin — Migração 0004: Planejado × Praticado (contas fixas)
-- ============================================================
-- Cada conta fixa tem um valor PREVISTO (contas_fixas.valor).
-- A cada mês (competência 'YYYY-MM') o usuário lança o valor REAL
-- que de fato veio. A diferença previsto × real é calculada no app.
-- ============================================================

create table if not exists public.fixas_lancamentos (
  id             uuid primary key default gen_random_uuid(),
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  conta_fixa_id  uuid not null references public.contas_fixas(id) on delete cascade,
  competencia    text not null,                 -- 'YYYY-MM'
  valor_previsto numeric(12,2) not null default 0,
  valor_real     numeric(12,2),                 -- null = ainda não lançado
  pago           boolean not null default false,
  data_pagamento date,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (conta_fixa_id, competencia)
);

create index if not exists idx_fixas_lanc_grupo_comp
  on public.fixas_lancamentos(grupo_id, competencia);

-- RLS: mesmo padrão das demais tabelas (acesso por grupo)
alter table public.fixas_lancamentos enable row level security;
drop policy if exists fixas_lancamentos_todas on public.fixas_lancamentos;
create policy fixas_lancamentos_todas on public.fixas_lancamentos
  for all to authenticated
  using (grupo_id = public.meu_grupo_id())
  with check (grupo_id = public.meu_grupo_id());
