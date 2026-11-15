-- 0050 — Painel do dono (ERP), Fase 3: Métricas (funil de ativação + retenção).
-- Só leitura/admin (sou_admin()). Usa sinais que já existem (cadastro, acesso,
-- uso de IA, assinatura) — nunca os lançamentos das famílias (LGPD).

create or replace function public.admin_ativacao()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  r json;
  n_grupos int; n_acesso int; n_uso int; n_pagantes int;
  base_ret int; ativos_ret int;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;

  select count(*) into n_grupos from public.grupos;

  -- Grupos em que algum membro já entrou pelo menos uma vez.
  select count(*) into n_acesso from public.grupos g
   where exists (
     select 1 from public.usuarios u join auth.users au on au.id = u.id
     where u.grupo_id = g.id and au.last_sign_in_at is not null);

  -- Grupos que já usaram a IA (histórico de interpretações).
  select count(distinct grupo_id) into n_uso from public.interpretacoes_log where grupo_id is not null;

  -- Grupos pagantes (assinatura ativa, fora cortesia).
  select count(distinct grupo_id) into n_pagantes from public.subscriptions
   where status = 'active' and not is_cortesia;

  -- Retenção simples: dos grupos criados há mais de 30 dias, quantos tiveram
  -- acesso de algum membro nos últimos 30 dias.
  select count(*) into base_ret from public.grupos where criado_em <= now() - interval '30 days';
  select count(*) into ativos_ret from public.grupos g
   where g.criado_em <= now() - interval '30 days'
     and exists (
       select 1 from public.usuarios u join auth.users au on au.id = u.id
       where u.grupo_id = g.id and au.last_sign_in_at >= now() - interval '30 days');

  select json_build_object(
    'grupos_total', n_grupos,
    'grupos_com_acesso', n_acesso,
    'grupos_com_uso', n_uso,
    'grupos_pagantes', n_pagantes,
    'retencao_base', base_ret,
    'retencao_ativos', ativos_ret,
    'retencao_pct', case when base_ret > 0 then round(ativos_ret::numeric * 100 / base_ret) else null end
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_ativacao() from public;
grant execute on function public.admin_ativacao() to authenticated;
