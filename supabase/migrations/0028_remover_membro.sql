-- 0028_remover_membro.sql
-- "Remover membro" do grupo (tela de convite, Configurações).
--
-- Até aqui o grupo não tinha dono. Passa a ter `criado_por` (quem criou o grupo);
-- só o dono remove membros. Remover = a pessoa sai do grupo (grupo_id = null) e, no
-- próximo acesso, cai na escolha de grupo. O que ela lançou continua no grupo.
-- Por segurança, não se remove a si mesmo nem quem fez a assinatura (titular).

alter table public.grupos
  add column if not exists criado_por uuid; -- SEM FK: uma FK aqui cria ambiguidade no embed grupos(*) do PostgREST (ver 0031)

-- Grupos existentes: dono = o membro mais antigo.
update public.grupos g
   set criado_por = (select u.id from public.usuarios u where u.grupo_id = g.id order by u.criado_em limit 1)
 where g.criado_por is null;

-- Novos grupos já nascem com dono.
create or replace function public.criar_grupo(p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if coalesce(trim(p_nome), '') = '' then raise exception 'nome_vazio' using errcode = 'P0001'; end if;
  insert into public.grupos (nome, criado_por) values (trim(p_nome), auth.uid()) returning id into gid;
  update public.usuarios set grupo_id = gid where id = auth.uid();
  return gid;
end; $$;

create or replace function public.remover_membro(p_usuario_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid := public.meu_grupo_id(); dono uuid; titular uuid;
begin
  select criado_por into dono from public.grupos where id = gid;
  if gid is null or dono is distinct from auth.uid() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if p_usuario_id = auth.uid() then
    raise exception 'nao_pode_remover_a_si' using errcode = 'P0001';
  end if;
  select titular_id into titular from public.subscriptions where grupo_id = gid;
  if titular is not null and titular = p_usuario_id then
    raise exception 'titular_da_assinatura' using errcode = 'P0001';
  end if;
  update public.usuarios set grupo_id = null where id = p_usuario_id and grupo_id = gid;
  if not found then raise exception 'membro_nao_encontrado' using errcode = 'P0001'; end if;
end; $$;
revoke all on function public.remover_membro(uuid) from public;
grant execute on function public.remover_membro(uuid) to authenticated;
