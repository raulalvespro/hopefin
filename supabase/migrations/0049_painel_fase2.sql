-- 0049 — Painel do dono (ERP), Fase 2: Visão geral rica.
-- "Precisa de atenção" (pendências acionáveis) + séries para mini-gráficos.
-- Só leitura/admin, guardado por sou_admin(). Nada de lançamentos (LGPD).

-- ──────────────────────────────────────────────────────────────────────────
-- Pendências que pedem ação do dono (com deep-link no front).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_atencao()
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select json_build_object(
    -- trials que vencem nos próximos 3 dias
    'trials_vencendo', (select coalesce(json_agg(t order by t->>'quando'), '[]'::json) from (
        select s.grupo_id, g.nome, s.trial_ends_at as quando
        from public.subscriptions s join public.grupos g on g.id = s.grupo_id
        where s.status = 'trial' and s.trial_ends_at between now() and now() + interval '3 days'
        order by s.trial_ends_at limit 20) t),
    -- inadimplentes
    'inadimplentes', (select coalesce(json_agg(t order by t->>'nome'), '[]'::json) from (
        select s.grupo_id, g.nome, s.current_period_end as quando
        from public.subscriptions s join public.grupos g on g.id = s.grupo_id
        where s.status = 'past_due' limit 20) t),
    -- e-mails de suporte não lidos
    'suporte_novos', coalesce((select count(*) from public.suporte_emails where status = 'novo'), 0),
    -- serviços com saldo abaixo do alerta
    'servicos_saldo_baixo', (select coalesce(json_agg(t order by t->>'nome'), '[]'::json) from (
        select nome, saldo_centavos, alerta_saldo_centavos, moeda from public.servicos
        where saldo_centavos is not null and alerta_saldo_centavos is not null
          and saldo_centavos <= alerta_saldo_centavos) t),
    -- falhas de IA nas últimas 24h
    'ia_falhas_24h', coalesce((select count(*) from public.ia_chamadas where not sucesso and criado_em >= now() - interval '24 hours'), 0)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_atencao() from public;
grant execute on function public.admin_atencao() to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- Séries diárias (últimos N dias) para mini-gráficos: cadastros de usuários e
-- novos grupos. Devolve todos os dias (inclusive os zerados).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_series(p_dias int default 14)
returns json language plpgsql stable security definer set search_path = public as $$
declare r json; dias int := least(greatest(coalesce(p_dias,14),1), 90);
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  with dias_serie as (
    select generate_series(
      (current_date - (dias - 1)), current_date, interval '1 day')::date as dia
  )
  select json_build_object(
    'dias', dias,
    'cadastros', (select coalesce(json_agg(json_build_object('dia', d.dia, 'n', coalesce(u.n,0)) order by d.dia), '[]'::json)
      from dias_serie d
      left join (select criado_em::date dia, count(*) n from public.usuarios
                 where criado_em >= current_date - (dias - 1) group by 1) u on u.dia = d.dia),
    'grupos', (select coalesce(json_agg(json_build_object('dia', d.dia, 'n', coalesce(g.n,0)) order by d.dia), '[]'::json)
      from dias_serie d
      left join (select criado_em::date dia, count(*) n from public.grupos
                 where criado_em >= current_date - (dias - 1) group by 1) g on g.dia = d.dia)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_series(int) from public;
grant execute on function public.admin_series(int) to authenticated;
