-- 0061_onda1_base.sql
-- Onda 1 (16/11/2026) — dados que o motor único de cálculo precisa. Tudo ADITIVO:
-- nenhuma tela antiga quebra com esta migração (as colunas novas têm padrão).
--
--  1) cartoes.compra_no_fechamento  — compra feita NO dia do fechamento cai na
--     'proxima' fatura (padrão dos bancos: é o "melhor dia de compra") ou na 'atual'.
--  2) assinaturas.cobrada_desde      — a assinatura só entra nas faturas a partir
--     dessa data (padrão: 1º dia do mês em que foi cadastrada). Evita contar 2x o
--     que já tinha sido lançado à mão antes de cadastrar a assinatura.
--  3) entradas.serie_id + origem     — entradas recorrentes viram uma SÉRIE com um
--     lançamento por mês (pendente até marcar recebido); origem identifica
--     reembolso / saldo do mês anterior.
--  4) a_receber                      — valores a receber lançados à mão e ligados a
--     uma pessoa (ex.: parte da Jacqueline no aluguel), com "repete todo mês".
--  5) reembolso automático           — receber_de_pessoa() marca os itens que a
--     pessoa pagou e lança UMA entrada com o total; desfazer_recebimento() desfaz.
--  6) viradas_mes                    — o que fazer com a sobra quando o mês vira
--     (somar no mês seguinte / guardar num cofrinho / nada).
--  7) orcamentos.pago_com            — 'auto' | 'cartao' | 'avista' (linha
--     "separando o orçamento" no Início considera só o que é pago à vista).
--  8) garantir_series()              — cria os lançamentos futuros das séries
--     (entradas recorrentes e a receber que repetem), 12 meses à frente.
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

-- 1) Regra do dia do fechamento ------------------------------------------------
alter table public.cartoes
  add column if not exists compra_no_fechamento text not null default 'proxima';
do $$ begin
  alter table public.cartoes add constraint cartoes_compra_no_fechamento_chk
    check (compra_no_fechamento in ('proxima', 'atual'));
exception when duplicate_object then null; end $$;

-- 2) Assinatura: a partir de quando entra na fatura -----------------------------
alter table public.assinaturas add column if not exists cobrada_desde date;
update public.assinaturas set cobrada_desde = date_trunc('month', criado_em)::date
 where cobrada_desde is null;
alter table public.assinaturas alter column cobrada_desde set default (date_trunc('month', current_date)::date);

-- 3) Entradas: série + origem ----------------------------------------------------
alter table public.entradas add column if not exists serie_id uuid;
alter table public.entradas add column if not exists origem text not null default 'manual';
do $$ begin
  alter table public.entradas add constraint entradas_origem_chk
    check (origem in ('manual', 'recorrente', 'reembolso', 'saldo_anterior'));
exception when duplicate_object then null; end $$;
create index if not exists entradas_serie_idx on public.entradas (grupo_id, serie_id) where serie_id is not null;

-- As recorrentes que já existem viram séries: uma por (grupo, descrição, pessoa).
with chaves as (
  select grupo_id, descricao, usuario_id, gen_random_uuid() as sid
    from (select distinct grupo_id, descricao, usuario_id from public.entradas
           where recorrente and serie_id is null) d
)
update public.entradas e
   set serie_id = c.sid, origem = 'recorrente'
  from chaves c
 where e.recorrente and e.serie_id is null
   and e.grupo_id = c.grupo_id and e.descricao = c.descricao
   and e.usuario_id is not distinct from c.usuario_id;

-- 4) A receber manual (ligado a uma pessoa) --------------------------------------
create table if not exists public.a_receber (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  pessoa_id   uuid not null references public.pessoas(id) on delete cascade,
  descricao   text not null,
  valor       numeric(12,2) not null check (valor > 0),
  data        date not null default current_date,   -- mês em que vai cobrar
  recorrente  boolean not null default false,        -- "repete todo mês"
  serie_id    uuid,
  recebido    boolean not null default false,
  recebido_em date,
  entrada_id  uuid references public.entradas(id) on delete set null,
  criado_por  uuid default auth.uid(),
  criado_em   timestamptz not null default now()
);
create index if not exists a_receber_grupo_idx on public.a_receber (grupo_id, pessoa_id, data);
alter table public.a_receber enable row level security;
drop policy if exists a_receber_todas on public.a_receber;
create policy a_receber_todas on public.a_receber for all to authenticated
  using (grupo_id = public.meu_grupo_id()) with check (grupo_id = public.meu_grupo_id());

-- 5) Reembolso automático ---------------------------------------------------------
alter table public.gastos   add column if not exists reembolso_entrada_id uuid references public.entradas(id) on delete set null;
alter table public.parcelas add column if not exists reembolso_entrada_id uuid references public.entradas(id) on delete set null;

-- Marca como recebido o que a pessoa pagou (compras à vista, parcelas e a receber
-- manuais) e, se pedido, lança UMA entrada com o total (origem 'reembolso').
create or replace function public.receber_de_pessoa(
  p_pessoa uuid, p_gastos uuid[], p_parcelas uuid[], p_a_receber uuid[],
  p_criar_entrada boolean default true, p_data date default current_date)
returns json language plpgsql security definer set search_path = public as $$
declare
  g uuid := public.meu_grupo_id();
  v_nome text; v_total numeric := 0; v_n int := 0; v_entrada uuid; v_x numeric; v_c int;
begin
  if g is null then raise exception 'usuario_sem_grupo' using errcode = 'P0001'; end if;
  select nome into v_nome from public.pessoas where id = p_pessoa and grupo_id = g;
  if v_nome is null then raise exception 'pessoa_invalida' using errcode = 'P0001'; end if;

  select coalesce(sum(valor), 0), count(*) into v_x, v_c from public.gastos
   where id = any(coalesce(p_gastos, '{}')) and grupo_id = g and pessoa_id = p_pessoa
     and coalesce(reembolso_status, 'pendente') <> 'quitado';
  v_total := v_total + v_x; v_n := v_n + v_c;
  select coalesce(sum(pr.valor), 0), count(*) into v_x, v_c
    from public.parcelas pr join public.parcelamentos pm on pm.id = pr.parcelamento_id
   where pr.id = any(coalesce(p_parcelas, '{}')) and pr.grupo_id = g and pm.pessoa_id = p_pessoa and not pr.recebido;
  v_total := v_total + v_x; v_n := v_n + v_c;
  select coalesce(sum(valor), 0), count(*) into v_x, v_c from public.a_receber
   where id = any(coalesce(p_a_receber, '{}')) and grupo_id = g and pessoa_id = p_pessoa and not recebido;
  v_total := v_total + v_x; v_n := v_n + v_c;

  if v_n = 0 then raise exception 'nada_a_receber' using errcode = 'P0001'; end if;

  if coalesce(p_criar_entrada, true) then
    insert into public.entradas (grupo_id, usuario_id, descricao, valor, tipo, recorrente, recebido, data_recebimento, data, origem)
    values (g, auth.uid(), left('Reembolso · ' || v_nome || ' (' || v_n || case when v_n = 1 then ' item)' else ' itens)' end, 120),
            v_total, 'avulso', false, true, coalesce(p_data, current_date), coalesce(p_data, current_date), 'reembolso')
    returning id into v_entrada;
  end if;

  update public.gastos set reembolso_status = 'quitado', reembolso_quitado_em = coalesce(p_data, current_date),
         reembolso_entrada_id = v_entrada
   where id = any(coalesce(p_gastos, '{}')) and grupo_id = g and pessoa_id = p_pessoa
     and coalesce(reembolso_status, 'pendente') <> 'quitado';
  update public.parcelas pr set recebido = true, reembolso_entrada_id = v_entrada
    from public.parcelamentos pm
   where pm.id = pr.parcelamento_id and pr.id = any(coalesce(p_parcelas, '{}'))
     and pr.grupo_id = g and pm.pessoa_id = p_pessoa and not pr.recebido;
  update public.a_receber set recebido = true, recebido_em = coalesce(p_data, current_date), entrada_id = v_entrada
   where id = any(coalesce(p_a_receber, '{}')) and grupo_id = g and pessoa_id = p_pessoa and not recebido;

  return json_build_object('entrada_id', v_entrada, 'total', v_total, 'itens', v_n);
end; $$;
revoke all on function public.receber_de_pessoa(uuid, uuid[], uuid[], uuid[], boolean, date) from public;
grant execute on function public.receber_de_pessoa(uuid, uuid[], uuid[], uuid[], boolean, date) to authenticated;

-- Desfaz um recebimento: reabre os itens ligados à entrada e apaga a entrada de reembolso.
create or replace function public.desfazer_recebimento(p_entrada uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid := public.meu_grupo_id();
begin
  if g is null then raise exception 'usuario_sem_grupo' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.entradas where id = p_entrada and grupo_id = g and origem = 'reembolso') then
    raise exception 'recebimento_invalido' using errcode = 'P0001';
  end if;
  update public.gastos set reembolso_status = 'pendente', reembolso_quitado_em = null, reembolso_entrada_id = null
   where reembolso_entrada_id = p_entrada and grupo_id = g;
  update public.parcelas set recebido = false, reembolso_entrada_id = null
   where reembolso_entrada_id = p_entrada and grupo_id = g;
  update public.a_receber set recebido = false, recebido_em = null, entrada_id = null
   where entrada_id = p_entrada and grupo_id = g;
  delete from public.entradas where id = p_entrada and grupo_id = g;
end; $$;
revoke all on function public.desfazer_recebimento(uuid) from public;
grant execute on function public.desfazer_recebimento(uuid) to authenticated;

-- 6) Virada do mês ----------------------------------------------------------------
create table if not exists public.viradas_mes (
  id               uuid primary key default gen_random_uuid(),
  grupo_id         uuid not null references public.grupos(id) on delete cascade,
  competencia      text not null check (competencia ~ '^\d{4}-\d{2}$'),  -- mês que fechou
  saldo            numeric(12,2) not null,
  destino          text not null check (destino in ('proximo_mes', 'cofrinho', 'nenhum')),
  cofrinho_id      uuid references public.cofrinhos(id) on delete set null,
  entrada_id       uuid references public.entradas(id) on delete set null,
  transferencia_id uuid references public.transferencias(id) on delete set null,
  decidido_por     uuid default auth.uid(),
  decidido_em      timestamptz not null default now(),
  unique (grupo_id, competencia)
);
alter table public.viradas_mes enable row level security;
drop policy if exists viradas_mes_todas on public.viradas_mes;
create policy viradas_mes_todas on public.viradas_mes for all to authenticated
  using (grupo_id = public.meu_grupo_id()) with check (grupo_id = public.meu_grupo_id());

-- Registra a decisão e faz o lançamento correspondente (uma vez por mês por grupo).
--   proximo_mes: entrada "Saldo de <mês>" no dia 1º do mês seguinte (negativo também)
--   cofrinho:    aporte no cofrinho no último dia do mês que fechou (só saldo positivo)
--   nenhum:      só registra
create or replace function public.decidir_virada(
  p_competencia text, p_saldo numeric, p_destino text, p_cofrinho uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  g uuid := public.meu_grupo_id();
  ini date; prox date; ultimo date; v_entrada uuid; v_transf uuid;
  meses text[] := array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
begin
  if g is null then raise exception 'usuario_sem_grupo' using errcode = 'P0001'; end if;
  if p_competencia !~ '^\d{4}-\d{2}$' then raise exception 'competencia_invalida' using errcode = 'P0001'; end if;
  if p_destino not in ('proximo_mes', 'cofrinho', 'nenhum') then raise exception 'destino_invalido' using errcode = 'P0001'; end if;
  if exists (select 1 from public.viradas_mes where grupo_id = g and competencia = p_competencia) then
    raise exception 'ja_decidido' using errcode = 'P0001';
  end if;
  ini := to_date(p_competencia || '-01', 'YYYY-MM-DD');
  prox := (ini + interval '1 month')::date;
  ultimo := (prox - interval '1 day')::date;

  if p_destino = 'proximo_mes' and coalesce(p_saldo, 0) <> 0 then
    insert into public.entradas (grupo_id, usuario_id, descricao, valor, tipo, recorrente, recebido, data_recebimento, data, origem)
    values (g, auth.uid(), 'Saldo de ' || meses[extract(month from ini)::int], p_saldo, 'avulso', false, true, prox, prox, 'saldo_anterior')
    returning id into v_entrada;
  elsif p_destino = 'cofrinho' then
    if p_cofrinho is null or not exists (select 1 from public.cofrinhos where id = p_cofrinho and grupo_id = g) then
      raise exception 'cofrinho_invalido' using errcode = 'P0001';
    end if;
    if coalesce(p_saldo, 0) <= 0 then raise exception 'saldo_nao_positivo' using errcode = 'P0001'; end if;
    insert into public.transferencias (grupo_id, usuario_id, cofrinho_id, valor, descricao, data)
    values (g, auth.uid(), p_cofrinho, p_saldo, 'Sobra de ' || meses[extract(month from ini)::int], ultimo)
    returning id into v_transf;
  end if;

  insert into public.viradas_mes (grupo_id, competencia, saldo, destino, cofrinho_id, entrada_id, transferencia_id)
  values (g, p_competencia, coalesce(p_saldo, 0), p_destino, p_cofrinho, v_entrada, v_transf);
  return json_build_object('ok', true, 'entrada_id', v_entrada, 'transferencia_id', v_transf);
end; $$;
revoke all on function public.decidir_virada(text, numeric, text, uuid) from public;
grant execute on function public.decidir_virada(text, numeric, text, uuid) to authenticated;

-- 7) Orçamento: como costuma ser pago ----------------------------------------------
alter table public.orcamentos add column if not exists pago_com text not null default 'auto';
do $$ begin
  alter table public.orcamentos add constraint orcamentos_pago_com_chk check (pago_com in ('auto', 'cartao', 'avista'));
exception when duplicate_object then null; end $$;

-- 8) Séries: garante os lançamentos dos próximos meses ------------------------------
-- Para cada série ATIVA (o lançamento mais recente ainda marcado como recorrente),
-- cria um lançamento por mês, no mesmo dia (ajustado ao fim do mês), até
-- `p_meses` meses à frente do mês atual. Pendentes até a pessoa marcar.
create or replace function public.garantir_series_grupo(p_grupo uuid, p_meses int default 12)
returns int language plpgsql security definer set search_path = public as $$
declare
  limite date := (date_trunc('month', current_date) + make_interval(months => greatest(p_meses, 1)))::date; -- exclusivo
  s record; d date; n int := 0; dia int;
begin
  -- Entradas recorrentes
  for s in
    select distinct on (serie_id) serie_id, grupo_id, usuario_id, descricao, valor, tipo, data, recorrente
      from public.entradas
     where grupo_id = p_grupo and serie_id is not null
     order by serie_id, data desc, criado_em desc
  loop
    continue when not s.recorrente;
    dia := extract(day from s.data);
    d := (date_trunc('month', s.data) + interval '1 month')::date;
    while d < limite loop
      insert into public.entradas (grupo_id, usuario_id, descricao, valor, tipo, recorrente, recebido, data, serie_id, origem)
      values (s.grupo_id, s.usuario_id, s.descricao, s.valor, s.tipo, true, false,
              least(d + (dia - 1), (d + interval '1 month' - interval '1 day')::date), s.serie_id, 'recorrente');
      n := n + 1;
      d := (d + interval '1 month')::date;
    end loop;
  end loop;

  -- A receber que repete todo mês
  for s in
    select distinct on (serie_id) serie_id, grupo_id, pessoa_id, descricao, valor, data, recorrente, criado_por
      from public.a_receber
     where grupo_id = p_grupo and serie_id is not null
     order by serie_id, data desc, criado_em desc
  loop
    continue when not s.recorrente;
    dia := extract(day from s.data);
    d := (date_trunc('month', s.data) + interval '1 month')::date;
    while d < limite loop
      insert into public.a_receber (grupo_id, pessoa_id, descricao, valor, data, recorrente, serie_id, criado_por)
      values (s.grupo_id, s.pessoa_id, s.descricao, s.valor,
              least(d + (dia - 1), (d + interval '1 month' - interval '1 day')::date), true, s.serie_id, s.criado_por);
      n := n + 1;
      d := (d + interval '1 month')::date;
    end loop;
  end loop;
  return n;
end; $$;
revoke all on function public.garantir_series_grupo(uuid, int) from public;
grant execute on function public.garantir_series_grupo(uuid, int) to service_role;

-- Versão do app (o próprio grupo).
create or replace function public.garantir_series()
returns int language plpgsql security definer set search_path = public as $$
declare g uuid := public.meu_grupo_id();
begin
  if g is null then return 0; end if;
  return public.garantir_series_grupo(g, 12);
end; $$;
revoke all on function public.garantir_series() from public;
grant execute on function public.garantir_series() to authenticated;

-- Uma vez agora pra todos os grupos (as séries que já existem ganham os próximos meses).
do $$ declare r record; begin
  for r in select id from public.grupos loop perform public.garantir_series_grupo(r.id, 12); end loop;
end $$;
