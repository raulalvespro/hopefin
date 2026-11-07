-- 0033_criar_grupo_com_trava.sql
-- Fecha a última brecha: duas chamadas SIMULTÂNEAS de criar_grupo() (ex.: o app carregando o perfil 2x
-- ao mesmo tempo no cadastro) liam "sem grupo" ao mesmo tempo e criavam um grupo cada. Agora a linha do
-- usuário é travada (FOR UPDATE): a 2ª chamada espera a 1ª terminar, vê o grupo já criado e devolve o mesmo.
create or replace function public.criar_grupo(p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid; atual uuid;
begin
  select grupo_id into atual from public.usuarios where id = auth.uid() for update;
  if atual is not null then return atual; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'nome_vazio' using errcode = 'P0001'; end if;
  insert into public.grupos (nome, criado_por) values (trim(p_nome), auth.uid()) returning id into gid;
  update public.usuarios set grupo_id = gid where id = auth.uid();
  return gid;
end; $$;
