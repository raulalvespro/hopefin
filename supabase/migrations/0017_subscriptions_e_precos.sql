-- ============================================================
-- 0017 — Assinatura (prompts 2 e 3 do Pacote da noite)
-- ------------------------------------------------------------
-- 1) Renomeia assinaturas_app -> subscriptions (estava vazia) e alinha o
--    vocabulário de status ao plano ('trial' em vez de 'trialing').
-- 2) Config única de preços (planos_config) com limite de 100 fundadores.
-- 3) Reserva ATÔMICA de vaga de fundador (nunca passa de 100, mesmo com
--    duas assinaturas ao mesmo tempo).
-- 4) Trava de "novos lançamentos" por status, via RLS RESTRICTIVE de INSERT
--    (não toca nas policies de isolamento por grupo já validadas).
-- Idempotente.
-- ============================================================

-- ---------- 1) RENOMEAR TABELA + STATUS ----------
alter table if exists public.assinaturas_app rename to subscriptions;

alter table public.subscriptions drop constraint if exists assinaturas_app_status_check;
update public.subscriptions set status = 'trial' where status = 'trialing';
alter table public.subscriptions alter column status set default 'trial';
alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('trial','active','past_due','canceled','expired'));

-- policy e trigger com o nome novo
drop policy if exists assinaturas_app_select on public.subscriptions;
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated using (grupo_id = public.meu_grupo_id());

drop trigger if exists trg_assinaturas_app_updated on public.subscriptions;
drop trigger if exists trg_subscriptions_updated on public.subscriptions;
create trigger trg_subscriptions_updated
  before update on public.subscriptions
  for each row execute function public.set_atualizado_em();

-- ---------- 2) CONFIG ÚNICA DE PREÇOS ----------
create table if not exists public.planos_config (
  id                        int primary key default 1 check (id = 1),  -- linha única
  familia_mensal_centavos   int not null default 1990,
  familia_anual_centavos    int not null default 14990,
  fundador_mensal_centavos  int not null default 1490,
  fundador_anual_centavos   int not null default 11990,
  fundador_limite           int not null default 100,
  fundador_usados           int not null default 0,
  trial_dias                int not null default 14,
  atualizado_em             timestamptz not null default now()
);
insert into public.planos_config (id) values (1) on conflict (id) do nothing;

alter table public.planos_config enable row level security;
drop policy if exists planos_config_select on public.planos_config;
create policy planos_config_select on public.planos_config
  for select to anon, authenticated using (true);
-- escrita só por service_role (bypassa RLS) / funções SECURITY DEFINER.

-- ---------- 3) RPCs ----------
-- (re)alinha iniciar_trial_familia e contar_fundadores à tabela nova
create or replace function public.iniciar_trial_familia(dias_trial int default null)
returns public.subscriptions
language plpgsql security definer set search_path = public as $$
declare
  g uuid := public.meu_grupo_id();
  linha public.subscriptions;
  dias int := coalesce(dias_trial, (select trial_dias from public.planos_config where id = 1), 14);
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

create or replace function public.contar_fundadores()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select fundador_usados from public.planos_config where id = 1), 0);
$$;
revoke all on function public.contar_fundadores() from public;
grant execute on function public.contar_fundadores() to anon, authenticated;

-- Preços + vagas para a página de planos / landing (público).
create or replace function public.planos_publicos()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'familia_mensal_centavos',  familia_mensal_centavos,
    'familia_anual_centavos',   familia_anual_centavos,
    'fundador_mensal_centavos', fundador_mensal_centavos,
    'fundador_anual_centavos',  fundador_anual_centavos,
    'fundador_limite',          fundador_limite,
    'fundador_usados',          fundador_usados,
    'fundador_vagas',           greatest(fundador_limite - fundador_usados, 0),
    'trial_dias',               trial_dias
  ) from public.planos_config where id = 1;
$$;
revoke all on function public.planos_publicos() from public;
grant execute on function public.planos_publicos() to anon, authenticated;

-- Reserva ATÔMICA de vaga de fundador. Chamada pelo backend (webhook Asaas,
-- service_role) quando o PRIMEIRO pagamento é confirmado. O update condicional
-- trava a linha e só incrementa se houver vaga -> nunca passa de 100.
create or replace function public.reservar_vaga_fundador(p_grupo uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare usados int;
begin
  update public.planos_config
     set fundador_usados = fundador_usados + 1, atualizado_em = now()
   where id = 1 and fundador_usados < fundador_limite
  returning fundador_usados into usados;
  if usados is null then
    return false;  -- 100 vagas esgotadas
  end if;
  update public.subscriptions
     set is_fundador = true,
         fundador_em = now(),
         preco_centavos = case when ciclo = 'anual'
           then (select fundador_anual_centavos  from public.planos_config where id = 1)
           else (select fundador_mensal_centavos from public.planos_config where id = 1) end
   where grupo_id = p_grupo;
  return true;
end; $$;
revoke all on function public.reservar_vaga_fundador(uuid) from public;
-- sem grant: só service_role (webhook) executa.

-- Pode o grupo logado criar novos lançamentos? (trial válido ou active;
-- grupo sem assinatura = legado, segue podendo.)
create or replace function public.grupo_pode_lancar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when s.status = 'active' then true
      when s.status = 'trial' and (s.trial_ends_at is null or s.trial_ends_at > now()) then true
      else false
    end
    from public.subscriptions s where s.grupo_id = public.meu_grupo_id()
  ), true);
$$;
revoke all on function public.grupo_pode_lancar() from public;
grant execute on function public.grupo_pode_lancar() to authenticated;

-- ---------- 4) TRAVA DE LANÇAMENTO (RLS RESTRICTIVE de INSERT) ----------
-- Adiciona uma camada AND só no INSERT dessas tabelas, sem mexer nas policies
-- permissivas de isolamento por grupo (que seguem valendo para select/update/delete/insert).
do $$ declare t text; begin
  foreach t in array array['gastos','entradas','parcelamentos','transferencias'] loop
    execute format('drop policy if exists %I_insert_assinatura on public.%I;', t, t);
    execute format(
      'create policy %I_insert_assinatura on public.%I
         as restrictive for insert to authenticated
         with check (public.grupo_pode_lancar());', t, t);
  end loop;
end $$;
