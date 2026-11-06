-- ============================================================
-- 0020 — Log de interpretações de lançamento por IA (prompt 11)
-- ------------------------------------------------------------
-- Cada vez que a IA (Claude Haiku) interpreta um texto falado/digitado,
-- guardamos: o texto, o JSON que a IA devolveu, o JSON final salvo e se o
-- usuário corrigiu algo. Serve para medir a taxa de acerto no /admin.
-- A Edge Function interpretar-lancamento roda com o JWT do usuário (RLS).
-- Idempotente.
-- ============================================================
create table if not exists public.interpretacoes_log (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  usuario_id  uuid references public.usuarios(id) on delete set null,
  origem      text not null default 'texto' check (origem in ('voz','texto','whatsapp')),
  texto       text not null,
  json_ia     jsonb,                       -- o que a IA devolveu
  json_final  jsonb,                       -- o que foi salvo (após correção)
  corrigido   boolean not null default false,
  salvo       boolean not null default false,
  criado_em   timestamptz not null default now()
);
create index if not exists idx_interpretacoes_grupo
  on public.interpretacoes_log(grupo_id, criado_em desc);

alter table public.interpretacoes_log enable row level security;

drop policy if exists interpretacoes_select on public.interpretacoes_log;
create policy interpretacoes_select on public.interpretacoes_log
  for select to authenticated using (grupo_id = public.meu_grupo_id());

drop policy if exists interpretacoes_insert on public.interpretacoes_log;
create policy interpretacoes_insert on public.interpretacoes_log
  for insert to authenticated with check (grupo_id = public.meu_grupo_id());

drop policy if exists interpretacoes_update on public.interpretacoes_log;
create policy interpretacoes_update on public.interpretacoes_log
  for update to authenticated
  using (grupo_id = public.meu_grupo_id())
  with check (grupo_id = public.meu_grupo_id());
