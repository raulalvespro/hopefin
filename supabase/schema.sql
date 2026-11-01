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
  nome       text not null,
  codigo     text unique not null default substr(replace(gen_random_uuid()::text,'-',''),1,8),
  criado_em  timestamptz not null default now()
);

-- Usuários (espelha auth.users; id = auth.uid())
create table if not exists public.usuarios (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  email      text,
  grupo_id   uuid references public.grupos(id) on delete set null,
  criado_em  timestamptz not null default now()
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
  criado_em      timestamptz not null default now()
);

-- Entradas (receitas)
create table if not exists public.entradas (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  usuario_id  uuid references public.usuarios(id) on delete set null,
  descricao   text not null,
  valor       numeric(12,2) not null,
  tipo        text default 'avulso',   -- fixo | avulso
  recorrente  boolean not null default false,
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
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- ---------- ÍNDICES úteis ----------
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

-- GRUPOS: qualquer autenticado pode ler (necessário p/ entrar via código) e criar.
--         Atualiza só quem é do grupo.
drop policy if exists grupos_select on public.grupos;
create policy grupos_select on public.grupos
  for select to authenticated using (true);
drop policy if exists grupos_insert on public.grupos;
create policy grupos_insert on public.grupos
  for insert to authenticated with check (true);
drop policy if exists grupos_update on public.grupos;
create policy grupos_update on public.grupos
  for update to authenticated using (id = public.meu_grupo_id());

-- USUARIOS: vê a si mesmo e colegas de grupo; insere/atualiza a própria linha.
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (id = auth.uid() or grupo_id = public.meu_grupo_id());
drop policy if exists usuarios_insert on public.usuarios;
create policy usuarios_insert on public.usuarios
  for insert to authenticated with check (id = auth.uid());
drop policy if exists usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios
  for update to authenticated using (id = auth.uid());

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
-- FIM
-- ============================================================
