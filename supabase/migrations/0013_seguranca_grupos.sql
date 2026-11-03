-- 13: fecha brecha de acesso entre grupos.
-- ANTES: usuarios_update não tinha `with check`, então o cliente podia trocar
-- o próprio grupo_id para QUALQUER grupo (ids vazavam por grupos_select=true)
-- e passar a ler as finanças daquele grupo. Correção:
--  1) entrar/criar grupo passam a ser RPCs SECURITY DEFINER (servidor valida);
--  2) o cliente não pode mais alterar grupo_id por update direto;
--  3) grupos_select restringe ao próprio grupo (não dá mais p/ enumerar códigos).

-- Entrar em grupo pelo código (sem expor outros grupos ao cliente)
create or replace function public.entrar_no_grupo(p_codigo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid;
begin
  select id into gid from public.grupos where codigo = lower(trim(p_codigo));
  if gid is null then
    raise exception 'codigo_invalido' using errcode = 'P0001';
  end if;
  update public.usuarios set grupo_id = gid where id = auth.uid();
  return gid;
end;
$$;

-- Criar grupo e já vincular o usuário logado (atômico)
create or replace function public.criar_grupo(p_nome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid;
begin
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'nome_vazio' using errcode = 'P0001';
  end if;
  insert into public.grupos (nome) values (trim(p_nome)) returning id into gid;
  update public.usuarios set grupo_id = gid where id = auth.uid();
  return gid;
end;
$$;

revoke all on function public.entrar_no_grupo(text) from public;
revoke all on function public.criar_grupo(text) from public;
grant execute on function public.entrar_no_grupo(text) to authenticated;
grant execute on function public.criar_grupo(text) to authenticated;

-- grupos: cada um vê só o próprio grupo; criação/entrada só via RPC acima.
drop policy if exists grupos_select on public.grupos;
create policy grupos_select on public.grupos
  for select to authenticated using (id = public.meu_grupo_id());
drop policy if exists grupos_insert on public.grupos;

-- usuarios: não pode mais trocar grupo_id por update direto (só via RPC definer).
drop policy if exists usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and grupo_id is not distinct from public.meu_grupo_id());
