-- 0094 — E-mails automáticos: aba "Resultados" do Painel (22/11/2026).
-- Só leitura: resume o email_log (com o rastreio do Resend da 0091) num período escolhido.
--   totais    → enviados, entregues, abertos, clicados, devolvidos, spam, erros
--   por_email → as mesmas contas por e-mail (nome do email_modelos quando houver)
--   remarketing → por sequência: entraram, assinaram e saíram no período
--   problemas → últimos devolvidos / marcados como spam (nome e e-mail pra corrigir)
-- Envios de teste do painel (tipo 'teste:...') ficam de fora. 'rastreados' = enviados depois que o rastreio
-- foi ligado no Resend (22/11/2026 18:30 UTC) — as taxas (entregue/abriu/clicou) são sobre eles.
-- Função nasce fechada (0064): grant só pra authenticated; dentro exige sou_admin() (aal2).
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

create or replace function public.admin_email_resultados(p_dias int default 30)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_desde timestamptz;
  v_rastreio constant timestamptz := '2026-11-22 18:30:00+00';
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  v_desde := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)));

  return json_build_object(
    'dias', greatest(1, least(coalesce(p_dias, 30), 365)),
    'rastreio_desde', v_rastreio,
    'totais', (
      select json_build_object(
        'enviados',   count(*) filter (where e.status = 'enviado'),
        'rastreados', count(*) filter (where e.status = 'enviado' and e.criado_em >= v_rastreio),
        'entregues',  count(*) filter (where e.entregue_em is not null),
        'abertos',    count(*) filter (where e.aberto_em is not null),
        'clicados',   count(*) filter (where e.clicado_em is not null),
        'devolvidos', count(*) filter (where e.problema = 'devolvido'),
        'spam',       count(*) filter (where e.problema = 'spam'),
        'erros',      count(*) filter (where e.status = 'erro'))
      from public.email_log e
      where e.criado_em >= v_desde and e.tipo not like 'teste:%'),
    'por_email', (
      select coalesce(json_agg(t order by t.enviados desc, t.nome), '[]'::json) from (
        select e.tipo as chave, coalesce(m.nome, e.tipo) as nome, m.categoria,
               count(*) filter (where e.status = 'enviado')        as enviados,
               count(*) filter (where e.status = 'enviado' and e.criado_em >= v_rastreio) as rastreados,
               count(*) filter (where e.entregue_em is not null)   as entregues,
               count(*) filter (where e.aberto_em is not null)     as abertos,
               count(*) filter (where e.clicado_em is not null)    as clicados,
               count(*) filter (where e.problema is not null)      as problemas,
               case when m.categoria = 'remarketing' then
                 count(distinct e.titular_id) filter (where exists (
                   select 1 from public.remarketing_pessoas p
                    where p.usuario_id = e.titular_id and p.assinou_em >= e.criado_em))
               end as assinaram_depois
          from public.email_log e
          left join public.email_modelos m on m.chave = e.tipo
         where e.criado_em >= v_desde and e.tipo not like 'teste:%'
         group by e.tipo, m.nome, m.categoria) t),
    'remarketing', (
      select coalesce(json_agg(json_build_object(
          'chave', q.chave, 'nome', q.nome, 'ligada', q.ligada,
          'entraram',  (select count(*) from public.remarketing_pessoas p where p.sequencia = q.chave and p.criado_em >= v_desde),
          'assinaram', (select count(*) from public.remarketing_pessoas p where p.sequencia = q.chave and p.assinou_em >= v_desde),
          'sairam',    (select count(*) from public.remarketing_pessoas p where p.sequencia = q.chave and p.status in ('saiu', 'removido') and p.status_em >= v_desde),
          'ativos',    (select count(*) from public.remarketing_pessoas p where p.sequencia = q.chave and p.status = 'ativo')
        ) order by q.chave), '[]'::json)
      from public.email_sequencias q),
    'problemas', (
      select coalesce(json_agg(t order by t.problema_em desc), '[]'::json) from (
        select e.problema, e.problema_em, coalesce(m.nome, e.tipo) as email_nome,
               u.nome, coalesce(au.email::text, e.destino) as email
          from public.email_log e
          left join public.email_modelos m on m.chave = e.tipo
          left join public.usuarios u on u.id = e.titular_id
          left join auth.users au on au.id = e.titular_id
         where e.problema is not null and e.problema_em >= v_desde and e.tipo not like 'teste:%'
         order by e.problema_em desc
         limit 30) t)
  );
end $$;
revoke all on function public.admin_email_resultados(int) from public, anon, authenticated;
grant execute on function public.admin_email_resultados(int) to authenticated;
