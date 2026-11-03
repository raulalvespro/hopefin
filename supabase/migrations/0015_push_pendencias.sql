-- 15: RPC do digest diário de push. Para cada grupo que tem dispositivo inscrito
-- e não desligou "alertar_vencimentos", resume as contas a pagar (vencidas +
-- vencendo hoje/amanhã) ainda não pagas, somando contas fixas, parcelas (fora de
-- cartão) e assinaturas (fora de cartão). Conservador: na dúvida, não notifica.
-- Chamada só pela Edge Function (service role); sem grant a authenticated/anon.
create or replace function public.push_pendencias()
returns table(grupo_id uuid, titulo text, corpo text)
language sql
security definer
set search_path = public
as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  params as (
    select distinct ps.grupo_id as gid,
           (select d from hoje) as hoje,
           date_trunc('month', (select d from hoje))::date as ini_mes,
           (date_trunc('month', (select d from hoje)) + interval '1 month - 1 day')::date as fim_mes,
           ((select d from hoje) + 1) as amanha,
           to_char((select d from hoje), 'YYYY-MM') as comp
    from push_subscriptions ps
    join grupos g on g.id = ps.grupo_id
    left join preferencias_notificacao pn on pn.grupo_id = ps.grupo_id
    where ps.grupo_id is not null
      and coalesce(pn.alertar_vencimentos, true) = true
  ),
  fixas as (
    select pa.gid,
           make_date(extract(year from pa.hoje)::int, extract(month from pa.hoje)::int,
                     least(cf.dia_vencimento, extract(day from pa.fim_mes)::int)) as venc,
           cf.valor
    from params pa
    join contas_fixas cf on cf.grupo_id = pa.gid and cf.ativo and cf.dia_vencimento is not null
    where not exists (
      select 1 from fixas_lancamentos fl
      where fl.conta_fixa_id = cf.id and fl.competencia = pa.comp and fl.pago
    )
  ),
  parcelas_i as (
    select pa.gid, pr.data_vencimento as venc, pr.valor
    from params pa
    join parcelas pr on pr.grupo_id = pa.gid and pr.paga = false
      and pr.data_vencimento >= pa.ini_mes and pr.data_vencimento <= pa.amanha
    join parcelamentos pc on pc.id = pr.parcelamento_id
    where pc.cartao_id is null
  ),
  assin as (
    select pa.gid,
           make_date(extract(year from pa.hoje)::int, extract(month from pa.hoje)::int,
                     least(a.dia_cobranca, extract(day from pa.fim_mes)::int)) as venc,
           a.valor
    from params pa
    join assinaturas a on a.grupo_id = pa.gid and a.ativo and a.cartao_id is null and a.dia_cobranca is not null
    where not exists (
      select 1 from contas_pagas cp
      where cp.tipo = 'assinatura' and cp.referencia_id = a.id and cp.competencia = pa.comp and cp.pago
    )
  ),
  todos as (
    select gid, venc, valor from fixas
    union all select gid, venc, valor from parcelas_i
    union all select gid, venc, valor from assin
  ),
  due as (
    select t.gid, t.valor, t.venc
    from todos t join params pa on pa.gid = t.gid
    where t.venc <= pa.amanha                -- vencidas + hoje + amanhã
      and t.venc >= pa.ini_mes               -- restringe ao mês corrente
  ),
  agg as (
    select gid, count(*)::int as n, sum(valor) as total,
           sum((venc < (select d from hoje))::int) as atrasadas
    from due group by gid
  )
  select gid as grupo_id,
         'HopeFin · contas a pagar' as titulo,
         (case when n = 1 then 'Você tem 1 conta a pagar'
               else 'Você tem ' || n || ' contas a pagar' end)
         || ' (R$ ' || replace(to_char(total, 'FM999999990.00'), '.', ',') || ')'
         || (case when atrasadas > 0 then ' · ' || atrasadas || ' em atraso' else '' end)
         || '. Toque para ver.' as corpo
  from agg
  where total > 0;
$$;

revoke all on function public.push_pendencias() from public, anon, authenticated;
