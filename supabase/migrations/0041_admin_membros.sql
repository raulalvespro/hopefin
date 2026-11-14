-- 0041_admin_membros — lista os membros de um grupo para o /admin poder reenviar e-mail.
--
-- O painel precisa escolher PARA QUEM reenviar o acesso (ex.: a esposa que não recebeu o
-- e-mail). Esta RPC devolve os membros do grupo com nome, e-mail, se é o dono e o último
-- acesso (de auth.users). Só admin chama (sou_admin()). É leitura pontual de suporte —
-- o painel segue SEM mostrar lançamentos das famílias (LGPD).
--
-- O reenvio em si (gerar magic link / recuperação e disparar via Resend) fica na Edge
-- Function `admin-reenviar-email`, que também valida is_admin pelo JWT.

create or replace function public.admin_membros(p_grupo_id uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare res json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select coalesce(json_agg(m order by m.is_dono desc, m.nome), '[]'::json) into res from (
    select u.id,
           u.nome,
           u.email,
           (u.id = g.criado_por) as is_dono,
           au.last_sign_in_at   as ultimo_acesso,
           (au.email_confirmed_at is not null) as email_confirmado
      from public.usuarios u
      join public.grupos g  on g.id = u.grupo_id
      left join auth.users au on au.id = u.id
     where u.grupo_id = p_grupo_id
  ) m;
  return res;
end; $$;

revoke all on function public.admin_membros(uuid) from public;
grant execute on function public.admin_membros(uuid) to authenticated;
