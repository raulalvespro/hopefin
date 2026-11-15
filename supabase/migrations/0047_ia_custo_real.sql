-- 0047 — Painel do dono (ERP), Fase 0: custo REAL de IA (não estimativa).
-- Objetivo do Raul: ver EXATAMENTE quanto cada coisa gasta. Aqui gravamos CADA
-- chamada de IA (operação, modelo, tokens de entrada/saída, custo US$, tempo,
-- sucesso/falha) e expomos ao painel agregado por operação e por cliente.
-- A transcrição de voz é do navegador (webkitSpeechRecognition), de graça — só a
-- interpretação (Anthropic) custa, então é ela que instrumentamos.
-- Tudo de leitura é guardado por sou_admin(); a gravação é via RPC chamada pela
-- Edge Function com o JWT do usuário (grava só no grupo dele).

-- ──────────────────────────────────────────────────────────────────────────
-- Tarifa por modelo (US$ por 1 milhão de tokens). Editável pelo dono depois.
-- Semente: Claude Haiku 5.5 = US$0,10 entrada / US$0,50 saída (prompts até 100k;
-- é o modelo que a interpretar-lancamento usa). Valores em micro-dólar por milhão
-- não — guardamos em dólar mesmo (numeric), que é o natural da fatura.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.ia_tarifas (
  modelo               text primary key,
  entrada_usd_milhao   numeric(10,4) not null default 0,  -- US$ por 1M tokens de entrada
  saida_usd_milhao     numeric(10,4) not null default 0,  -- US$ por 1M tokens de saída
  atualizado_em        timestamptz not null default now()
);
alter table public.ia_tarifas enable row level security;
drop policy if exists ia_tarifas_sel on public.ia_tarifas;
create policy ia_tarifas_sel on public.ia_tarifas for select to authenticated using (public.sou_admin());

insert into public.ia_tarifas (modelo, entrada_usd_milhao, saida_usd_milhao)
values ('claude-haiku-5-5', 0.10, 0.50)
on conflict (modelo) do nothing;

-- ──────────────────────────────────────────────────────────────────────────
-- Uma linha por chamada de IA. custo_usd é calculado no insert pela tarifa.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.ia_chamadas (
  id               uuid primary key default gen_random_uuid(),
  grupo_id         uuid,
  usuario_id       uuid,
  operacao         text not null,                 -- ex.: 'interpretar_lancamento'
  modelo           text,
  tokens_entrada   int  not null default 0,
  tokens_saida     int  not null default 0,
  custo_usd        numeric(12,6) not null default 0,
  ms               int,                            -- tempo de resposta
  sucesso          boolean not null default true,
  erro             text,
  criado_em        timestamptz not null default now()
);
alter table public.ia_chamadas enable row level security;
-- Só admin LÊ (não há política de insert: escrita é só via RPC SECURITY DEFINER).
drop policy if exists ia_chamadas_sel on public.ia_chamadas;
create policy ia_chamadas_sel on public.ia_chamadas for select to authenticated using (public.sou_admin());
create index if not exists ia_chamadas_criado_idx on public.ia_chamadas (criado_em);
create index if not exists ia_chamadas_grupo_idx  on public.ia_chamadas (grupo_id);

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: registrar uma chamada de IA. Chamada pela Edge Function com o JWT do
-- usuário (deriva o grupo dele por auth.uid()). SECURITY DEFINER só pra furar a
-- RLS de insert; nunca confia em grupo vindo do cliente.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.registrar_ia_chamada(
  p_operacao       text,
  p_modelo         text    default null,
  p_tokens_entrada int     default 0,
  p_tokens_saida   int     default 0,
  p_ms             int     default null,
  p_sucesso        boolean default true,
  p_erro           text    default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_grupo uuid;
  v_tar public.ia_tarifas%rowtype;
  v_custo numeric(12,6) := 0;
  v_id uuid;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = 'P0001'; end if;
  select grupo_id into v_grupo from public.usuarios where id = v_uid;
  select * into v_tar from public.ia_tarifas where modelo = p_modelo;
  if found then
    v_custo := coalesce(p_tokens_entrada,0)/1000000.0 * v_tar.entrada_usd_milhao
             + coalesce(p_tokens_saida,0)/1000000.0 * v_tar.saida_usd_milhao;
  end if;
  insert into public.ia_chamadas
    (grupo_id, usuario_id, operacao, modelo, tokens_entrada, tokens_saida, custo_usd, ms, sucesso, erro)
  values
    (v_grupo, v_uid, p_operacao, p_modelo, coalesce(p_tokens_entrada,0), coalesce(p_tokens_saida,0),
     v_custo, p_ms, coalesce(p_sucesso,true), p_erro)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.registrar_ia_chamada(text,text,int,int,int,boolean,text) from public;
grant execute on function public.registrar_ia_chamada(text,text,int,int,int,boolean,text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: custo de IA agregado por operação (para a tela de Custos). Guardado.
-- ──────────────────────────────────────────────────────────────────────────
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
    'por_operacao', (select coalesce(json_agg(t order by (t->>'custo_usd')::numeric desc), '[]'::json) from (
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

-- ──────────────────────────────────────────────────────────────────────────
-- admin_custos_mes: acrescenta o custo REAL de IA do mês (sem tirar a estimativa,
-- pra dar pra comparar enquanto o histórico real ainda é curto).
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
    'mrr_centavos', coalesce((
      select sum(case when ciclo = 'anual' then round(preco_centavos/12.0) else preco_centavos end)
      from public.subscriptions where status = 'active' and not is_cortesia), 0),
    'assinantes_ativos', (select count(*) from public.subscriptions where status = 'active' and not is_cortesia),
    'ia_usos_mes',       total_ia,
    'ia_gratis_mes',     cfg.ia_gratis_mes,
    'ia_billable',       billable,
    'ia_custo_centavos', round(billable * cfg.custo_resposta_centavos),   -- estimativa antiga (centavos BRL)
    -- custo REAL de IA no mês, em centavos de dólar (front converte com a cotação)
    'ia_custo_real_usd_centavos', coalesce((
      select round(sum(custo_usd) * 100) from public.ia_chamadas
      where criado_em >= (date_trunc('month', (now() at time zone 'America/Sao_Paulo')))), 0),
    'ia_chamadas_mes', coalesce((
      select count(*) from public.ia_chamadas
      where criado_em >= (date_trunc('month', (now() at time zone 'America/Sao_Paulo')))), 0),
    'fixos_brl_centavos', coalesce((select sum(custo_mensal_centavos) from public.servicos where moeda = 'BRL'), 0),
    'fixos_usd_centavos', coalesce((select sum(custo_mensal_centavos) from public.servicos where moeda = 'USD'), 0),
    'alertas_saldo', (select coalesce(json_agg(t), '[]'::json) from (
        select nome, saldo_centavos, alerta_saldo_centavos, moeda
        from public.servicos
        where saldo_centavos is not null and alerta_saldo_centavos is not null
          and saldo_centavos <= alerta_saldo_centavos
        order by nome) t),
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
