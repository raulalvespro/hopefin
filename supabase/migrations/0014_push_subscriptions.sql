-- 14: inscrições de Web Push (um registro por dispositivo/navegador).
-- Guarda o endpoint + chaves da PushSubscription do navegador para que a
-- Edge Function `send-push` possa enviar notificação ao celular mesmo com o
-- app fechado. Cada usuário gerencia apenas as próprias inscrições (RLS).
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  grupo_id    uuid references public.grupos(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  criado_em   timestamptz not null default now(),
  usado_em    timestamptz
);
create index if not exists push_subscriptions_grupo_idx   on public.push_subscriptions(grupo_id);
create index if not exists push_subscriptions_usuario_idx on public.push_subscriptions(usuario_id);

alter table public.push_subscriptions enable row level security;

-- Usuário só vê / cria / altera / apaga as próprias inscrições.
drop policy if exists push_subscriptions_sel on public.push_subscriptions;
create policy push_subscriptions_sel on public.push_subscriptions
  for select to authenticated using (usuario_id = auth.uid());

drop policy if exists push_subscriptions_ins on public.push_subscriptions;
create policy push_subscriptions_ins on public.push_subscriptions
  for insert to authenticated
  with check (usuario_id = auth.uid() and grupo_id = public.meu_grupo_id());

drop policy if exists push_subscriptions_upd on public.push_subscriptions;
create policy push_subscriptions_upd on public.push_subscriptions
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

drop policy if exists push_subscriptions_del on public.push_subscriptions;
create policy push_subscriptions_del on public.push_subscriptions
  for delete to authenticated using (usuario_id = auth.uid());
