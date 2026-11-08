-- Prompt 22: chave liga/desliga do mascote (Joca) e das figurinhas, no painel /admin.
-- Guardada em admin_config (linha única). Leitura pública por RPC (o app lê no login);
-- escrita só por admin, com registro em admin_log.
alter table public.admin_config add column if not exists mascote_ativo boolean not null default true;
alter table public.admin_config add column if not exists figurinhas_ativas boolean not null default true;

create or replace function public.config_mascote()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('mascote', mascote_ativo, 'figurinhas', figurinhas_ativas)
    from public.admin_config where id = 1;
$$;
revoke all on function public.config_mascote() from public;
grant execute on function public.config_mascote() to anon, authenticated;

create or replace function public.admin_set_mascote(p_mascote boolean, p_figurinhas boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  update public.admin_config
     set mascote_ativo = coalesce(p_mascote, mascote_ativo),
         figurinhas_ativas = coalesce(p_figurinhas, figurinhas_ativas),
         atualizado_em = now()
   where id = 1;
  insert into public.admin_log (admin_id, acao, detalhe)
    values (auth.uid(), 'config_mascote', json_build_object('mascote', p_mascote, 'figurinhas', p_figurinhas));
  return json_build_object('ok', true);
end; $$;
revoke all on function public.admin_set_mascote(boolean, boolean) from public;
grant execute on function public.admin_set_mascote(boolean, boolean) to authenticated;
