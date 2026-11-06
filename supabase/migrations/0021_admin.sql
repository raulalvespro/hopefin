-- ============================================================
-- 0021 — Painel do dono (/admin) — prompt 8
-- ------------------------------------------------------------
-- Infra do painel administrativo: papel de admin no banco, config do WhatsApp
-- (pausa + teto de custo), log de auditoria, log de webhooks, e RPCs que só o
-- admin executa. TODAS as RPCs são SECURITY DEFINER e começam checando
-- sou_admin(). O admin vê MÉTRICAS e METADADOS de grupos (status, plano, nº de
-- membros) — NUNCA os lançamentos (gastos/entradas) das famílias (LGPD).
-- DDL só via scripts/db.mjs. Idempotente.
-- ============================================================

-- 1) Papel de admin -----------------------------------------------------------
alter table public.usuarios add column if not exists is_admin boolean not null default false;
-- Conta do dono (quando ele criar a conta com este e-mail, já vira admin).
update public.usuarios set is_admin = true where lower(email) = 'raullerickson@gmail.com';

create or replace function public.sou_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.usuarios where id = auth.uid()), false);
$$;
revoke all on function public.sou_admin() from public;
grant execute on function public.sou_admin() to authenticated;

-- 2) Config do admin (linha única) -------------------------------------------
create table if not exists public.admin_config (
  id                       int primary key default 1 check (id = 1),
  whatsapp_pausado         boolean not null default false,
  whatsapp_teto_centavos   int not null default 30000,   -- R$ 300,00
  ia_gratis_mes            int not null default 1000,     -- 1.000 respostas/mês grátis
  custo_resposta_centavos  numeric(8,4) not null default 3.5, -- R$ 0,035 por resposta
  atualizado_em            timestamptz not null default now()
);
insert into public.admin_config (id) values (1) on conflict (id) do nothing;
alter table public.admin_config enable row level security;
drop policy if exists admin_config_sel on public.admin_config;
create policy admin_config_sel on public.admin_config
  for select to authenticated using (public.sou_admin());

-- 3) Log de auditoria de ações do admin --------------------------------------
create table if not exists public.admin_log (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references public.usuarios(id) on delete set null,
  acao       text not null,
  grupo_id   uuid references public.grupos(id) on delete set null,
  motivo     text,
  detalhe    jsonb,
  criado_em  timestamptz not null default now()
);
alter table public.admin_log enable row level security;
drop policy if exists admin_log_sel on public.admin_log;
create policy admin_log_sel on public.admin_log
  for select to authenticated using (public.sou_admin());
create index if not exists idx_admin_log_em on public.admin_log(criado_em desc);

-- 4) Log de webhooks (o asaas-webhook grava aqui via service_role) ------------
create table if not exists public.webhook_log (
  id          uuid primary key default gen_random_uuid(),
  origem      text not null default 'asaas',
  evento      text,
  status      text,
  payment_id  text,
  payload     jsonb,
  erro        text,
  recebido_em timestamptz not null default now()
);
alter table public.webhook_log enable row level security;
drop policy if exists webhook_log_sel on public.webhook_log;
create policy webhook_log_sel on public.webhook_log
  for select to authenticated using (public.sou_admin());
create index if not exists idx_webhook_log_em on public.webhook_log(recebido_em desc);

-- ============================================================
-- RPCs do admin (todas: só admin; nunca leem lançamentos)
-- ============================================================

-- Métricas gerais (cards do topo).
create or replace function public.admin_metricas()
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select json_build_object(
    'mrr_centavos', coalesce((
      select sum(case when ciclo = 'anual' then round(preco_centavos/12.0) else preco_centavos end)
      from public.subscriptions where status = 'active' and not is_cortesia), 0),
    'assinantes_ativos', (select count(*) from public.subscriptions where status = 'active' and not is_cortesia),
    'cortesias',         (select count(*) from public.subscriptions where is_cortesia),
    'em_lancamento',     (select count(*) from public.subscriptions where is_lancamento),
    'em_trial',          (select count(*) from public.subscriptions where status = 'trial' and coalesce(trial_ends_at, now()) >= now()),
    'trials_vencendo_7d',(select count(*) from public.subscriptions where status = 'trial' and trial_ends_at between now() and now() + interval '7 days'),
    'trials_vencidos',   (select count(*) from public.subscriptions where status = 'trial' and trial_ends_at < now()),
    'past_due',          (select count(*) from public.subscriptions where status = 'past_due'),
    'cancelados',        (select count(*) from public.subscriptions where status = 'canceled'),
    'total_grupos',      (select count(*) from public.grupos),
    'total_usuarios',    (select count(*) from public.usuarios)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_metricas() from public;
grant execute on function public.admin_metricas() to authenticated;

-- Consumo de IA/WhatsApp no mês + custo + top consumidores + taxa de acerto.
create or replace function public.admin_consumo_mes()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  cfg public.admin_config%rowtype;
  ini date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  total_mes int;
  billable int;
  r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select * into cfg from public.admin_config where id = 1;
  select coalesce(sum(quantidade), 0) into total_mes from public.consumo_ia where data >= ini;
  billable := greatest(0, total_mes - cfg.ia_gratis_mes);
  select json_build_object(
    'usos_mes', total_mes,
    'por_origem', (select coalesce(json_object_agg(origem, q), '{}'::json) from (
        select origem, sum(quantidade) q from public.consumo_ia where data >= ini group by origem) x),
    'gratis_mes', cfg.ia_gratis_mes,
    'billable', billable,
    'custo_centavos', round(billable * cfg.custo_resposta_centavos),
    'whatsapp_pausado', cfg.whatsapp_pausado,
    'whatsapp_teto_centavos', cfg.whatsapp_teto_centavos,
    'top_consumidores', (select coalesce(json_agg(t), '[]'::json) from (
        select g.nome, sum(c.quantidade) usos
        from public.consumo_ia c join public.grupos g on g.id = c.grupo_id
        where c.data >= ini group by g.nome order by usos desc limit 5) t),
    'voz', (select json_build_object(
        'total', count(*),
        'corrigidos', count(*) filter (where corrigido),
        'acerto_pct', case when count(*) = 0 then null
          else round(100.0 * count(*) filter (where not corrigido) / count(*)) end)
      from public.interpretacoes_log where salvo and criado_em >= ini)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_consumo_mes() from public;
grant execute on function public.admin_consumo_mes() to authenticated;

-- Lista de grupos com metadados de assinatura (SEM lançamentos).
create or replace function public.admin_grupos(p_busca text default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select coalesce(json_agg(t), '[]'::json) into r from (
    select g.id, g.nome, g.codigo, g.criado_em,
           (select count(*) from public.usuarios u where u.grupo_id = g.id) as membros,
           s.status, s.ciclo, s.is_cortesia, s.is_lancamento,
           s.trial_ends_at, s.current_period_end, s.preco_centavos
    from public.grupos g
    left join public.subscriptions s on s.grupo_id = g.id
    where p_busca is null or g.nome ilike '%' || p_busca || '%'
    order by g.criado_em desc
    limit 200
  ) t;
  return r;
end; $$;
revoke all on function public.admin_grupos(text) from public;
grant execute on function public.admin_grupos(text) to authenticated;

-- Ação: estender trial do grupo (com motivo + auditoria).
create or replace function public.admin_estender_trial(p_grupo_id uuid, p_dias int, p_motivo text)
returns json language plpgsql security definer set search_path = public as $$
declare nova timestamptz;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  if p_dias is null or p_dias <= 0 or p_dias > 365 then raise exception 'dias_invalido'; end if;
  update public.subscriptions
     set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + (p_dias || ' days')::interval,
         status = case when status in ('expired', 'past_due') then 'trial' else status end,
         atualizado_em = now()
   where grupo_id = p_grupo_id
   returning trial_ends_at into nova;
  if nova is null then raise exception 'grupo_sem_assinatura'; end if;
  insert into public.admin_log (admin_id, acao, grupo_id, motivo, detalhe)
    values (auth.uid(), 'estender_trial', p_grupo_id, p_motivo, json_build_object('dias', p_dias, 'novo_fim', nova));
  return json_build_object('ok', true, 'trial_ends_at', nova);
end; $$;
revoke all on function public.admin_estender_trial(uuid, int, text) from public;
grant execute on function public.admin_estender_trial(uuid, int, text) to authenticated;

-- Ação: marcar/desmarcar grupo como cortesia (com motivo + auditoria).
create or replace function public.admin_marcar_cortesia(p_grupo_id uuid, p_ativar boolean, p_motivo text)
returns json language plpgsql security definer set search_path = public as $$
declare afetou int;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  update public.subscriptions
     set is_cortesia = p_ativar,
         status = case when p_ativar then 'active' else status end,
         atualizado_em = now()
   where grupo_id = p_grupo_id;
  get diagnostics afetou = row_count;
  if afetou = 0 then raise exception 'grupo_sem_assinatura'; end if;
  insert into public.admin_log (admin_id, acao, grupo_id, motivo, detalhe)
    values (auth.uid(), case when p_ativar then 'marcar_cortesia' else 'remover_cortesia' end,
            p_grupo_id, p_motivo, json_build_object('ativar', p_ativar));
  return json_build_object('ok', true);
end; $$;
revoke all on function public.admin_marcar_cortesia(uuid, boolean, text) from public;
grant execute on function public.admin_marcar_cortesia(uuid, boolean, text) to authenticated;

-- Cupons: listar.
create or replace function public.admin_cupons()
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select coalesce(json_agg(c order by c.criado_em desc), '[]'::json) into r from public.cupons c;
  return r;
end; $$;
revoke all on function public.admin_cupons() from public;
grant execute on function public.admin_cupons() to authenticated;

-- Cupons: criar/atualizar (upsert por código).
create or replace function public.admin_salvar_cupom(
  p_codigo text, p_max_usos int default 50, p_resgate_ate date default null,
  p_whatsapp_limite_mes int default 100, p_ativo boolean default true)
returns json language plpgsql security definer set search_path = public as $$
declare cod text := upper(trim(p_codigo));
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  if coalesce(cod, '') = '' then raise exception 'codigo_vazio'; end if;
  insert into public.cupons (codigo, tipo, max_usos, resgate_ate, whatsapp_limite_mes, ativo)
    values (cod, 'cortesia', p_max_usos, p_resgate_ate, p_whatsapp_limite_mes, p_ativo)
  on conflict (codigo) do update set
    max_usos = excluded.max_usos, resgate_ate = excluded.resgate_ate,
    whatsapp_limite_mes = excluded.whatsapp_limite_mes, ativo = excluded.ativo;
  insert into public.admin_log (admin_id, acao, motivo, detalhe)
    values (auth.uid(), 'salvar_cupom', null, json_build_object('codigo', cod, 'ativo', p_ativo));
  return json_build_object('ok', true, 'codigo', cod);
end; $$;
revoke all on function public.admin_salvar_cupom(text, int, date, int, boolean) from public;
grant execute on function public.admin_salvar_cupom(text, int, date, int, boolean) to authenticated;

-- WhatsApp: pausar/retomar e ajustar teto de custo.
create or replace function public.admin_set_whatsapp(p_pausado boolean, p_teto_centavos int)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  update public.admin_config
     set whatsapp_pausado = coalesce(p_pausado, whatsapp_pausado),
         whatsapp_teto_centavos = coalesce(p_teto_centavos, whatsapp_teto_centavos),
         atualizado_em = now()
   where id = 1;
  insert into public.admin_log (admin_id, acao, detalhe)
    values (auth.uid(), 'config_whatsapp', json_build_object('pausado', p_pausado, 'teto_centavos', p_teto_centavos));
  return json_build_object('ok', true);
end; $$;
revoke all on function public.admin_set_whatsapp(boolean, int) from public;
grant execute on function public.admin_set_whatsapp(boolean, int) to authenticated;

-- Webhooks recentes (saúde técnica do billing).
create or replace function public.admin_webhooks()
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select coalesce(json_agg(t), '[]'::json) into r from (
    select id, origem, evento, status, payment_id, erro, recebido_em
    from public.webhook_log order by recebido_em desc limit 50) t;
  return r;
end; $$;
revoke all on function public.admin_webhooks() from public;
grant execute on function public.admin_webhooks() to authenticated;
