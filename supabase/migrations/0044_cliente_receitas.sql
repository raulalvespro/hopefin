-- 0044 — Painel do dono (ERP), Etapa 3: Clientes & receitas.
-- Ficha do cliente (metadados + uso + linha do tempo + notas do dono) e métricas
-- de receita (ARPA, churn, conversão, LTV estimado).
-- LGPD: NUNCA expõe os lançamentos das famílias (gastos/entradas) — só metadados.
-- Tudo guardado por sou_admin() no servidor.

-- ──────────────────────────────────────────────────────────────────────────
-- Notas privadas do dono por cliente (grupo). Não é dado da família; é anotação
-- interna (ex.: "ligou pedindo nota fiscal", "parceria igreja X").
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.admin_cliente_notas (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references public.grupos(id) on delete cascade,
  admin_id   uuid references public.usuarios(id) on delete set null,
  texto      text not null,
  criado_em  timestamptz not null default now()
);
create index if not exists idx_admin_cliente_notas_grupo on public.admin_cliente_notas(grupo_id, criado_em desc);
alter table public.admin_cliente_notas enable row level security;
drop policy if exists admin_cliente_notas_sel on public.admin_cliente_notas;
create policy admin_cliente_notas_sel on public.admin_cliente_notas
  for select to authenticated using (public.sou_admin());

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: ficha completa de um cliente (grupo). Metadados, assinatura, membros,
-- uso de IA, marcos, linha do tempo (admin_log) e notas. SEM lançamentos.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_cliente(p_grupo_id uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  g public.grupos%rowtype;
  s public.subscriptions%rowtype;
  ini date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select * into g from public.grupos where id = p_grupo_id;
  if g.id is null then raise exception 'grupo_nao_encontrado' using errcode = 'P0001'; end if;
  select * into s from public.subscriptions where grupo_id = p_grupo_id;

  select json_build_object(
    'grupo', json_build_object('id', g.id, 'nome', g.nome, 'codigo', g.codigo,
      'criado_em', g.criado_em, 'criado_por', g.criado_por),
    'assinatura', case when s.id is null then null else json_build_object(
      'status', s.status, 'plano', s.plano, 'ciclo', s.ciclo, 'preco_centavos', s.preco_centavos,
      'is_cortesia', s.is_cortesia, 'is_lancamento', s.is_lancamento, 'cupom_codigo', s.cupom_codigo,
      'metodo_pagamento', s.metodo_pagamento, 'parcelas', s.parcelas,
      'trial_started_at', s.trial_started_at, 'trial_ends_at', s.trial_ends_at,
      'current_period_start', s.current_period_start, 'current_period_end', s.current_period_end,
      'primeira_cobranca_em', s.primeira_cobranca_em, 'canceled_at', s.canceled_at,
      'cancel_at_period_end', s.cancel_at_period_end,
      'tem_asaas', (s.asaas_customer_id is not null)) end,
    'membros', (select coalesce(json_agg(m order by m.is_dono desc, m.nome), '[]'::json) from (
        select u.id, u.nome, u.email, (u.id = g.criado_por) as is_dono,
               au.last_sign_in_at as ultimo_acesso, (au.email_confirmed_at is not null) as email_confirmado
        from public.usuarios u
        left join auth.users au on au.id = u.id
        where u.grupo_id = p_grupo_id) m),
    'uso', json_build_object(
      'total', (select coalesce(sum(quantidade),0) from public.consumo_ia where grupo_id = p_grupo_id),
      'mes',   (select coalesce(sum(quantidade),0) from public.consumo_ia where grupo_id = p_grupo_id and data >= ini),
      'por_origem', (select coalesce(json_object_agg(origem, q), '{}'::json) from (
          select origem, sum(quantidade) q from public.consumo_ia where grupo_id = p_grupo_id group by origem) x),
      'voz_lanc', (select count(*) from public.interpretacoes_log
          where grupo_id = p_grupo_id and salvo)),
    'timeline', (select coalesce(json_agg(t), '[]'::json) from (
        select acao, motivo, detalhe, criado_em
        from public.admin_log where grupo_id = p_grupo_id
        order by criado_em desc limit 50) t),
    'notas', (select coalesce(json_agg(n), '[]'::json) from (
        select an.id, an.texto, an.criado_em, u.nome as admin_nome
        from public.admin_cliente_notas an
        left join public.usuarios u on u.id = an.admin_id
        where an.grupo_id = p_grupo_id order by an.criado_em desc) n)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_cliente(uuid) from public;
grant execute on function public.admin_cliente(uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: salvar nota de cliente. Auditado.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_salvar_nota(p_grupo_id uuid, p_texto text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_texto), '') = '' then raise exception 'texto_obrigatorio' using errcode = 'P0001'; end if;
  insert into public.admin_cliente_notas (grupo_id, admin_id, texto)
  values (p_grupo_id, auth.uid(), btrim(p_texto)) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.admin_salvar_nota(uuid, text) from public;
grant execute on function public.admin_salvar_nota(uuid, text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: remover nota.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_remover_nota(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  delete from public.admin_cliente_notas where id = p_id;
end; $$;
revoke all on function public.admin_remover_nota(uuid) from public;
grant execute on function public.admin_remover_nota(uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: métricas de receita (ARPA, churn, conversão, LTV estimado).
-- Janela de 30 dias para os fluxos. LTV = ARPA / churn mensal (se churn > 0).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_receitas()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  ativos int;
  mrr int;
  arpa int;
  cancel_30 int;
  churn numeric;
  ltv int;
  r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select count(*) into ativos from public.subscriptions where status = 'active' and not is_cortesia;
  select coalesce(sum(case when ciclo = 'anual' then round(preco_centavos/12.0) else preco_centavos end), 0)
    into mrr from public.subscriptions where status = 'active' and not is_cortesia;
  arpa := case when ativos > 0 then round(mrr::numeric / ativos) else 0 end;
  select count(*) into cancel_30 from public.subscriptions
    where canceled_at is not null and canceled_at >= now() - interval '30 days';
  -- churn mensal aproximado: cancelados nos 30d / (ativos agora + cancelados nos 30d)
  churn := case when (ativos + cancel_30) > 0 then cancel_30::numeric / (ativos + cancel_30) else 0 end;
  ltv := case when churn > 0 then round(arpa / churn) else null end;

  select json_build_object(
    'assinantes_ativos', ativos,
    'mrr_centavos', mrr,
    'arpa_centavos', arpa,
    'arr_centavos', mrr * 12,
    'cortesias', (select count(*) from public.subscriptions where is_cortesia),
    'trials_ativos', (select count(*) from public.subscriptions
        where status = 'trial' and coalesce(trial_ends_at, now()) >= now()),
    'novos_trials_30d', (select count(*) from public.subscriptions
        where coalesce(trial_started_at, criado_em) >= now() - interval '30 days'),
    'convertidos_30d', (select count(*) from public.subscriptions
        where primeira_cobranca_em is not null and primeira_cobranca_em >= now() - interval '30 days'),
    'cancelados_30d', cancel_30,
    'cancelados_total', (select count(*) from public.subscriptions where status = 'canceled'),
    'churn_pct', round(churn * 100, 1),
    'ltv_centavos', ltv
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_receitas() from public;
grant execute on function public.admin_receitas() to authenticated;
