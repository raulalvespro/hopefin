-- ============================================================
-- 0019 — Nova oferta de lançamento (prompt 2.1 do Pacote da noite)
-- ------------------------------------------------------------
-- Ajusta o que os prompts 2 e 3 criaram para a oferta decidida em 06/11:
--
--   Plano Família (até 6 pessoas):
--     Mensal : R$ 24,90 (Pix ou cartão, SEM desconto de lançamento)
--     Anual normal     : R$ 199,90 Pix à vista  ou 12x R$ 19,90 (R$ 238,80)
--     Anual lançamento : R$ 149,90 Pix à vista  ou 12x R$ 14,90 (R$ 178,80)
--       -> para quem assinar até 31/12/2026 23:59 America/Sao_Paulo,
--          travado nas renovações enquanto a assinatura seguir ativa.
--     Trial: 7 dias, sem cartão (era 14).
--
--   ACABOU: oferta "fundador", limite de 100 vagas, reserva atômica.
--   (Nenhum grupo pegou vaga de fundador — fundador_usados = 0 — então
--    o rename abaixo é seguro; não há dado a migrar.)
--
-- Cria também a base do controle de custo (prompt 11):
--   - limites_config (config única de uso de IA/WhatsApp)
--   - consumo_ia (um registro por uso)
--   - cupons + cupom_resgates (cortesia; cupom IGREJA2026)
--
-- Idempotente. NÃO toca nas policies de isolamento por grupo (0013) nem na
-- trava restritiva de INSERT por assinatura (0017).
-- ============================================================

-- ============================================================
-- 1) CONFIG DE PREÇOS (planos_config) — sai o modelo fundador
-- ============================================================
alter table public.planos_config drop column if exists familia_mensal_centavos;
alter table public.planos_config drop column if exists familia_anual_centavos;
alter table public.planos_config drop column if exists fundador_mensal_centavos;
alter table public.planos_config drop column if exists fundador_anual_centavos;
alter table public.planos_config drop column if exists fundador_limite;
alter table public.planos_config drop column if exists fundador_usados;

alter table public.planos_config
  add column if not exists mensal_centavos                    int not null default 2490,
  add column if not exists anual_pix_centavos                 int not null default 19990,
  add column if not exists anual_cartao_centavos              int not null default 23880, -- 12x 19,90
  add column if not exists anual_cartao_parcela_centavos      int not null default 1990,
  add column if not exists lanc_anual_pix_centavos            int not null default 14990,
  add column if not exists lanc_anual_cartao_centavos         int not null default 17880, -- 12x 14,90
  add column if not exists lanc_anual_cartao_parcela_centavos int not null default 1490,
  add column if not exists lancamento_ate timestamptz not null default '2026-12-31T23:59:59-03:00';

-- Trial passa de 14 para 7 dias (afeta só grupos NOVOS; os que já estão em
-- trial mantêm trial_ends_at, pois iniciar_trial_familia é idempotente).
update public.planos_config set trial_dias = 7 where id = 1;
alter table public.planos_config alter column trial_dias set default 7;

-- ============================================================
-- 2) subscriptions — "fundador" vira "lançamento"; + cortesia
-- ============================================================
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='subscriptions' and column_name='is_fundador') then
    alter table public.subscriptions rename column is_fundador to is_lancamento;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='subscriptions' and column_name='fundador_em') then
    alter table public.subscriptions rename column fundador_em to lancamento_em;
  end if;
end $$;

alter table public.subscriptions
  add column if not exists is_cortesia  boolean not null default false,
  add column if not exists cupom_codigo text;

-- ============================================================
-- 3) RPCs de preço/trial/trava
-- ============================================================

-- Funções do modelo fundador deixam de existir.
drop function if exists public.contar_fundadores();
drop function if exists public.reservar_vaga_fundador(uuid);

-- Preços para a página de planos / landing (público). Novo shape.
create or replace function public.planos_publicos()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'mensal_centavos',                    mensal_centavos,
    'anual_pix_centavos',                 anual_pix_centavos,
    'anual_cartao_centavos',              anual_cartao_centavos,
    'anual_cartao_parcela_centavos',      anual_cartao_parcela_centavos,
    'lanc_anual_pix_centavos',            lanc_anual_pix_centavos,
    'lanc_anual_cartao_centavos',         lanc_anual_cartao_centavos,
    'lanc_anual_cartao_parcela_centavos', lanc_anual_cartao_parcela_centavos,
    'lancamento_ate',                     lancamento_ate,
    'lancamento_ativo',                   (now() < lancamento_ate),
    'trial_dias',                         trial_dias
  ) from public.planos_config where id = 1;
$$;
revoke all on function public.planos_publicos() from public;
grant execute on function public.planos_publicos() to anon, authenticated;

-- iniciar_trial_familia: inalterada na lógica (lê trial_dias = 7 da config).
-- Recriada só para garantir a referência à tabela/column corretas.
create or replace function public.iniciar_trial_familia(dias_trial int default null)
returns public.subscriptions
language plpgsql security definer set search_path = public as $$
declare
  g uuid := public.meu_grupo_id();
  linha public.subscriptions;
  dias int := coalesce(dias_trial, (select trial_dias from public.planos_config where id = 1), 7);
begin
  if g is null then raise exception 'usuario_sem_grupo' using errcode = 'P0001'; end if;
  select * into linha from public.subscriptions where grupo_id = g;
  if found then return linha; end if;
  insert into public.subscriptions
    (grupo_id, titular_id, status, trial_started_at, trial_ends_at, current_period_end)
  values
    (g, auth.uid(), 'trial', now(),
     now() + make_interval(days => dias), now() + make_interval(days => dias))
  returning * into linha;
  return linha;
end; $$;
revoke all on function public.iniciar_trial_familia(int) from public;
grant execute on function public.iniciar_trial_familia(int) to authenticated;

-- grupo_pode_lancar: cortesia também pode lançar (sem cobrança, indeterminado).
create or replace function public.grupo_pode_lancar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when s.is_cortesia then true
      when s.status = 'active' then true
      when s.status = 'trial' and (s.trial_ends_at is null or s.trial_ends_at > now()) then true
      else false
    end
    from public.subscriptions s where s.grupo_id = public.meu_grupo_id()
  ), true);
$$;
revoke all on function public.grupo_pode_lancar() from public;
grant execute on function public.grupo_pode_lancar() to authenticated;

-- ============================================================
-- 4) LIMITES DE USO (config única) + CONSUMO DE IA/WhatsApp
--    Base para o prompt 11 (voz) e 11.1 (WhatsApp) controlarem custo.
-- ============================================================
create table if not exists public.limites_config (
  id              int primary key default 1 check (id = 1),
  assinante_mes   int not null default 200,   -- assinante ativo: 200/grupo/mês
  teste_total     int not null default 50,    -- trial: 50 no total
  cortesia_mes    int not null default 100,   -- cortesia: 100/grupo/mês
  por_pessoa_dia  int not null default 40,    -- teto diário por pessoa
  audio_seg_max   int not null default 60,    -- áudio até 60s
  atualizado_em   timestamptz not null default now()
);
insert into public.limites_config (id) values (1) on conflict (id) do nothing;

alter table public.limites_config enable row level security;
drop policy if exists limites_config_select on public.limites_config;
create policy limites_config_select on public.limites_config
  for select to anon, authenticated using (true);

create table if not exists public.consumo_ia (
  id            uuid primary key default gen_random_uuid(),
  grupo_id      uuid not null references public.grupos(id) on delete cascade,
  usuario_id    uuid references public.usuarios(id) on delete set null,
  data          date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  origem        text not null check (origem in ('app','whatsapp')),
  quantidade    int  not null default 1,
  custo_estimado_centavos int not null default 0,
  criado_em     timestamptz not null default now()
);
create index if not exists idx_consumo_ia_grupo_data on public.consumo_ia(grupo_id, data);

alter table public.consumo_ia enable row level security;
-- Membros do grupo LEEM o próprio consumo (telas de uso). Escrita só via RPC
-- SECURITY DEFINER (registrar_consumo_ia) ou service_role (Edge Functions).
drop policy if exists consumo_ia_select on public.consumo_ia;
create policy consumo_ia_select on public.consumo_ia
  for select to authenticated using (grupo_id = public.meu_grupo_id());

-- Quanto o grupo logado ainda pode usar neste mês/dia (o prompt 11 consome).
-- limite_mes depende do estado: cortesia > active > trial.
create or replace function public.limite_ia_status()
returns json language sql stable security definer set search_path = public as $$
  with s as (
    select * from public.subscriptions where grupo_id = public.meu_grupo_id()
  ),
  lc as (select * from public.limites_config where id = 1),
  lim as (
    select case
      when (select is_cortesia from s) then (select cortesia_mes from lc)
      when (select status from s) = 'active' then (select assinante_mes from lc)
      else (select teste_total from lc)   -- trial / sem assinatura
    end as limite_mes,
    (select por_pessoa_dia from lc) as limite_dia,
    (select audio_seg_max  from lc) as audio_seg_max
  ),
  uso as (
    select
      coalesce(sum(quantidade) filter (
        where data >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date
      ), 0) as usados_mes,
      coalesce(sum(quantidade) filter (
        where data = (now() at time zone 'America/Sao_Paulo')::date
          and usuario_id = auth.uid()
      ), 0) as usados_dia_pessoa
    from public.consumo_ia where grupo_id = public.meu_grupo_id()
  )
  select json_build_object(
    'limite_mes',        (select limite_mes from lim),
    'usados_mes',        (select usados_mes from uso),
    'limite_dia_pessoa', (select limite_dia from lim),
    'usados_dia_pessoa', (select usados_dia_pessoa from uso),
    'audio_seg_max',     (select audio_seg_max from lim),
    'pode', (
      (select usados_mes from uso)        < (select limite_mes from lim)
      and (select usados_dia_pessoa from uso) < (select limite_dia from lim)
    )
  );
$$;
revoke all on function public.limite_ia_status() from public;
grant execute on function public.limite_ia_status() to authenticated;

-- Registra um uso (chamada pelo cliente com o JWT; grava no grupo/usuário dele).
create or replace function public.registrar_consumo_ia(
  p_origem text default 'app', p_qtd int default 1, p_custo int default 0
) returns void language plpgsql security definer set search_path = public as $$
declare g uuid := public.meu_grupo_id();
begin
  if g is null then raise exception 'usuario_sem_grupo' using errcode = 'P0001'; end if;
  insert into public.consumo_ia (grupo_id, usuario_id, origem, quantidade, custo_estimado_centavos)
  values (g, auth.uid(),
          case when p_origem = 'whatsapp' then 'whatsapp' else 'app' end,
          greatest(p_qtd, 1), greatest(p_custo, 0));
end; $$;
revoke all on function public.registrar_consumo_ia(text, int, int) from public;
grant execute on function public.registrar_consumo_ia(text, int, int) to authenticated;

-- ============================================================
-- 5) CUPONS DE CORTESIA
-- ============================================================
create table if not exists public.cupons (
  codigo              text primary key,
  tipo                text not null default 'cortesia' check (tipo in ('cortesia')),
  max_usos            int  not null default 1,
  usos                int  not null default 0,
  resgate_ate         date,
  whatsapp_limite_mes int  not null default 100,
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now()
);
-- RLS ligada SEM policy de leitura pública: ninguém lê cupons direto. A
-- validação/resgate é só pela RPC SECURITY DEFINER; o /admin (prompt 8) usa
-- service_role. Assim um código não pode ser "descoberto" pelo cliente.
alter table public.cupons enable row level security;

create table if not exists public.cupom_resgates (
  grupo_id      uuid primary key references public.grupos(id) on delete cascade, -- 1 cupom por grupo
  cupom_codigo  text not null references public.cupons(codigo),
  usuario_id    uuid references public.usuarios(id) on delete set null,
  resgatado_em  timestamptz not null default now()
);
alter table public.cupom_resgates enable row level security;
drop policy if exists cupom_resgates_select on public.cupom_resgates;
create policy cupom_resgates_select on public.cupom_resgates
  for select to authenticated using (grupo_id = public.meu_grupo_id());

-- Resgate atômico: o UPDATE condicional trava a linha do cupom e só conta o
-- uso se o cupom estiver ativo, no prazo e com vaga. Um cupom por grupo.
create or replace function public.resgatar_cupom(p_codigo text)
returns json language plpgsql security definer set search_path = public as $$
declare
  g uuid := public.meu_grupo_id();
  cod text := upper(btrim(coalesce(p_codigo, '')));
  c public.cupons;
begin
  if g is null then raise exception 'usuario_sem_grupo' using errcode = 'P0001'; end if;
  if cod = '' then raise exception 'cupom_invalido' using errcode = 'P0001'; end if;
  if exists (select 1 from public.cupom_resgates where grupo_id = g) then
    raise exception 'grupo_ja_resgatou' using errcode = 'P0001';
  end if;

  update public.cupons
     set usos = usos + 1
   where codigo = cod
     and ativo
     and (resgate_ate is null or resgate_ate >= current_date)
     and usos < max_usos
  returning * into c;

  if not found then
    raise exception 'cupom_invalido' using errcode = 'P0001';
  end if;

  insert into public.cupom_resgates (grupo_id, cupom_codigo, usuario_id)
  values (g, c.codigo, auth.uid());

  update public.subscriptions
     set is_cortesia = true, cupom_codigo = c.codigo
   where grupo_id = g;

  return json_build_object('ok', true, 'codigo', c.codigo,
                           'whatsapp_limite_mes', c.whatsapp_limite_mes);
end; $$;
revoke all on function public.resgatar_cupom(text) from public;
grant execute on function public.resgatar_cupom(text) to authenticated;

-- Cupom da igreja: 30 usos, resgate até 31/03/2027, WhatsApp 100/mês.
insert into public.cupons (codigo, tipo, max_usos, resgate_ate, whatsapp_limite_mes, ativo)
values ('IGREJA2026', 'cortesia', 30, '2027-03-31', 100, true)
on conflict (codigo) do nothing;
