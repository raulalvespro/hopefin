-- 0066_convite_trava.sql
-- Convite (L38, 19/11/2026): trava contra chute de código + limite de pessoas por grupo.
--
-- Antes, entrar_no_grupo aceitava qualquer quantidade de tentativas. O código tem 8 caracteres
-- (~4,3 bilhões de combinações) e quem acerta entra no grupo e vê as finanças da família. Com o
-- cadastro sem confirmação de e-mail, dá pra criar várias contas, e o risco cresce com o número de
-- grupos. O banco também não barrava o 7º membro (o plano Família é "até 6 pessoas").
--
--  1) limites_config.membros_por_grupo (padrão 6): o limite fica num lugar só.
--  2) convite_tentativas: cada código ERRADO fica registrado por 2 dias (pessoa + IP embaralhado
--     com md5, nunca o IP em si). Só a função lê e escreve (RLS sem regra).
--  3) entrar_no_grupo:
--       • 10 códigos errados por pessoa ou 30 por IP na última hora → 'muitas_tentativas';
--       • código errado devolve VAZIO, sem erro (se desse erro, o registro da tentativa seria
--         desfeito junto). O app trata vazio como "código inválido" (commit 9cee81d, publicado antes);
--       • já está no grupo → devolve o grupo; grupo com o limite de pessoas → 'grupo_cheio'
--         (o grupo fica travado durante a conta, pra duas entradas ao mesmo tempo não passarem).
--     O IP vem do cabeçalho cf-connecting-ip (posto pela Cloudflare; o x-forwarded-for aceita valor
--     forjado pelo cliente, testado em 19/11).
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

-- 1) Limite de pessoas por grupo ------------------------------------------------------------
alter table public.limites_config add column if not exists membros_por_grupo int not null default 6;

-- 2) Tentativas erradas -------------------------------------------------------------------------
create table if not exists public.convite_tentativas (
  id         bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  ip_hash    text,
  criado_em  timestamptz not null default now()
);
create index if not exists convite_tentativas_usuario_idx on public.convite_tentativas (usuario_id, criado_em desc);
create index if not exists convite_tentativas_ip_idx on public.convite_tentativas (ip_hash, criado_em desc);
alter table public.convite_tentativas enable row level security;  -- sem regra: só a função usa
revoke all on public.convite_tentativas from anon, authenticated;

-- 3) Entrar no grupo com trava e limite -----------------------------------------------------------
create or replace function public.entrar_no_grupo(p_codigo text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  uid       uuid := auth.uid();
  gid       uuid;
  v_hdr     json := nullif(current_setting('request.headers', true), '')::json;
  v_ip      text := nullif(trim(coalesce(v_hdr ->> 'cf-connecting-ip', '')), '');
  v_ip_hash text := case when v_ip is null then null else md5(v_ip) end;
  v_limite  int  := coalesce((select membros_por_grupo from public.limites_config where id = 1), 6);
  v_membros int;
begin
  if uid is null then raise exception 'nao_autenticado' using errcode = 'P0001'; end if;

  -- Trava contra chute de código.
  if (select count(*) from public.convite_tentativas
       where usuario_id = uid and criado_em > now() - interval '1 hour') >= 10
     or (v_ip_hash is not null and (select count(*) from public.convite_tentativas
       where ip_hash = v_ip_hash and criado_em > now() - interval '1 hour') >= 30) then
    raise exception 'muitas_tentativas' using errcode = 'P0001';
  end if;

  select id into gid from public.grupos where codigo = lower(trim(p_codigo));
  if gid is null then
    -- Código errado: registra e devolve vazio (sem exceção, senão o registro se perde).
    delete from public.convite_tentativas where criado_em < now() - interval '2 days';
    insert into public.convite_tentativas (usuario_id, ip_hash) values (uid, v_ip_hash);
    return null;
  end if;

  -- Já está nesse grupo: nada a fazer.
  if exists (select 1 from public.usuarios where id = uid and grupo_id = gid) then return gid; end if;

  -- Limite de pessoas (plano Família: 6). Trava o grupo pra contagem não furar com entradas juntas.
  perform 1 from public.grupos where id = gid for update;
  select count(*) into v_membros from public.usuarios where grupo_id = gid;
  if v_membros >= v_limite then raise exception 'grupo_cheio' using errcode = 'P0001'; end if;

  update public.usuarios set grupo_id = gid where id = uid;
  return gid;
end; $function$;
