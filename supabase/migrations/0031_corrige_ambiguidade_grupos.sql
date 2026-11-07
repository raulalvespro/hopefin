-- 0031_corrige_ambiguidade_grupos.sql
-- CORREÇÃO da 0028: a FK grupos.criado_por -> usuarios criou uma 2ª relação entre as tabelas
-- grupos e usuarios (a 1ª é usuarios.grupo_id -> grupos). O PostgREST passou a recusar o embed
-- "usuarios?select=*,grupos(*)" (erro PGRST201 "more than one relationship"), que o app faz no
-- login: o perfil não carregava (tela em branco) e o fallback do AuthContext chegava a criar grupos novos.
-- Solução: criado_por continua existindo, mas SEM foreign key (só um uuid). A 0028 também foi ajustada.
alter table public.grupos drop constraint if exists grupos_criado_por_fkey;
notify pgrst, 'reload schema';
