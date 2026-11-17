-- 0060_resumo_retido.sql
-- Onda 1 / A1.9 (16/11/2026): segurar o e-mail "resumo do mês" e enviar pelo painel.
--
-- Decisão do Raul: se a Onda 1 (motor de cálculo) não estiver no ar até 01/12, o
-- e-mail do dia 1º NÃO sai com a conta antiga. Com a pausa ligada, o cron registra
-- cada envio como 'retido' (email_log) e o painel mostra em cada cliente que o
-- resumo está pendente, com botão pra enviar manualmente quando a Onda 1 concluir.
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

alter table public.admin_config
  add column if not exists resumo_mensal_pausado boolean not null default false;

-- Liga a pausa já (o de 01/12 fica retido até a Onda 1 ser publicada).
update public.admin_config set resumo_mensal_pausado = true where id = 1;

-- Lista os resumos retidos (um por cliente/mês) + o estado da pausa.
create or replace function public.admin_resumos_retidos()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  return json_build_object(
    'pausado', coalesce((select resumo_mensal_pausado from public.admin_config where id = 1), false),
    'itens', (select coalesce(json_agg(t order by t.criado_em), '[]'::json) from (
        select e.id, e.grupo_id, g.nome, e.ref, e.destino, e.erro, e.criado_em
          from public.email_log e
          left join public.grupos g on g.id = e.grupo_id
         where e.tipo = 'resumo_mensal' and e.status = 'retido'
         order by e.criado_em) t)
  );
end; $$;
revoke all on function public.admin_resumos_retidos() from public;
grant execute on function public.admin_resumos_retidos() to authenticated;

-- Liga/desliga a pausa (com auditoria).
create or replace function public.admin_set_resumo_pausado(p_pausado boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  update public.admin_config set resumo_mensal_pausado = coalesce(p_pausado, false) where id = 1;
  insert into public.admin_log (admin_id, acao, detalhe)
  values (auth.uid(), 'resumo_mensal_pausa', json_build_object('pausado', coalesce(p_pausado, false))::jsonb);
end; $$;
revoke all on function public.admin_set_resumo_pausado(boolean) from public;
grant execute on function public.admin_set_resumo_pausado(boolean) to authenticated;

-- "Precisa de atenção" ganha a contagem de resumos retidos.
create or replace function public.admin_atencao()
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select json_build_object(
    'trials_vencendo', (select coalesce(json_agg(t order by t.quando), '[]'::json) from (
        select s.grupo_id, g.nome, s.trial_ends_at as quando
        from public.subscriptions s join public.grupos g on g.id = s.grupo_id
        where s.status = 'trial' and s.trial_ends_at between now() and now() + interval '3 days'
        order by s.trial_ends_at limit 20) t),
    'inadimplentes', (select coalesce(json_agg(t order by t.nome), '[]'::json) from (
        select s.grupo_id, g.nome, s.current_period_end as quando
        from public.subscriptions s join public.grupos g on g.id = s.grupo_id
        where s.status = 'past_due' limit 20) t),
    'suporte_novos', coalesce((select count(*) from public.suporte_emails where status = 'novo'), 0),
    'servicos_saldo_baixo', (select coalesce(json_agg(t order by t.nome), '[]'::json) from (
        select nome, saldo_centavos, alerta_saldo_centavos, moeda from public.servicos
        where saldo_centavos is not null and alerta_saldo_centavos is not null
          and saldo_centavos <= alerta_saldo_centavos) t),
    'ia_falhas_24h', coalesce((select count(*) from public.ia_chamadas where not sucesso and criado_em >= now() - interval '24 hours'), 0),
    'resumos_retidos', coalesce((select count(*) from public.email_log where tipo = 'resumo_mensal' and status = 'retido'), 0)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_atencao() from public;
grant execute on function public.admin_atencao() to authenticated;
