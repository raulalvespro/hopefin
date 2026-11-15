-- 0046 — Painel do dono (ERP), Etapa 5: Saúde do sistema (visão sob demanda).
-- Reúne sinais que o banco já conhece: crons (pg_cron) rodando, backlog de
-- assinaturas, erros de webhook. O painel chama admin_saude() e mostra verde/
-- amarelo/vermelho. O alerta por e-mail de hora em hora (só em problema NOVO)
-- é a próxima sub-etapa (envia e-mail → sensível, testar com o Raul).
-- Guardado por sou_admin(). Lê o schema cron (pg_cron) com SECURITY DEFINER.

create or replace function public.admin_saude()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  trials_venc int;
  past_due int;
  wh_erros int;
  crons json;
  crons_falhos int;
  problemas text[] := array[]::text[];
  nivel text := 'ok';
  r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;

  -- Crons: último run de cada job (pg_cron).
  select coalesce(json_agg(t order by t->>'jobname'), '[]'::json), count(*) filter (where (t->>'ultimo_status') is distinct from 'succeeded' and (t->>'ultimo_status') is not null)
    into crons, crons_falhos
  from (
    select json_build_object(
      'jobname', j.jobname, 'schedule', j.schedule, 'active', j.active,
      'ultimo_status', r.status, 'ultimo_em', r.start_time
    ) as t
    from cron.job j
    left join lateral (
      select status, start_time from cron.job_run_details d
      where d.jobid = j.jobid order by start_time desc limit 1
    ) r on true
  ) x;

  -- Backlog de assinaturas (sinal de cron/fluxo travado).
  select count(*) into trials_venc from public.subscriptions
    where status = 'trial' and trial_ends_at < now();
  select count(*) into past_due from public.subscriptions where status = 'past_due';

  -- Erros de webhook nas últimas 24h.
  select count(*) into wh_erros from public.webhook_log
    where recebido_em >= now() - interval '24 hours'
      and (erro is not null or coalesce(status,'') ilike 'erro%');

  if crons_falhos > 0 then problemas := problemas || format('%s cron(s) com última execução falha', crons_falhos); end if;
  if trials_venc > 0 then problemas := problemas || format('%s trial(s) vencido(s) ainda como trial', trials_venc); end if;
  if wh_erros > 0 then problemas := problemas || format('%s erro(s) de webhook nas últimas 24h', wh_erros); end if;

  if crons_falhos > 0 or wh_erros > 0 then nivel := 'erro';
  elsif trials_venc > 0 or past_due > 0 then nivel := 'atencao';
  else nivel := 'ok'; end if;

  select json_build_object(
    'nivel', nivel,
    'problemas', to_json(problemas),
    'banco', 'ok',
    'crons', crons,
    'crons_falhos', crons_falhos,
    'trials_vencidos', trials_venc,
    'past_due', past_due,
    'webhooks_erro_24h', wh_erros,
    'gerado_em', now()
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_saude() from public;
grant execute on function public.admin_saude() to authenticated;
