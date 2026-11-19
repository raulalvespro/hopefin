-- 0065_painel_exige_codigo.sql
-- Painel do dono (L37, 19/11/2026): o código do celular (verificação em 2 etapas, sessão
-- "aal2") passa a valer no SERVIDOR, não só na tela.
--
-- Antes, sou_admin() olhava só usuarios.is_admin. Quem tivesse a senha de um admin chamava as
-- funções do painel direto pela API, sem o código; e o /admin antigo dentro do app abria só com
-- a senha (a rota agora leva pro admin.hopefin.com.br — commit 9cee81d).
--
--  1) sou_admin() e sou_dono_app() exigem também a sessão com o código (auth.jwt()->>'aal' =
--     'aal2'). Vale pras 44 funções admin_* (todas começam com "if not sou_admin()" ou
--     "if not sou_dono_app()") e pras regras de leitura das tabelas do painel: admin_config,
--     admin_log, webhook_log, servicos, admin_cliente_notas, suporte_emails, ia_tarifas,
--     ia_chamadas.
--  2) minhas_flags() NÃO exige o código: as chaves de recurso do APP valem na sessão normal do
--     app (ex.: whatsapp_app só pro dono). Lê o papel direto da tabela.
--  As funções do servidor do painel (admin-reenviar-email, admin-suporte-responder e o envio
--  manual do resumo-mensal) passam a exigir aal2 no próprio código (deploy junto).
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

create or replace function public.sou_admin()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce((select is_admin from public.usuarios where id = auth.uid()), false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$function$;

create or replace function public.sou_dono_app()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce((select is_dono_app from public.usuarios where id = auth.uid()), false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$function$;

create or replace function public.minhas_flags()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with eu as (
    select coalesce(u.is_admin, false) as admin, coalesce(u.is_dono_app, false) as dono
      from public.usuarios u where u.id = auth.uid()
  )
  select coalesce(jsonb_object_agg(chave, true), '{}'::jsonb)
  from public.feature_flags f
  where f.audiencia = 'todos'
     or (f.audiencia = 'admins' and exists (select 1 from eu where eu.admin or eu.dono))
     or (f.audiencia = 'dono'   and exists (select 1 from eu where eu.dono));
$function$;
