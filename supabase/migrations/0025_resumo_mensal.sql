-- 0025_resumo_mensal — RPC para o e-mail de resumo mensal (prompt 7, etapa 4).
-- Por grupo/titular (trial/active/cortesia, com e-mail), agrega o mês p_comp
-- ('YYYY-MM', pela coluna data): total de entradas e gastos, saldo, qtd de
-- gastos e top 3 categorias (jsonb, por valor). Só devolve grupos COM atividade
-- no mês (não manda resumo vazio). SECURITY DEFINER: lê dados de todos os grupos;
-- só a Edge Function chama (via service_role).

create or replace function public.resumo_mensal(p_comp text)
returns table (
  grupo_id uuid,
  titular_id uuid,
  email text,
  nome text,
  total_entradas numeric,
  total_gastos numeric,
  saldo numeric,
  qtd_gastos int,
  top_categorias jsonb
)
language sql
security definer
set search_path to 'public'
as $$
  with base as (
    select s.grupo_id as gid, s.titular_id, u.email, u.nome
    from subscriptions s
    join usuarios u on u.id = s.titular_id and u.email is not null
    where (s.status in ('trial', 'active') or s.is_cortesia)
  ),
  g as (
    select grupo_id as gid, sum(valor) as total, count(*)::int as qtd
    from gastos where to_char(data, 'YYYY-MM') = p_comp
    group by grupo_id
  ),
  e as (
    select grupo_id as gid, sum(valor) as total
    from entradas where to_char(data, 'YYYY-MM') = p_comp
    group by grupo_id
  ),
  cat as (
    select grupo_id as gid, coalesce(nullif(categoria, ''), 'outros') as nome, sum(valor) as total
    from gastos where to_char(data, 'YYYY-MM') = p_comp
    group by grupo_id, coalesce(nullif(categoria, ''), 'outros')
  ),
  topcat as (
    select gid,
           jsonb_agg(jsonb_build_object('nome', nome, 'total', total) order by total desc)
             filter (where rn <= 3) as itens
    from (
      select gid, nome, total, row_number() over (partition by gid order by total desc) as rn
      from cat
    ) x
    group by gid
  )
  select b.gid as grupo_id, b.titular_id, b.email, b.nome,
         coalesce(e.total, 0) as total_entradas,
         coalesce(g.total, 0) as total_gastos,
         coalesce(e.total, 0) - coalesce(g.total, 0) as saldo,
         coalesce(g.qtd, 0) as qtd_gastos,
         coalesce(topcat.itens, '[]'::jsonb) as top_categorias
  from base b
  left join g on g.gid = b.gid
  left join e on e.gid = b.gid
  left join topcat on topcat.gid = b.gid
  where coalesce(g.total, 0) <> 0 or coalesce(e.total, 0) <> 0;
$$;

revoke all on function public.resumo_mensal(text) from anon, authenticated;
