-- 0128 — Chave de recurso liberada pra PESSOAS escolhidas (26/11/2026).
--
-- Até aqui a chave (feature_flags) tinha só "só o dono" / "admins" / "todos". O Raul quer liberar o WhatsApp
-- só pra Larissa (mesmo grupo) antes de liberar pra todos. Agora, além da audiência, o painel guarda uma
-- lista de pessoas que também veem a chave. Funciona pra qualquer chave (whatsapp_app, financiamentos…).
--  • feature_flag_pessoas (chave, usuario_id): só o servidor mexe (RLS ligada, sem regra pro app).
--  • minhas_flags(): devolve também as chaves em que a pessoa está na lista.
--  • admin_flag_pessoas(): lista por chave (nome + e-mail) — só o dono, com o código do celular.
--  • admin_flag_pessoa(chave, email, liberar): põe/tira alguém pelo e-mail da conta — só o dono.
-- Idempotente.

create table if not exists public.feature_flag_pessoas (
  chave       text not null references public.feature_flags(chave) on delete cascade,
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  criado_por  uuid,
  primary key (chave, usuario_id)
);
alter table public.feature_flag_pessoas enable row level security;
revoke all on public.feature_flag_pessoas from anon, authenticated;

create or replace function public.minhas_flags()
returns jsonb language sql stable security definer set search_path = public as $$
  with eu as (
    select coalesce(u.is_admin, false) as admin, coalesce(u.is_dono_app, false) as dono
      from public.usuarios u where u.id = auth.uid()
  )
  select coalesce(jsonb_object_agg(chave, true), '{}'::jsonb)
  from public.feature_flags f
  where f.audiencia = 'todos'
     or (f.audiencia = 'admins' and exists (select 1 from eu where eu.admin or eu.dono))
     or (f.audiencia = 'dono'   and exists (select 1 from eu where eu.dono))
     or exists (select 1 from public.feature_flag_pessoas fp where fp.chave = f.chave and fp.usuario_id = auth.uid());
$$;
revoke all on function public.minhas_flags() from public, anon;
grant execute on function public.minhas_flags() to authenticated;

create or replace function public.admin_flag_pessoas()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_dono_app() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_object_agg(chave, pessoas) from (
      select fp.chave, jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'email', u.email) order by u.nome) pessoas
        from public.feature_flag_pessoas fp join public.usuarios u on u.id = fp.usuario_id
       group by fp.chave) x), '{}'::jsonb);
end $$;
revoke all on function public.admin_flag_pessoas() from public, anon;
grant execute on function public.admin_flag_pessoas() to authenticated;

create or replace function public.admin_flag_pessoa(p_chave text, p_email text, p_liberar boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_nome text;
begin
  if not public.sou_dono_app() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.feature_flags where chave = p_chave) then
    raise exception 'chave_invalida' using errcode = 'P0001';
  end if;
  select id, nome into v_id, v_nome from public.usuarios where lower(email) = lower(btrim(p_email)) limit 1;
  if v_id is null then return jsonb_build_object('ok', false, 'motivo', 'pessoa_nao_encontrada'); end if;
  if p_liberar then
    insert into public.feature_flag_pessoas (chave, usuario_id, criado_por) values (p_chave, v_id, auth.uid())
    on conflict do nothing;
  else
    delete from public.feature_flag_pessoas where chave = p_chave and usuario_id = v_id;
  end if;
  return jsonb_build_object('ok', true, 'nome', v_nome);
end $$;
revoke all on function public.admin_flag_pessoa(text, text, boolean) from public, anon;
grant execute on function public.admin_flag_pessoa(text, text, boolean) to authenticated;
