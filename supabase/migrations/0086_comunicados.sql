-- 0086 — Comunicados (A8.15, 21/11/2026, ok do Raul): o dono manda um aviso pelo painel pra um
-- público (todos, assinantes, em teste, cortesia, quem não entra há X dias ou um grupo) pelos canais
-- que escolher (card no Início do app, notificação no celular, e-mail). Sempre dá pra "Enviar teste
-- pra mim" antes. O histórico mostra quantos receberam, viram e tocaram no botão.
-- O envio é pela Edge Function admin-comunicado (admin + código do celular). E-mail sempre com o
-- "não quero receber" (LGPD): usuarios.recebe_comunicados (função comunicado-sair, link assinado).
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

-- 1) Tabelas ----------------------------------------------------------------------------------
create table if not exists public.comunicados (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null check (char_length(titulo) between 3 and 80),
  texto            text not null check (char_length(texto) between 3 and 600),
  botao_texto      text check (botao_texto is null or char_length(botao_texto) <= 30),
  botao_rota       text check (botao_rota is null or botao_rota ~ '^/[a-z0-9/?=&-]*$'),
  publico          text not null check (publico in ('todos', 'assinantes', 'teste', 'cortesia', 'inativos', 'grupo')),
  inativos_dias    int check (inativos_dias is null or inativos_dias between 1 and 365),
  grupo_id         uuid references public.grupos(id) on delete set null,
  canais           text[] not null check (canais <@ array['app', 'push', 'email']::text[] and cardinality(canais) > 0),
  teste            boolean not null default false,   -- "Enviar teste pra mim" (só o admin recebeu)
  criado_por       uuid,
  criado_em        timestamptz not null default now(),
  enviado_em       timestamptz,
  destinatarios    int not null default 0,
  enviados_push    int not null default 0,
  enviados_email   int not null default 0
);
alter table public.comunicados enable row level security;  -- sem policy: só service_role e RPCs

create table if not exists public.comunicado_entregas (
  comunicado_id  uuid not null references public.comunicados(id) on delete cascade,
  usuario_id     uuid not null references public.usuarios(id) on delete cascade,
  no_app         boolean not null default false,  -- aparece como card no Início
  entregue_em    timestamptz not null default now(),
  visto_em       timestamptz,
  clicado_em     timestamptz,
  dispensado_em  timestamptz,
  primary key (comunicado_id, usuario_id)
);
alter table public.comunicado_entregas enable row level security;  -- sem policy: só pelas RPCs
create index if not exists idx_comunicado_entregas_usuario on public.comunicado_entregas (usuario_id) where no_app and dispensado_em is null;

alter table public.usuarios add column if not exists recebe_comunicados boolean not null default true;
comment on column public.usuarios.recebe_comunicados is 'E-mail de comunicados (A8.15). false = pediu pra não receber (link do e-mail ou Notificações)';

-- 2) Quem recebe (só servidor) ----------------------------------------------------------------
create or replace function public.comunicado_destinatarios(p_publico text, p_dias int default null, p_grupo uuid default null)
returns table (usuario_id uuid, grupo_id uuid, nome text, email text, recebe_email boolean)
language sql stable security definer set search_path = public as $$
  select u.id, u.grupo_id, u.nome, au.email::text, u.recebe_comunicados
    from public.usuarios u
    join auth.users au on au.id = u.id
    left join public.subscriptions s on s.grupo_id = u.grupo_id
   where u.grupo_id is not null
     and case p_publico
           when 'todos'      then true
           when 'assinantes' then s.status = 'active' and not coalesce(s.is_cortesia, false)
           when 'teste'      then s.status = 'trial' and (s.trial_ends_at is null or s.trial_ends_at > now())
           when 'cortesia'   then coalesce(s.is_cortesia, false)
           when 'inativos'   then au.last_sign_in_at is null
                                  or au.last_sign_in_at < now() - make_interval(days => greatest(coalesce(p_dias, 14), 1))
           when 'grupo'      then u.grupo_id = p_grupo
           else false
         end;
$$;
revoke all on function public.comunicado_destinatarios(text, int, uuid) from public, anon, authenticated;

-- 3) Painel: quantos vão receber, grupos e histórico ---------------------------------------------
create or replace function public.admin_comunicado_previa(p_publico text, p_dias int default null, p_grupo uuid default null)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  return (select json_build_object('pessoas', count(*), 'com_email', count(*) filter (where recebe_email))
            from public.comunicado_destinatarios(p_publico, p_dias, p_grupo));
end $$;
revoke all on function public.admin_comunicado_previa(text, int, uuid) from public, anon, authenticated;
grant execute on function public.admin_comunicado_previa(text, int, uuid) to authenticated;

create or replace function public.admin_comunicado_grupos()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  return (select coalesce(json_agg(json_build_object('id', g.id, 'nome', g.nome) order by g.nome), '[]'::json) from public.grupos g);
end $$;
revoke all on function public.admin_comunicado_grupos() from public, anon, authenticated;
grant execute on function public.admin_comunicado_grupos() to authenticated;

create or replace function public.admin_comunicados_listar()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  return (select coalesce(json_agg(t order by t.criado_em desc), '[]'::json) from (
    select c.id, c.titulo, c.texto, c.botao_texto, c.botao_rota, c.publico, c.inativos_dias, c.grupo_id, c.canais,
           c.teste, c.criado_em, c.enviado_em, c.destinatarios, c.enviados_push, c.enviados_email,
           (select count(*) from public.comunicado_entregas e where e.comunicado_id = c.id and e.visto_em is not null) as vistos,
           (select count(*) from public.comunicado_entregas e where e.comunicado_id = c.id and e.clicado_em is not null) as clicados
      from public.comunicados c
     order by c.criado_em desc limit 100) t);
end $$;
revoke all on function public.admin_comunicados_listar() from public, anon, authenticated;
grant execute on function public.admin_comunicados_listar() to authenticated;

-- 4) App: meus comunicados (card no Início) e marcar visto/clicado/dispensado -------------------
create or replace function public.meus_comunicados()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', c.id, 'titulo', c.titulo, 'texto', c.texto,
                                             'botao_texto', c.botao_texto, 'botao_rota', c.botao_rota)
                           order by e.entregue_em desc), '[]'::json)
    from public.comunicado_entregas e
    join public.comunicados c on c.id = e.comunicado_id
   where e.usuario_id = auth.uid() and e.no_app and e.dispensado_em is null
     and e.entregue_em > now() - interval '30 days';
$$;
revoke all on function public.meus_comunicados() from public, anon, authenticated;
grant execute on function public.meus_comunicados() to authenticated;

create or replace function public.comunicado_marcar(p_id uuid, p_acao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.comunicado_entregas e set
    visto_em      = case when p_acao in ('visto', 'clicado', 'dispensado') then coalesce(e.visto_em, now()) else e.visto_em end,
    clicado_em    = case when p_acao = 'clicado' then coalesce(e.clicado_em, now()) else e.clicado_em end,
    dispensado_em = case when p_acao in ('dispensado', 'clicado') then coalesce(e.dispensado_em, now()) else e.dispensado_em end
   where e.comunicado_id = p_id and e.usuario_id = auth.uid();
end $$;
revoke all on function public.comunicado_marcar(uuid, text) from public, anon, authenticated;
grant execute on function public.comunicado_marcar(uuid, text) to authenticated;
