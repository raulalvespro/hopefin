-- 0024_vencimentos_a_vencer — RPC para o e-mail de lembrete de vencimento
-- (prompt 7, etapa 3). Espelha a lógica da push_pendencias, mas:
--   • é por GRUPO/TITULAR (não presa a quem tem push);
--   • só grupos que podem usar o app (trial/active/cortesia) e que não
--     desligaram o alerta de vencimentos;
--   • devolve a LISTA de itens (jsonb) + total, para montar o e-mail.
-- Janela: itens que vencem de hoje até hoje + p_dias (default 1 = hoje e amanhã),
-- no fuso America/Sao_Paulo. Fontes: contas fixas não pagas no mês, parcelas sem
-- cartão e assinaturas ativas sem cartão (as de cartão entram na fatura).
-- SECURITY DEFINER: lê dados de todos os grupos; só a Edge Function chama (via
-- service_role), nunca exposta ao usuário.

create or replace function public.vencimentos_a_vencer(p_dias int default 1)
returns table (
  grupo_id uuid,
  titular_id uuid,
  email text,
  nome text,
  itens jsonb,
  qtd int,
  total numeric
)
language sql
security definer
set search_path to 'public'
as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  base as (
    select s.grupo_id as gid, s.titular_id, u.email, u.nome,
           (select d from hoje) as hoje,
           ((select d from hoje) + p_dias) as ate,
           date_trunc('month', (select d from hoje))::date as ini_mes,
           (date_trunc('month', (select d from hoje)) + interval '1 month - 1 day')::date as fim_mes,
           to_char((select d from hoje), 'YYYY-MM') as comp
    from subscriptions s
    join usuarios u on u.id = s.titular_id and u.email is not null
    left join preferencias_notificacao pn on pn.grupo_id = s.grupo_id
    where (s.status in ('trial', 'active') or s.is_cortesia)
      and coalesce(pn.alertar_vencimentos, true) = true
  ),
  fixas as (
    select b.gid, cf.nome, cf.valor, 'conta_fixa' as tipo,
           make_date(extract(year from b.hoje)::int, extract(month from b.hoje)::int,
                     least(cf.dia_vencimento, extract(day from b.fim_mes)::int)) as venc
    from base b
    join contas_fixas cf on cf.grupo_id = b.gid and cf.ativo and cf.dia_vencimento is not null
    where not exists (
      select 1 from fixas_lancamentos fl
      where fl.conta_fixa_id = cf.id and fl.competencia = b.comp and fl.pago
    )
  ),
  parcelas_i as (
    select b.gid, coalesce(nullif(pc.descricao, ''), 'Parcela') as nome, pr.valor, 'parcela' as tipo,
           pr.data_vencimento as venc
    from base b
    join parcelas pr on pr.grupo_id = b.gid and pr.paga = false
    join parcelamentos pc on pc.id = pr.parcelamento_id
    where pc.cartao_id is null
  ),
  assin as (
    select b.gid, a.nome, a.valor, 'assinatura' as tipo,
           make_date(extract(year from b.hoje)::int, extract(month from b.hoje)::int,
                     least(a.dia_cobranca, extract(day from b.fim_mes)::int)) as venc
    from base b
    join assinaturas a on a.grupo_id = b.gid and a.ativo and a.cartao_id is null and a.dia_cobranca is not null
  ),
  itens as (
    select gid, nome, valor, tipo, venc from fixas
    union all select gid, nome, valor, tipo, venc from parcelas_i
    union all select gid, nome, valor, tipo, venc from assin
  ),
  filt as (
    select i.gid, i.nome, i.valor, i.tipo, i.venc
    from itens i join base b on b.gid = i.gid
    where i.venc >= b.hoje and i.venc <= b.ate
  )
  select b.gid as grupo_id, b.titular_id, b.email, b.nome,
         jsonb_agg(jsonb_build_object('nome', f.nome, 'valor', f.valor, 'venc', f.venc, 'tipo', f.tipo)
                   order by f.venc, f.nome) as itens,
         count(*)::int as qtd,
         sum(f.valor) as total
  from base b
  join filt f on f.gid = b.gid
  group by b.gid, b.titular_id, b.email, b.nome;
$$;

revoke all on function public.vencimentos_a_vencer(int) from anon, authenticated;
