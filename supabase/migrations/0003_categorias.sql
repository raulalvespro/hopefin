-- ============================================================
-- HopeFin — Migração 0003: categorias por grupo (fonte única)
-- Substitui as listas hardcoded espalhadas pelas telas.
-- A chave é `nome` (slug), compatível com gastos.categoria existente.
-- ============================================================

create table if not exists public.categorias (
  id        uuid primary key default gen_random_uuid(),
  grupo_id  uuid not null references public.grupos(id) on delete cascade,
  nome      text not null,
  emoji     text default '📦',
  cor       text,
  ordem     int  default 0,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (grupo_id, nome)
);

create index if not exists idx_categorias_grupo on public.categorias(grupo_id, ordem);

-- RLS: escopo por grupo
alter table public.categorias enable row level security;
drop policy if exists categorias_todas on public.categorias;
create policy categorias_todas on public.categorias
  for all to authenticated
  using (grupo_id = public.meu_grupo_id())
  with check (grupo_id = public.meu_grupo_id());

-- Semeia as categorias padrão para todos os grupos existentes (idempotente)
insert into public.categorias (grupo_id, nome, emoji, ordem)
select g.id, c.nome, c.emoji, c.ordem
from public.grupos g
cross join (values
  ('mercado',     '🛒', 1),
  ('transporte',  '⛽', 2),
  ('alimentacao', '🍔', 3),
  ('saude',       '💊', 4),
  ('lazer',       '🎉', 5),
  ('vestuario',   '👕', 6),
  ('eletronico',  '📱', 7),
  ('moveis',      '🛋️', 8),
  ('assinatura',  '📺', 9),
  ('moradia',     '🏠', 10),
  ('educacao',    '📚', 11),
  ('outros',      '📦', 99)
) as c(nome, emoji, ordem)
on conflict (grupo_id, nome) do nothing;

-- ============================================================
-- Semeia categorias padrão automaticamente para grupos NOVOS
-- ============================================================
create or replace function public.seed_categorias_grupo()
returns trigger
language plpgsql
as $$
begin
  insert into public.categorias (grupo_id, nome, emoji, ordem)
  values
    (new.id, 'mercado',     '🛒', 1),
    (new.id, 'transporte',  '⛽', 2),
    (new.id, 'alimentacao', '🍔', 3),
    (new.id, 'saude',       '💊', 4),
    (new.id, 'lazer',       '🎉', 5),
    (new.id, 'vestuario',   '👕', 6),
    (new.id, 'eletronico',  '📱', 7),
    (new.id, 'moveis',      '🛋️', 8),
    (new.id, 'assinatura',  '📺', 9),
    (new.id, 'moradia',     '🏠', 10),
    (new.id, 'educacao',    '📚', 11),
    (new.id, 'outros',      '📦', 99)
  on conflict (grupo_id, nome) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_seed_categorias on public.grupos;
create trigger trg_seed_categorias
  after insert on public.grupos
  for each row execute function public.seed_categorias_grupo();
