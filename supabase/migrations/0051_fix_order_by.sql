-- 0051 — Correção: json_agg(t order by t->>'campo') falha porque `t` é record,
-- não json (operator record ->> unknown não existe). Troca por order by t.campo.
-- Afeta admin_custos_ia (0047), admin_auditoria (0048) e admin_atencao (0049).

-- admin_custos_ia: ordena por t.custo_usd (coluna do subselect), não t->>'custo_usd'.
create or replace function public.admin_custos_ia(p_dias int default 30)
returns json language plpgsql stable security definer set search_path = public as $$
declare r json; dias int := greatest(1, coalesce(p_dias, 30));
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select json_build_object(
    'dias', dias,
    'total_chamadas', coalesce((select count(*) from public.ia_chamadas where criado_em >= now() - (dias||' days')::interval), 0),
    'total_custo_usd', coalesce((select round(sum(custo_usd),4) from public.ia_chamadas where criado_em >= now() - (dias||' days')::interval), 0),
    'total_falhas', coalesce((select count(*) from public.ia_chamadas where criado_em >= now() - (dias||' days')::interval and not sucesso), 0),
    'por_operacao', (select coalesce(json_agg(t order by t.custo_usd desc), '[]'::json) from (
        select operacao,
               count(*)                         as chamadas,
               round(avg(tokens_entrada))       as tokens_entrada_med,
               round(avg(tokens_saida))         as tokens_saida_med,
               round(sum(custo_usd),4)          as custo_usd,
               round(avg(ms))                   as ms_med,
               count(*) filter (where not sucesso) as falhas
        from public.ia_chamadas
        where criado_em >= now() - (dias||' days')::interval
        group by operacao
      ) t)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_custos_ia(int) from public;
grant execute on function public.admin_custos_ia(int) to authenticated;

-- admin_auditoria: ordena por t.criado_em / c.categoria.
create or replace function public.admin_auditoria(
  p_categoria text default null,
  p_busca     text default null,
  p_limite    int  default 200
) returns json language plpgsql stable security definer set search_path = public as $$
declare r json; lim int := least(greatest(coalesce(p_limite,200), 1), 500);
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;

  with base as (
    select
      l.id, l.acao, l.motivo, l.detalhe, l.criado_em, l.grupo_id,
      coalesce(au.email, '—')               as admin_email,
      coalesce(g.nome, null)                 as grupo_nome,
      case
        when l.acao ilike '%servico%'                                      then 'Serviços'
        when l.acao ilike '%suporte%'                                      then 'Suporte'
        when l.acao ilike '%admin%'                                        then 'Admin'
        when l.acao ilike '%cupom%'                                        then 'Cupons'
        when l.acao ilike '%trial%' or l.acao ilike '%cortesia%'
          or l.acao ilike '%assinatura%' or l.acao ilike '%cancel%'        then 'Assinatura'
        when l.acao ilike '%email%' or l.acao ilike '%reenviar%'           then 'E-mail'
        when l.acao ilike '%membro%'                                       then 'Membros'
        when l.acao ilike '%config%' or l.acao ilike '%tarifa%'            then 'Config'
        else 'Outros'
      end as categoria
    from public.admin_log l
    left join auth.users au on au.id = l.admin_id
    left join public.grupos g on g.id = l.grupo_id
  ),
  filtrada as (
    select * from base
    where (p_categoria is null or categoria = p_categoria)
      and (
        p_busca is null or btrim(p_busca) = '' or
        acao ilike '%'||p_busca||'%' or
        coalesce(admin_email,'') ilike '%'||p_busca||'%' or
        coalesce(grupo_nome,'')  ilike '%'||p_busca||'%' or
        coalesce(motivo,'')      ilike '%'||p_busca||'%'
      )
  )
  select json_build_object(
    'itens', (select coalesce(json_agg(t order by t.criado_em desc), '[]'::json)
              from (select * from filtrada order by criado_em desc limit lim) t),
    'categorias', (select coalesce(json_agg(c order by c.categoria), '[]'::json)
                   from (select categoria, count(*) as n from base group by categoria) c)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_auditoria(text,text,int) from public;
grant execute on function public.admin_auditoria(text,text,int) to authenticated;

-- admin_atencao: ordena por t.quando / t.nome.
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
    'ia_falhas_24h', coalesce((select count(*) from public.ia_chamadas where not sucesso and criado_em >= now() - interval '24 hours'), 0)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_atencao() from public;
grant execute on function public.admin_atencao() to authenticated;
