-- 0088 — A8.9 (21/11/2026, ok do Raul): parcelas "já paguei" ficam fora dos meses passados.
--
-- Problema: um parcelado lançado no meio ("já paguei 2 de 10") cria as parcelas antigas, e elas
-- apareciam nas faturas/Gastos/Fechamento/A receber dos meses ANTERIORES ao app — fatura antiga só
-- com um pedaço. Decisão: GUARDAR o histórico (nada é apagado) e marcar essas parcelas como
-- "pagas antes do app": continuam contando pra "parcela 3/10" e pro progresso do parcelamento, mas
-- as telas de mês (motor, Gastos, Contas do mês, A receber, Importar) não somam mais elas.
--
-- Regra (trigger, vale pra parcela nova e pra parcela recriada ao editar o parcelamento):
--   antes_do_app = paga  E  numero <= parcelamentos.parcelas_pagas
--                  E  data_vencimento < 1º dia do mês em que o GRUPO começou no app (grupos.criado_em)
-- Assim só some o que é de meses inteiros antes de a família usar o app; o mês em que ela começou
-- (e os seguintes) ficam completos.
-- Desmarcou "paga"? Deixa de ser "antes do app" na hora.
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

alter table public.parcelas add column if not exists antes_do_app boolean not null default false;
comment on column public.parcelas.antes_do_app is 'A8.9: parcela "já paguei" com vencimento antes do 1º mês do grupo no app — fora das telas de mês';

-- 1º dia do mês em que o grupo começou no app (horário de Brasília).
create or replace function public.inicio_do_grupo_no_app(p_grupo uuid)
returns date language sql stable security definer set search_path = public as $$
  select date_trunc('month', g.criado_em at time zone 'America/Sao_Paulo')::date from public.grupos g where g.id = p_grupo;
$$;
revoke all on function public.inicio_do_grupo_no_app(uuid) from public, anon, authenticated;

create or replace function public.marcar_parcela_antes_do_app()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.antes_do_app := coalesce(new.paga, false) and exists (
    select 1 from public.parcelamentos pc
     where pc.id = new.parcelamento_id
       and new.numero <= coalesce(pc.parcelas_pagas, 0)
       and new.data_vencimento < public.inicio_do_grupo_no_app(new.grupo_id));
  return new;
end $$;
revoke all on function public.marcar_parcela_antes_do_app() from public, anon, authenticated;

drop trigger if exists trg_parcela_antes_do_app on public.parcelas;
create trigger trg_parcela_antes_do_app
  before insert or update of paga, numero, data_vencimento on public.parcelas
  for each row execute function public.marcar_parcela_antes_do_app();

-- Mudou o "já paguei" do parcelamento? Recalcula as parcelas dele.
create or replace function public.remarcar_parcelas_antes_do_app()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parcelas_pagas is distinct from old.parcelas_pagas then
    update public.parcelas p set antes_do_app = coalesce(p.paga, false)
       and p.numero <= coalesce(new.parcelas_pagas, 0)
       and p.data_vencimento < public.inicio_do_grupo_no_app(new.grupo_id)
     where p.parcelamento_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.remarcar_parcelas_antes_do_app() from public, anon, authenticated;

drop trigger if exists trg_parcelamento_remarca_antes on public.parcelamentos;
create trigger trg_parcelamento_remarca_antes
  after update of parcelas_pagas on public.parcelamentos
  for each row execute function public.remarcar_parcelas_antes_do_app();

-- Parcelas que já existem.
update public.parcelas p set antes_do_app = true
  from public.parcelamentos pc
 where pc.id = p.parcelamento_id and coalesce(p.paga, false)
   and p.numero <= coalesce(pc.parcelas_pagas, 0)
   and p.data_vencimento < public.inicio_do_grupo_no_app(p.grupo_id)
   and not p.antes_do_app;

create index if not exists idx_parcelas_grupo_venc_app on public.parcelas (grupo_id, data_vencimento) where not antes_do_app;
