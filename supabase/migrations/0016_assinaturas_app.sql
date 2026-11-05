-- ============================================================
-- 0016 — Assinatura do PRÓPRIO app (billing via Asaas)
-- ------------------------------------------------------------
-- NÃO confundir com public.assinaturas (serviços que o usuário
-- assina — Netflix etc. — e lança como gasto). Esta tabela é a
-- assinatura do HopeFin em si: uma por grupo (plano Família).
--
-- Regras de hoje (05/11/2026):
--   Família:  R$ 19,90/mês  ·  R$ 149,90/ano   · trial 14 dias
--   Fundador: R$ 14,90/mês  ·  R$ 119,90/ano   (100 primeiros que PAGAREM;
--             travado enquanto a assinatura seguir ativa)
--
-- Privacidade (LGPD): NUNCA guardamos CPF nem dados de cartão aqui.
-- Só referências do Asaas (customer/subscription/payment ids).
-- Escrita de status/preço vem SÓ do webhook (service_role) ou das
-- funções SECURITY DEFINER abaixo; o cliente só LÊ.
-- Idempotente.
-- ============================================================

create table if not exists public.assinaturas_app (
  id                    uuid primary key default gen_random_uuid(),
  grupo_id              uuid not null unique references public.grupos(id) on delete cascade,
  titular_id            uuid references public.usuarios(id) on delete set null,

  plano                 text not null default 'familia',             -- hoje só 'familia'
  ciclo                 text not null default 'mensal'
                          check (ciclo in ('mensal','anual')),
  status                text not null default 'trialing'
                          check (status in ('trialing','active','past_due','canceled','expired')),

  is_fundador           boolean not null default false,
  fundador_em           timestamptz,
  preco_centavos        integer,                                     -- preço travado (centavos)

  trial_started_at      timestamptz,
  trial_ends_at         timestamptz,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  canceled_at           timestamptz,

  -- Referências externas no Asaas (sem PII)
  asaas_customer_id     text,
  asaas_subscription_id text,
  asaas_last_payment_id text,

  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index if not exists idx_assinaturas_app_status on public.assinaturas_app(status);
create unique index if not exists idx_assinaturas_app_asaas_sub
  on public.assinaturas_app(asaas_subscription_id)
  where asaas_subscription_id is not null;

-- updated_at automático
create or replace function public.set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end; $$;

drop trigger if exists trg_assinaturas_app_updated on public.assinaturas_app;
create trigger trg_assinaturas_app_updated
  before update on public.assinaturas_app
  for each row execute function public.set_atualizado_em();

-- ---------- RLS ----------
-- Membros do grupo LEEM a assinatura do próprio grupo. Sem políticas de
-- insert/update/delete: escrita só via service_role (webhook) ou RPCs abaixo.
alter table public.assinaturas_app enable row level security;

drop policy if exists assinaturas_app_select on public.assinaturas_app;
create policy assinaturas_app_select on public.assinaturas_app
  for select to authenticated
  using (grupo_id = public.meu_grupo_id());

-- ---------- RPC: iniciar trial (idempotente) ----------
-- Chamada pelo cliente no 1º acesso. Cria a linha de trial do próprio grupo.
-- Se já existe, devolve a existente (NÃO reinicia o trial).
create or replace function public.iniciar_trial_familia(dias_trial int default 14)
returns public.assinaturas_app
language plpgsql
security definer
set search_path = public
as $$
declare
  g uuid := public.meu_grupo_id();
  linha public.assinaturas_app;
begin
  if g is null then
    raise exception 'usuario_sem_grupo' using errcode = 'P0001';
  end if;

  select * into linha from public.assinaturas_app where grupo_id = g;
  if found then
    return linha;
  end if;

  insert into public.assinaturas_app
    (grupo_id, titular_id, status, trial_started_at, trial_ends_at, current_period_end)
  values
    (g, auth.uid(), 'trialing',
     now(),
     now() + make_interval(days => dias_trial),
     now() + make_interval(days => dias_trial))
  returning * into linha;

  return linha;
end; $$;

revoke all on function public.iniciar_trial_familia(int) from public;
grant execute on function public.iniciar_trial_familia(int) to authenticated;

-- ---------- RPC: quantos fundadores já pagaram (0..100) ----------
-- Bypassa RLS (SECURITY DEFINER) p/ contar entre todos os grupos.
-- Usada pela página de Planos p/ mostrar "faltam X vagas de fundador".
create or replace function public.contar_fundadores()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.assinaturas_app where is_fundador = true;
$$;

revoke all on function public.contar_fundadores() from public;
grant execute on function public.contar_fundadores() to anon, authenticated;
