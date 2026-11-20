-- ============================================================
-- HopeFin — Migração 0077: dividir assinatura com outras pessoas (A8.6, 19/11/2026 noite)
--
-- a_receber.assinatura_id: a parte de outra pessoa numa assinatura sua — uma série "todo mês" por
-- pessoa, ligada à assinatura (apagou a assinatura → as partes somem junto). A fatura/o pagamento
-- continuam com o total; no seu gasto entra só a sua parte (motor).
-- garantir_series_grupo: os meses novos da série agora levam junto a ligação com a conta fixa
-- (A1.15 — antes só a 1ª linha tinha) e com a assinatura; série de assinatura que não está mais
-- ativa para de gerar. Resto da função igual à 0061. Idempotente.
-- ============================================================

alter table public.a_receber add column if not exists assinatura_id uuid references public.assinaturas(id) on delete cascade;
create index if not exists a_receber_assinatura_idx on public.a_receber(assinatura_id) where assinatura_id is not null;

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

  -- A receber que repete todo mês (com a ligação à conta fixa / assinatura)
  for s in
    select distinct on (serie_id) serie_id, grupo_id, pessoa_id, descricao, valor, data, recorrente, criado_por,
           conta_fixa_id, assinatura_id
      from public.a_receber
     where grupo_id = p_grupo and serie_id is not null
     order by serie_id, data desc, criado_em desc
  loop
    continue when not s.recorrente;
    -- assinatura cancelada ou removida: a parte dela para de repetir
    continue when s.assinatura_id is not null
      and not exists (select 1 from public.assinaturas a where a.id = s.assinatura_id and a.ativo);
    dia := extract(day from s.data);
    d := (date_trunc('month', s.data) + interval '1 month')::date;
    while d < limite loop
      insert into public.a_receber (grupo_id, pessoa_id, descricao, valor, data, recorrente, serie_id, criado_por, conta_fixa_id, assinatura_id)
      values (s.grupo_id, s.pessoa_id, s.descricao, s.valor,
              least(d + (dia - 1), (d + interval '1 month' - interval '1 day')::date), true, s.serie_id, s.criado_por,
              s.conta_fixa_id, s.assinatura_id);
      n := n + 1;
      d := (d + interval '1 month')::date;
    end loop;
  end loop;
  return n;
end; $$;
revoke all on function public.garantir_series_grupo(uuid, int) from public, anon, authenticated;
grant execute on function public.garantir_series_grupo(uuid, int) to service_role;
