-- 0079_regua_fim_teste.sql
-- Régua de fim de teste (A6.2, 20/11/2026): a função fim-de-trial ganhou a régua nova
-- (3 dias antes, último dia e 1 dia depois, com "sentimos sua falta"), mas ela só vale quando
-- o Raul aprovar os textos. Até lá a chave fica DESLIGADA e o cron diário segue mandando a
-- régua de hoje (2 dias antes e último dia), igualzinho.
--
-- Ligar (depois do ok do Raul):  update public.admin_config set regua_fim_teste_nova = true where id = 1;
-- Prévia sem envio: POST fim-de-trial { "acao": "previa" } com x-cron-secret.
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

alter table public.admin_config add column if not exists regua_fim_teste_nova boolean not null default false;
