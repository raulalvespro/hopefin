-- 0042_gestao_admins — administradores gerenciáveis pelo painel + auditoria.
--
-- Até aqui `is_admin` era setado na mão no banco (0021 fez um UPDATE único por e-mail).
-- Agora o dono concede/revoga admin PELO painel, por e-mail, com auditoria em admin_log.
-- Tudo guardado por sou_admin() (mesma trava das outras RPCs do /admin).
--
-- Travas de segurança: não dá pra revogar a si mesmo nem o ÚLTIMO admin (nunca fica
-- um app sem dono). Conceder só a quem JÁ tem conta (não cria usuário).

-- Lista os admins atuais (nome, e-mail, último acesso, se sou eu).
create or replace function public.admin_listar_admins()
returns json language plpgsql stable security definer set search_path = public as $$
declare res json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select coalesce(json_agg(a order by a.nome), '[]'::json) into res from (
    select u.id, u.nome, u.email,
           au.last_sign_in_at as ultimo_acesso,
           (u.id = auth.uid()) as sou_eu
      from public.usuarios u
      left join auth.users au on au.id = u.id
     where u.is_admin = true
  ) a;
  return res;
end; $$;

-- Concede admin a um usuário EXISTENTE, por e-mail.
create or replace function public.admin_conceder_admin(p_email text)
returns json language plpgsql security definer set search_path = public as $$
declare alvo public.usuarios;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select * into alvo from public.usuarios where lower(email) = lower(trim(p_email));
  if alvo.id is null then raise exception 'sem_conta' using errcode = 'P0001'; end if;
  update public.usuarios set is_admin = true where id = alvo.id;
  insert into public.admin_log (admin_id, acao, detalhe)
    values (auth.uid(), 'conceder_admin', json_build_object('alvo', alvo.id, 'email', alvo.email));
  return json_build_object('ok', true, 'id', alvo.id, 'email', alvo.email, 'nome', alvo.nome);
end; $$;

-- Revoga admin. Não pode a si mesmo nem o último admin.
create or replace function public.admin_revogar_admin(p_user_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare total int;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  if p_user_id = auth.uid() then raise exception 'nao_pode_a_si_mesmo' using errcode = 'P0001'; end if;
  select count(*) into total from public.usuarios where is_admin = true;
  if total <= 1 then raise exception 'ultimo_admin' using errcode = 'P0001'; end if;
  update public.usuarios set is_admin = false where id = p_user_id;
  insert into public.admin_log (admin_id, acao, detalhe)
    values (auth.uid(), 'revogar_admin', json_build_object('alvo', p_user_id));
  return json_build_object('ok', true);
end; $$;

revoke all on function public.admin_listar_admins() from public;
grant execute on function public.admin_listar_admins() to authenticated;
revoke all on function public.admin_conceder_admin(text) from public;
grant execute on function public.admin_conceder_admin(text) to authenticated;
revoke all on function public.admin_revogar_admin(uuid) from public;
grant execute on function public.admin_revogar_admin(uuid) to authenticated;
