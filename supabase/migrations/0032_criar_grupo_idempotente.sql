-- 0032_criar_grupo_idempotente.sql
-- Trava de segurança: criar_grupo() NÃO cria outro grupo para quem JÁ tem grupo (devolve o atual).
-- Motivo: o AuthContext antigo chamava criar_grupo sempre que a leitura do perfil falhava (erro
-- transitório, relação ambígua...), criando grupos novos em laço e tirando a pessoa do grupo dela
-- (incidente de 07/11/2026). O app não tem "trocar de grupo" por criar_grupo: só quem está SEM grupo
-- (cadastro / tela de escolha de grupo) precisa dela, e esse caminho continua igual.
create or replace function public.criar_grupo(p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid; atual uuid;
begin
  select grupo_id into atual from public.usuarios where id = auth.uid();
  if atual is not null then return atual; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'nome_vazio' using errcode = 'P0001'; end if;
  insert into public.grupos (nome, criado_por) values (trim(p_nome), auth.uid()) returning id into gid;
  update public.usuarios set grupo_id = gid where id = auth.uid();
  return gid;
end; $$;
