-- 0064_trava_funcoes_banco.sql
-- Segurança (19/11/2026): fecha as funções do banco que a chave pública do app (anon) ou
-- qualquer pessoa logada conseguia chamar sem precisar. Continuação da 0063 (WhatsApp).
--
-- Por que acontecia: no Supabase, toda função nova do schema public nasce com EXECUTE para
-- anon e authenticated (privilégio padrão do dono "postgres"). O "revoke ... from public"
-- das migrações antigas não tirava esse acesso, e função refeita com drop + create voltava a
-- ficar aberta (foi o que aconteceu com resumo_mensal e vencimentos_a_vencer).
--
--  1) VAZAMENTOS fechados, só o servidor (service_role):
--       • resumo_mensal — devolvia nome, e-mail e os totais do mês de TODOS os clientes;
--       • vencimentos_a_vencer — nome, e-mail e contas a vencer de todos (sem uso desde a Onda 1);
--       • encerrar_trials_vencidos e encerrar_assinaturas_canceladas (rotina fim-de-trial);
--       • garantir_series_grupo (só é usada por dentro do garantir_series).
--  2) Só quem está logado (tira anon): o painel do dono (admin_*, todas conferem sou_admin()
--     ou sou_dono_app() por dentro) e as funções do app que agem sobre o usuário logado.
--  3) Continuam abertas de propósito: planos_publicos e config_mascote (telas antes do login) e
--     meu_grupo_id, sou_admin e grupo_pode_lancar (usadas nas regras das tabelas; só respondem
--     sobre quem está chamando). Funções de gatilho não são chamáveis pela API.
--  4) iniciar_trial_familia: os dias de teste vêm SEMPRE de planos_config. Antes, quem chamasse
--     a função antes do app escolhia quantos dias de teste ganhava.
--  5) registrar_ia_chamada: sem número negativo e com textos cortados, pra ninguém bagunçar o
--     painel de custos chamando a função direto.
--  6) Funções de gatilho com search_path fixo (aviso do verificador de segurança do Supabase).
--  7) Função NOVA nasce fechada: o dono "postgres" deixa de dar EXECUTE a anon/authenticated
--     por padrão. Migração que cria RPC pro app precisa de
--     "grant execute on function ... to authenticated" (e anon só se for usada antes do login).
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

-- 4) Dias de teste sempre da configuração -----------------------------------------------
create or replace function public.iniciar_trial_familia(dias_trial integer default null::integer)
returns public.subscriptions language plpgsql security definer set search_path to 'public' as $function$
declare
  g uuid := public.meu_grupo_id();
  linha public.subscriptions;
  -- 0064: o parâmetro dias_trial ficou só por compatibilidade e é ignorado.
  dias int := coalesce((select trial_dias from public.planos_config where id = 1), 7);
begin
  if g is null then raise exception 'usuario_sem_grupo' using errcode = 'P0001'; end if;
  select * into linha from public.subscriptions where grupo_id = g;
  if found then return linha; end if;
  insert into public.subscriptions
    (grupo_id, titular_id, status, trial_started_at, trial_ends_at, current_period_end)
  values
    (g, auth.uid(), 'trial', now(),
     now() + make_interval(days => dias), now() + make_interval(days => dias))
  returning * into linha;
  return linha;
end; $function$;

-- 5) Registro de chamada de IA sem número negativo nem texto gigante ---------------------
create or replace function public.registrar_ia_chamada(p_operacao text, p_modelo text default null::text,
  p_tokens_entrada integer default 0, p_tokens_saida integer default 0, p_ms integer default null::integer,
  p_sucesso boolean default true, p_erro text default null::text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_grupo uuid;
  v_tar public.ia_tarifas%rowtype;
  v_custo numeric(12,6) := 0;
  v_id uuid;
  -- 0064: nada de negativo (não dá pra "apagar" custo) e teto por chamada.
  v_in  int := least(greatest(coalesce(p_tokens_entrada, 0), 0), 1000000);
  v_out int := least(greatest(coalesce(p_tokens_saida, 0), 0), 1000000);
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = 'P0001'; end if;
  select grupo_id into v_grupo from public.usuarios where id = v_uid;
  select * into v_tar from public.ia_tarifas where modelo = p_modelo;
  if found then
    v_custo := v_in/1000000.0 * v_tar.entrada_usd_milhao
             + v_out/1000000.0 * v_tar.saida_usd_milhao;
  end if;
  insert into public.ia_chamadas
    (grupo_id, usuario_id, operacao, modelo, tokens_entrada, tokens_saida, custo_usd, ms, sucesso, erro)
  values
    (v_grupo, v_uid, left(p_operacao, 60), left(p_modelo, 80), v_in, v_out,
     v_custo, case when p_ms < 0 then 0 else p_ms end, coalesce(p_sucesso, true), left(p_erro, 500))
  returning id into v_id;
  return v_id;
end; $function$;

-- 1) Só o servidor (service_role) ---------------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = any (array['resumo_mensal', 'vencimentos_a_vencer', 'encerrar_trials_vencidos',
                                  'encerrar_assinaturas_canceladas', 'garantir_series_grupo'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- 2) Só quem está logado (authenticated) ----------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and (p.proname like 'admin\_%'
            or p.proname = any (array[
                 'criar_grupo', 'entrar_no_grupo', 'decidir_virada', 'desconectar_whatsapp',
                 'desfazer_recebimento', 'garantir_series', 'gerar_codigo_whatsapp', 'iniciar_trial_familia',
                 'minhas_flags', 'receber_de_pessoa', 'registrar_push', 'resgatar_cupom', 'limite_ia_status',
                 'registrar_consumo_ia', 'registrar_ia_chamada', 'remover_membro', 'sou_dono_app']))
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- 6) Gatilhos com search_path fixo --------------------------------------------------------
alter function public.gerar_parcelas() set search_path = public;
alter function public.seed_categorias_grupo() set search_path = public;
alter function public.set_atualizado_em() set search_path = public;

-- 7) Função nova nasce fechada --------------------------------------------------------------
-- Duas regras somam: a geral do Postgres (PUBLIC executa toda função nova) e a do schema
-- public (anon e authenticated). As duas precisam sair; a geral só sai sem "in schema".
-- Gatilho continua disparando (o Postgres não confere EXECUTE ao disparar o gatilho).
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
