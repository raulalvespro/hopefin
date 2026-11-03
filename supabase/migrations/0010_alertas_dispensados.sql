-- 10: alertas dispensados pelo usuário (para poder "fechar" um alerta).
-- Guarda o id lógico do alerta (texto) por grupo; o front filtra os dispensados.
create table if not exists public.alertas_dispensados (
  id            uuid primary key default gen_random_uuid(),
  grupo_id      uuid not null references public.grupos(id) on delete cascade,
  alerta_id     text not null,
  dispensado_em timestamptz not null default now(),
  unique (grupo_id, alerta_id)
);

create index if not exists idx_alertas_disp_grupo on public.alertas_dispensados(grupo_id);

alter table public.alertas_dispensados enable row level security;
drop policy if exists alertas_dispensados_todas on public.alertas_dispensados;
create policy alertas_dispensados_todas on public.alertas_dispensados
  for all to authenticated
  using (grupo_id = public.meu_grupo_id())
  with check (grupo_id = public.meu_grupo_id());
