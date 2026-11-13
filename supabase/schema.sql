-- ============================================================
-- HopeFin — Schema completo (reconstruído a partir do código do app)
-- Rode isto no SQL Editor do projeto Supabase NOVO.
-- Seguro para rodar em projeto vazio. Idempotente no básico.
-- ============================================================

-- ---------- EXTENSÕES ----------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ============================================================
-- TABELAS
-- ============================================================

-- Grupos (família / casal) — unidade de compartilhamento dos dados
create table if not exists public.grupos (
  id         uuid primary key default gen_random_uuid(),
  criado_por uuid,                       -- dono do grupo (quem remove membros) — 0028
  nome       text not null,
  codigo     text unique not null default substr(replace(gen_random_uuid()::text,'-',''),1,8),
  criado_em  timestamptz not null default now()
);

-- Usuários (espelha auth.users; id = auth.uid())
create table if not exists public.usuarios (
  id                  uuid primary key references auth.users(id) on delete cascade,
  nome                text not null,
  email               text,
  foto_url            text,
  grupo_id            uuid references public.grupos(id) on delete set null,
  telefone            text,                                 -- WhatsApp (só dígitos) — 0018
  marketing_optin     boolean not null default false,       -- consentimento LGPD — 0018
  marketing_optin_em  timestamptz,
  criado_em           timestamptz not null default now()
);

-- Cartões de crédito
create table if not exists public.cartoes (
  id             uuid primary key default gen_random_uuid(),
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  nome           text not null,
  bandeira       text default 'Visa',
  dia_fechamento int,
  dia_vencimento int,
  limite         numeric(12,2),
  alerta_dias    int default 3,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now()
);

-- Gastos variáveis
create table if not exists public.gastos (
  id             uuid primary key default gen_random_uuid(),
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  usuario_id     uuid references public.usuarios(id) on delete set null,
  descricao      text not null,
  valor          numeric(12,2) not null,
  categoria      text default 'outros',
  tipo_pagamento text default 'cartao',  -- cartao | pix | dinheiro
  cartao_id      uuid references public.cartoes(id) on delete set null,
  data           date not null default current_date,
  origem         text not null default 'app' check (origem in ('app','voz','texto','whatsapp')),  -- 0026
  observacao     text,                                 -- anotação livre opcional — 0038
  criado_em      timestamptz not null default now()
);

-- Entradas (receitas)
create table if not exists public.entradas (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  usuario_id  uuid references public.usuarios(id) on delete set null,
  descricao   text not null,
  valor       numeric(12,2) not null,
  tipo            text default 'avulso',   -- fixo | avulso
  recorrente      boolean not null default false,
  recebido        boolean not null default false,  -- entrada confirmada na conta
  data_recebimento date,
  data        date not null default current_date,
  criado_em   timestamptz not null default now()
);

-- Contas fixas mensais
create table if not exists public.contas_fixas (
  id             uuid primary key default gen_random_uuid(),
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  nome           text not null,
  valor          numeric(12,2) not null,
  dia_vencimento int,
  categoria      text default 'outros',
  alerta_dias    int default 3,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now()
);

-- Parcelamentos (compra dividida em N parcelas)
create table if not exists public.parcelamentos (
  id                   uuid primary key default gen_random_uuid(),
  grupo_id             uuid not null references public.grupos(id) on delete cascade,
  usuario_id           uuid references public.usuarios(id) on delete set null,
  descricao            text not null,
  valor_total          numeric(12,2) not null,
  num_parcelas         int not null check (num_parcelas >= 1),
  valor_parcela        numeric(12,2) not null,
  cartao_id            uuid references public.cartoes(id) on delete set null,
  categoria            text default 'outros',
  data_primeira_parcela date not null default current_date,
  criado_em            timestamptz not null default now()
);

-- Parcelas individuais (geradas automaticamente via trigger)
create table if not exists public.parcelas (
  id              uuid primary key default gen_random_uuid(),
  grupo_id        uuid not null references public.grupos(id) on delete cascade,
  parcelamento_id uuid not null references public.parcelamentos(id) on delete cascade,
  numero          int not null,
  valor           numeric(12,2) not null,
  data_vencimento date not null,
  paga            boolean not null default false,
  criado_em       timestamptz not null default now()
);

-- Cofrinhos / investimentos / reservas
create table if not exists public.cofrinhos (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  nome        text not null,
  descricao   text,
  meta        numeric(12,2),
  meta_data   date,                      -- prazo-alvo opcional da meta
  tipo        text default 'cofrinho',  -- cofrinho | investimento | reserva
  saldo_atual numeric(12,2) not null default 0,
  criado_em   timestamptz not null default now()
);

-- Transferências para cofrinhos (depósitos)
create table if not exists public.transferencias (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  usuario_id  uuid references public.usuarios(id) on delete set null,
  cofrinho_id uuid not null references public.cofrinhos(id) on delete cascade,
  valor       numeric(12,2) not null,
  descricao   text,
  data        date not null default current_date,
  criado_em   timestamptz not null default now()
);

-- Assinaturas (usadas no Resumo). Sem página de CRUD ainda no app.
create table if not exists public.assinaturas (
  id            uuid primary key default gen_random_uuid(),
  grupo_id      uuid not null references public.grupos(id) on delete cascade,
  nome          text not null,
  valor         numeric(12,2) not null,
  dia_cobranca  int,
  cartao_id     uuid references public.cartoes(id) on delete set null,
  categoria     text default 'outros',                 -- agregador por categoria — 0038
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- Lançamentos mensais das contas fixas (planejado × praticado)
create table if not exists public.fixas_lancamentos (
  id             uuid primary key default gen_random_uuid(),
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  conta_fixa_id  uuid not null references public.contas_fixas(id) on delete cascade,
  competencia    text not null,                 -- 'YYYY-MM'
  valor_previsto numeric(12,2) not null default 0,
  valor_real     numeric(12,2),
  pago           boolean not null default false,
  data_pagamento date,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (conta_fixa_id, competencia)
);

-- ---------- ÍNDICES úteis ----------
create index if not exists idx_fixas_lanc_grupo_comp     on public.fixas_lancamentos(grupo_id, competencia);
create index if not exists idx_gastos_grupo_data        on public.gastos(grupo_id, data);
create index if not exists idx_entradas_grupo_data       on public.entradas(grupo_id, data);
create index if not exists idx_parcelas_grupo_venc       on public.parcelas(grupo_id, data_vencimento);
create index if not exists idx_contas_fixas_grupo        on public.contas_fixas(grupo_id);
create index if not exists idx_cartoes_grupo             on public.cartoes(grupo_id);
create index if not exists idx_transferencias_cofrinho   on public.transferencias(cofrinho_id);

-- ============================================================
-- TRIGGER: gerar parcelas automaticamente ao criar um parcelamento
-- ============================================================
create or replace function public.gerar_parcelas()
returns trigger
language plpgsql
as $$
declare
  i int;
begin
  for i in 1..new.num_parcelas loop
    insert into public.parcelas (grupo_id, parcelamento_id, numero, valor, data_vencimento, paga)
    values (
      new.grupo_id,
      new.id,
      i,
      new.valor_parcela,
      (new.data_primeira_parcela + make_interval(months => i - 1))::date,
      false
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_gerar_parcelas on public.parcelamentos;
create trigger trg_gerar_parcelas
  after insert on public.parcelamentos
  for each row execute function public.gerar_parcelas();

-- ============================================================
-- RLS — isolamento por grupo
-- ============================================================

-- Helper: grupo_id do usuário logado (SECURITY DEFINER evita recursão de RLS)
create or replace function public.meu_grupo_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select grupo_id from public.usuarios where id = auth.uid();
$$;

alter table public.grupos         enable row level security;
alter table public.usuarios       enable row level security;
alter table public.cartoes        enable row level security;
alter table public.gastos         enable row level security;
alter table public.entradas       enable row level security;
alter table public.contas_fixas   enable row level security;
alter table public.parcelamentos  enable row level security;
alter table public.parcelas       enable row level security;
alter table public.cofrinhos      enable row level security;
alter table public.transferencias enable row level security;
alter table public.assinaturas    enable row level security;
alter table public.fixas_lancamentos enable row level security;
drop policy if exists fixas_lancamentos_todas on public.fixas_lancamentos;
create policy fixas_lancamentos_todas on public.fixas_lancamentos
  for all to authenticated
  using (grupo_id = public.meu_grupo_id())
  with check (grupo_id = public.meu_grupo_id());

-- "Pago" de faturas de cartão e assinaturas, por competência
create table if not exists public.contas_pagas (
  id             uuid primary key default gen_random_uuid(),
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  tipo           text not null,                 -- 'fatura' | 'assinatura'
  referencia_id  uuid not null,
  competencia    text not null,                 -- 'YYYY-MM'
  valor          numeric(12,2),
  pago           boolean not null default true,
  data_pagamento date,
  criado_em      timestamptz not null default now(),
  unique (tipo, referencia_id, competencia)
);
create index if not exists idx_contas_pagas_grupo_comp on public.contas_pagas(grupo_id, competencia);
alter table public.contas_pagas enable row level security;
drop policy if exists contas_pagas_todas on public.contas_pagas;
create policy contas_pagas_todas on public.contas_pagas
  for all to authenticated
  using (grupo_id = public.meu_grupo_id())
  with check (grupo_id = public.meu_grupo_id());

-- Alertas dispensados pelo usuário (para "fechar" um alerta do sininho)
create table if not exists public.alertas_dispensados (
  id            uuid primary key default gen_random_uuid(),
  grupo_id      uuid not null references public.grupos(id) on delete cascade,
  alerta_id     text not null,
  lembrar_em    date,                 -- null = dispensado; data = em soneca até essa data
  dispensado_em timestamptz not null default now(),
  unique (grupo_id, alerta_id)
);
create index if not exists idx_alertas_disp_grupo on public.alertas_dispensados(grupo_id);
alter table public.alertas_dispensados enable row level security;
drop policy if exists alertas_dispensados_todas on public.alertas_dispensados;
create policy alertas_dispensados_todas on public.alertas_dispensados
  for all to authenticated
  using (grupo_id = public.meu_grupo_id())
  with check (grupo_id = public.meu_grupo_id());

-- Preferências de notificação por grupo (uma linha; ausência = tudo ligado)
create table if not exists public.preferencias_notificacao (
  grupo_id            uuid primary key references public.grupos(id) on delete cascade,
  alertar_vencimentos boolean not null default true,
  alertar_fatura      boolean not null default true,
  alertar_orcamento   boolean not null default true,
  alertar_metas       boolean not null default true,
  alertar_projecao    boolean not null default true,
  dias_padrao         int     not null default 7,
  atualizado_em       timestamptz not null default now()
);
alter table public.preferencias_notificacao enable row level security;
drop policy if exists preferencias_notificacao_todas on public.preferencias_notificacao;
create policy preferencias_notificacao_todas on public.preferencias_notificacao
  for all to authenticated
  using (grupo_id = public.meu_grupo_id())
  with check (grupo_id = public.meu_grupo_id());

-- Entrar/criar grupo são RPCs SECURITY DEFINER (ver migração 0013). O cliente
-- NÃO troca grupo_id por update direto, e não enumera grupos de terceiros.
create or replace function public.entrar_no_grupo(p_codigo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select id into gid from public.grupos where codigo = lower(trim(p_codigo));
  if gid is null then raise exception 'codigo_invalido' using errcode = 'P0001'; end if;
  update public.usuarios set grupo_id = gid where id = auth.uid();
  return gid;
end; $$;
create or replace function public.criar_grupo(p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if coalesce(trim(p_nome), '') = '' then raise exception 'nome_vazio' using errcode = 'P0001'; end if;
  insert into public.grupos (nome) values (trim(p_nome)) returning id into gid;
  update public.usuarios set grupo_id = gid where id = auth.uid();
  return gid;
end; $$;
revoke all on function public.entrar_no_grupo(text) from public;
revoke all on function public.criar_grupo(text) from public;
grant execute on function public.entrar_no_grupo(text) to authenticated;
grant execute on function public.criar_grupo(text) to authenticated;

-- GRUPOS: cada um vê só o próprio grupo; cria/entra só via RPC acima; renomeia quem é do grupo.
drop policy if exists grupos_select on public.grupos;
create policy grupos_select on public.grupos
  for select to authenticated using (id = public.meu_grupo_id());
drop policy if exists grupos_insert on public.grupos;
drop policy if exists grupos_update on public.grupos;
create policy grupos_update on public.grupos
  for update to authenticated using (id = public.meu_grupo_id());

-- USUARIOS: vê a si mesmo e colegas de grupo; insere a própria linha;
-- atualiza a própria linha SEM poder trocar grupo_id por update direto.
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (id = auth.uid() or grupo_id = public.meu_grupo_id());
drop policy if exists usuarios_insert on public.usuarios;
create policy usuarios_insert on public.usuarios
  for insert to authenticated with check (id = auth.uid());
drop policy if exists usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and grupo_id is not distinct from public.meu_grupo_id());

-- Macro para as tabelas de dados: tudo escopo do grupo do usuário.
-- (políticas FOR ALL cobrem select/insert/update/delete)
do $$
declare t text;
begin
  foreach t in array array[
    'cartoes','gastos','entradas','contas_fixas',
    'parcelamentos','parcelas','cofrinhos','transferencias','assinaturas'
  ] loop
    execute format('drop policy if exists %I_todas on public.%I;', t, t);
    execute format(
      'create policy %I_todas on public.%I for all to authenticated
         using (grupo_id = public.meu_grupo_id())
         with check (grupo_id = public.meu_grupo_id());', t, t);
  end loop;
end $$;

-- ============================================================
-- ASSINATURA DO APP (billing Asaas) — ver migrações 0016 + 0017 + 0019
-- Uma por grupo (plano Família). NÃO confundir com public.assinaturas.
-- Escrita só via service_role (webhook) ou RPCs SECURITY DEFINER.
-- ============================================================
create table if not exists public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  grupo_id              uuid not null unique references public.grupos(id) on delete cascade,
  titular_id            uuid references public.usuarios(id) on delete set null,
  plano                 text not null default 'familia',
  ciclo                 text not null default 'mensal' check (ciclo in ('mensal','anual')),
  status                text not null default 'trial'
                          check (status in ('trial','active','past_due','canceled','expired')),
  is_lancamento         boolean not null default false,       -- assinou no preço de lançamento — 0019
  lancamento_em         timestamptz,                          -- 0019
  is_cortesia           boolean not null default false,       -- cupom de cortesia — 0019
  cupom_codigo          text,                                 -- 0019
  preco_centavos        integer,
  trial_started_at      timestamptz,
  trial_ends_at         timestamptz,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  canceled_at           timestamptz,
  asaas_customer_id     text,
  asaas_subscription_id text,
  asaas_last_payment_id text,
  metodo_pagamento      text,                                -- pix | boleto | cartao — 0018
  checkout_iniciado_em  timestamptz,                         -- carrinho abandonado — 0018
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated using (grupo_id = public.meu_grupo_id());

-- Config única de preços (linha id=1). Select liberado para a landing (anon).
-- Oferta 06/11: mensal 24,90; anual Pix 199,90 (lanç. 149,90); anual cartão
-- 12x 19,90 = 238,80 (lanç. 12x 14,90 = 178,80); lançamento até 31/12/2026.
create table if not exists public.planos_config (
  id                                 int primary key default 1 check (id = 1),
  mensal_centavos                    int not null default 2490,
  anual_pix_centavos                 int not null default 19990,
  anual_cartao_centavos              int not null default 23880,
  anual_cartao_parcela_centavos      int not null default 1990,
  lanc_anual_pix_centavos            int not null default 14990,
  lanc_anual_cartao_centavos         int not null default 17880,
  lanc_anual_cartao_parcela_centavos int not null default 1490,
  lancamento_ate                     timestamptz not null default '2026-12-31T23:59:59-03:00',
  trial_dias                         int not null default 7,
  atualizado_em                      timestamptz not null default now()
);
insert into public.planos_config (id) values (1) on conflict (id) do nothing;
alter table public.planos_config enable row level security;
drop policy if exists planos_config_select on public.planos_config;
create policy planos_config_select on public.planos_config
  for select to anon, authenticated using (true);

-- Funções (SECURITY DEFINER) — ver 0017/0019 para o corpo completo:
--   iniciar_trial_familia(int default null) -> cria trial do grupo (idempotente, 7 dias)
--   planos_publicos()        -> json de preços + lancamento_ativo (grant anon)
--   grupo_pode_lancar()      -> cortesia | active (cancelada: até current_period_end — 0027) | trial válido | legado (sem linha)
--   encerrar_assinaturas_canceladas() -> cron: active cancelada vencida vira 'canceled' (0027)
--   limite_ia_status()       -> json de uso/limite de IA do grupo (0019)
--   registrar_consumo_ia(text,int,int) -> grava um uso de IA (0019)
--   resgatar_cupom(text)     -> resgate atômico de cortesia; 1 cupom por grupo (0019)

-- Trava de novos lançamentos: RLS RESTRICTIVE de INSERT em gastos/entradas/
-- parcelamentos/transferencias (<tabela>_insert_assinatura) com
-- with check (public.grupo_pode_lancar()). Vencido lê/exporta, não cria.

-- ============================================================
-- LIMITES DE USO + CONSUMO DE IA/WhatsApp — ver 0019
-- ============================================================
create table if not exists public.limites_config (
  id              int primary key default 1 check (id = 1),
  assinante_mes   int not null default 200,
  teste_total     int not null default 50,
  cortesia_mes    int not null default 100,
  por_pessoa_dia  int not null default 40,
  audio_seg_max   int not null default 60,
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
alter table public.consumo_ia enable row level security;
drop policy if exists consumo_ia_select on public.consumo_ia;
create policy consumo_ia_select on public.consumo_ia
  for select to authenticated using (grupo_id = public.meu_grupo_id());

-- ============================================================
-- CUPONS DE CORTESIA — ver 0019
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
-- RLS ligada SEM select público: só a RPC resgatar_cupom (DEFINER) e o /admin.
alter table public.cupons enable row level security;

create table if not exists public.cupom_resgates (
  grupo_id      uuid primary key references public.grupos(id) on delete cascade,
  cupom_codigo  text not null references public.cupons(codigo),
  usuario_id    uuid references public.usuarios(id) on delete set null,
  resgatado_em  timestamptz not null default now()
);
alter table public.cupom_resgates enable row level security;
drop policy if exists cupom_resgates_select on public.cupom_resgates;
create policy cupom_resgates_select on public.cupom_resgates
  for select to authenticated using (grupo_id = public.meu_grupo_id());

-- ============================================================
-- PAINEL DO DONO (/admin) — migração 0021 (prompt 8)
-- ============================================================
-- usuarios.is_admin (papel) + helper sou_admin(); o /admin vê MÉTRICAS e
-- METADADOS de grupos, nunca os lançamentos das famílias (LGPD).
alter table public.usuarios add column if not exists is_admin boolean not null default false;

create table if not exists public.admin_config (            -- linha única (id=1)
  id int primary key default 1 check (id = 1),
  whatsapp_pausado boolean not null default false,
  whatsapp_teto_centavos int not null default 30000,        -- R$ 300,00
  ia_gratis_mes int not null default 1000,                  -- respostas grátis/mês
  custo_resposta_centavos numeric(8,4) not null default 3.5, -- R$ 0,035/resposta
  atualizado_em timestamptz not null default now()
);
alter table public.admin_config enable row level security;  -- select só admin

create table if not exists public.admin_log (               -- auditoria de ações
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.usuarios(id) on delete set null,
  acao text not null, grupo_id uuid references public.grupos(id) on delete set null,
  motivo text, detalhe jsonb, criado_em timestamptz not null default now()
);
alter table public.admin_log enable row level security;     -- select só admin

create table if not exists public.webhook_log (             -- eventos do Asaas
  id uuid primary key default gen_random_uuid(),
  origem text not null default 'asaas', evento text, status text, payment_id text,
  payload jsonb, erro text, recebido_em timestamptz not null default now()
);
alter table public.webhook_log enable row level security;   -- select só admin

-- RPCs (SECURITY DEFINER, começam com if not sou_admin() then raise):
--   admin_metricas()               -> MRR, assinantes, trials, past_due, lançamento…
--   admin_consumo_mes()            -> uso IA/WhatsApp + custo + top + taxa de acerto da voz
--   admin_grupos(busca)            -> grupos com status/plano/membros (SEM lançamentos)
--   admin_estender_trial(g,dias,motivo) / admin_marcar_cortesia(g,ativar,motivo)  (+log)
--   admin_cupons() / admin_salvar_cupom(cod,max,ate,wpp,ativo)
--   admin_set_whatsapp(pausado,teto) / admin_webhooks()
-- O asaas-webhook grava cada evento em webhook_log (service_role).

-- ============================================================
-- FIM
-- ============================================================
