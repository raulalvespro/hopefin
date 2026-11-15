-- 0043 — Painel do dono (ERP), Etapa 2: Custos & serviços.
-- Objetivo: dar ao dono a visão de "quanto entra x quanto sai" e um lugar pra
-- cadastrar os custos fixos das ferramentas (Supabase, Cloudflare, Resend,
-- Anthropic, Asaas...). NADA aqui mexe no fluxo do app; é só leitura/admin.
-- Tudo guardado por sou_admin() no servidor (não-admin é barrado no banco).

-- ──────────────────────────────────────────────────────────────────────────
-- Tabela: serviços/custos fixos (um cartão por ferramenta), editável pelo dono.
-- Valores em centavos da própria moeda (BRL ou USD); a conversão p/ exibir em
-- R$ é feita no front com a cotação do dia.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.servicos (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null,
  plano                  text,                         -- ex.: "Free", "Pro", "Pay as you go"
  custo_mensal_centavos  int  not null default 0,      -- custo recorrente estimado no mês
  moeda                  text not null default 'BRL' check (moeda in ('BRL','USD')),
  renova_em              date,                          -- próxima renovação/cobrança (opcional)
  saldo_centavos         int,                           -- crédito pré-pago restante (opcional)
  alerta_saldo_centavos  int,                           -- avisa quando saldo <= isto (opcional)
  link                   text,                          -- painel do serviço (opcional)
  obs                    text,
  ordem                  int  not null default 0,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
alter table public.servicos enable row level security;
-- Só admin LÊ (escrita é só via RPC SECURITY DEFINER abaixo).
drop policy if exists servicos_sel on public.servicos;
create policy servicos_sel on public.servicos
  for select to authenticated using (public.sou_admin());

-- Sementes dos serviços que o Raul já citou (valores que ELE ajusta depois no painel).
-- Idempotente: só insere se a tabela estiver vazia.
insert into public.servicos (nome, plano, custo_mensal_centavos, moeda, ordem)
select * from (values
  ('Supabase',   'Free',          0,   'BRL', 1),
  ('Cloudflare', 'Workers',       0,   'BRL', 2),
  ('Resend',     'E-mails',       0,   'BRL', 3),
  ('Anthropic',  'Pay as you go', 500, 'USD', 4),  -- US$ 5 que ele colocou (ajustável)
  ('Asaas',      'Taxas por cobrança', 0, 'BRL', 5),
  ('Meta / WhatsApp', 'Futuro',   0,   'BRL', 6)
) as v(nome, plano, custo_mensal_centavos, moeda, ordem)
where not exists (select 1 from public.servicos);

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: resumo de custos do mês (receita x IA x fixos).
-- Devolve as peças em centavos; o front soma os fixos em USD usando a cotação
-- do dia e calcula o resultado. IA reaproveita a mesma conta de admin_consumo_mes.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_custos_mes()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  cfg public.admin_config%rowtype;
  ini date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  total_ia int;
  billable int;
  r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select * into cfg from public.admin_config where id = 1;
  select coalesce(sum(quantidade), 0) into total_ia from public.consumo_ia where data >= ini;
  billable := greatest(0, total_ia - cfg.ia_gratis_mes);
  select json_build_object(
    -- receita bruta recorrente (MRR), mesma conta do admin_metricas
    'mrr_centavos', coalesce((
      select sum(case when ciclo = 'anual' then round(preco_centavos/12.0) else preco_centavos end)
      from public.subscriptions where status = 'active' and not is_cortesia), 0),
    'assinantes_ativos', (select count(*) from public.subscriptions where status = 'active' and not is_cortesia),
    -- custo de IA do mês (estimativa: respostas acima do grátis x custo por resposta)
    'ia_usos_mes',       total_ia,
    'ia_gratis_mes',     cfg.ia_gratis_mes,
    'ia_billable',       billable,
    'ia_custo_centavos', round(billable * cfg.custo_resposta_centavos),
    -- custos fixos cadastrados, separados por moeda (front converte USD->BRL)
    'fixos_brl_centavos', coalesce((select sum(custo_mensal_centavos) from public.servicos where moeda = 'BRL'), 0),
    'fixos_usd_centavos', coalesce((select sum(custo_mensal_centavos) from public.servicos where moeda = 'USD'), 0),
    -- serviços com saldo abaixo do alerta (pra destacar)
    'alertas_saldo', (select coalesce(json_agg(t), '[]'::json) from (
        select nome, saldo_centavos, alerta_saldo_centavos, moeda
        from public.servicos
        where saldo_centavos is not null and alerta_saldo_centavos is not null
          and saldo_centavos <= alerta_saldo_centavos
        order by nome) t),
    -- próximas renovações (30 dias)
    'renova_30d', (select coalesce(json_agg(t), '[]'::json) from (
        select nome, renova_em, custo_mensal_centavos, moeda
        from public.servicos
        where renova_em is not null and renova_em between current_date and current_date + 30
        order by renova_em) t)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_custos_mes() from public;
grant execute on function public.admin_custos_mes() to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: listar serviços (ordenados).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_servicos()
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select coalesce(json_agg(t), '[]'::json) into r from (
    select id, nome, plano, custo_mensal_centavos, moeda, renova_em,
           saldo_centavos, alerta_saldo_centavos, link, obs, ordem
    from public.servicos
    order by ordem, nome
  ) t;
  return r;
end; $$;
revoke all on function public.admin_servicos() from public;
grant execute on function public.admin_servicos() to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: salvar serviço (cria se p_id nulo, senão atualiza). Auditado.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_salvar_servico(
  p_id                    uuid    default null,
  p_nome                  text    default null,
  p_plano                 text    default null,
  p_custo_mensal_centavos int     default 0,
  p_moeda                 text    default 'BRL',
  p_renova_em             date    default null,
  p_saldo_centavos        int     default null,
  p_alerta_saldo_centavos int     default null,
  p_link                  text    default null,
  p_obs                   text    default null,
  p_ordem                 int     default 0
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_nome), '') = '' then raise exception 'nome_obrigatorio' using errcode = 'P0001'; end if;
  if p_moeda not in ('BRL','USD') then raise exception 'moeda_invalida' using errcode = 'P0001'; end if;

  if p_id is null then
    insert into public.servicos
      (nome, plano, custo_mensal_centavos, moeda, renova_em, saldo_centavos, alerta_saldo_centavos, link, obs, ordem)
    values
      (btrim(p_nome), p_plano, coalesce(p_custo_mensal_centavos,0), p_moeda, p_renova_em,
       p_saldo_centavos, p_alerta_saldo_centavos, p_link, p_obs, coalesce(p_ordem,0))
    returning id into v_id;
  else
    update public.servicos set
      nome = btrim(p_nome), plano = p_plano,
      custo_mensal_centavos = coalesce(p_custo_mensal_centavos,0), moeda = p_moeda,
      renova_em = p_renova_em, saldo_centavos = p_saldo_centavos,
      alerta_saldo_centavos = p_alerta_saldo_centavos, link = p_link, obs = p_obs,
      ordem = coalesce(p_ordem,0), atualizado_em = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'servico_nao_encontrado' using errcode = 'P0001'; end if;
  end if;

  insert into public.admin_log (admin_id, acao, detalhe)
  values (auth.uid(), 'salvar_servico', json_build_object('id', v_id, 'nome', btrim(p_nome))::jsonb);
  return v_id;
end; $$;
revoke all on function public.admin_salvar_servico(uuid,text,text,int,text,date,int,int,text,text,int) from public;
grant execute on function public.admin_salvar_servico(uuid,text,text,int,text,date,int,int,text,text,int) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: remover serviço. Auditado.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_remover_servico(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select nome into v_nome from public.servicos where id = p_id;
  if v_nome is null then raise exception 'servico_nao_encontrado' using errcode = 'P0001'; end if;
  delete from public.servicos where id = p_id;
  insert into public.admin_log (admin_id, acao, detalhe)
  values (auth.uid(), 'remover_servico', json_build_object('id', p_id, 'nome', v_nome)::jsonb);
end; $$;
revoke all on function public.admin_remover_servico(uuid) from public;
grant execute on function public.admin_remover_servico(uuid) to authenticated;
