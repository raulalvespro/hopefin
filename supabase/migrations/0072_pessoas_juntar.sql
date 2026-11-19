-- 0072_pessoas_juntar.sql
-- Pessoas sem nome repetido (A8.5, 19/11/2026): a tela "Pessoas" (A receber) deixa renomear,
-- JUNTAR duplicadas ("Jack" + "Jacqueline" → uma só) e apagar quem não tem uso.
--
--  1) juntar_pessoas(manter, juntar[]): passa os gastos, parcelados e valores a receber das
--     pessoas de `juntar` pra `manter` e apaga as de `juntar` — tudo numa transação.
--  2) apagar_pessoa(p): só apaga quem NÃO tem nenhum lançamento. Apagar direto pela tabela é
--     perigoso: gastos/parcelamentos têm ON DELETE SET NULL (a compra viraria sua, mudando os
--     números) e a_receber tem ON DELETE CASCADE (o a receber sumiria).
--
-- As duas só mexem no grupo de quem chama (meu_grupo_id()) e nascem fechadas (0064):
-- grant só pra authenticated. Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

create or replace function public.juntar_pessoas(p_manter uuid, p_juntar uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g uuid := public.meu_grupo_id();
  v_juntar uuid[];
  n_g int; n_p int; n_a int; n_x int;
begin
  if g is null then raise exception 'sem_grupo'; end if;
  select array_agg(distinct x) into v_juntar from unnest(coalesce(p_juntar, '{}')) x where x is not null;
  if p_manter is null or v_juntar is null or cardinality(v_juntar) = 0 then raise exception 'nada_pra_juntar'; end if;
  if p_manter = any(v_juntar) then raise exception 'mesma_pessoa'; end if;
  if not exists (select 1 from public.pessoas where id = p_manter and grupo_id = g) then raise exception 'pessoa_invalida'; end if;
  if (select count(*) from public.pessoas where id = any(v_juntar) and grupo_id = g) <> cardinality(v_juntar) then
    raise exception 'pessoa_invalida';
  end if;

  update public.gastos        set pessoa_id = p_manter where grupo_id = g and pessoa_id = any(v_juntar);
  get diagnostics n_g = row_count;
  update public.parcelamentos set pessoa_id = p_manter where grupo_id = g and pessoa_id = any(v_juntar);
  get diagnostics n_p = row_count;
  update public.a_receber     set pessoa_id = p_manter where grupo_id = g and pessoa_id = any(v_juntar);
  get diagnostics n_a = row_count;
  delete from public.pessoas where grupo_id = g and id = any(v_juntar);
  get diagnostics n_x = row_count;

  return jsonb_build_object('gastos', n_g, 'parcelados', n_p, 'a_receber', n_a, 'removidas', n_x);
end $$;

create or replace function public.apagar_pessoa(p_pessoa uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare g uuid := public.meu_grupo_id();
begin
  if g is null then raise exception 'sem_grupo'; end if;
  if not exists (select 1 from public.pessoas where id = p_pessoa and grupo_id = g) then raise exception 'pessoa_invalida'; end if;
  if exists (select 1 from public.gastos where pessoa_id = p_pessoa)
     or exists (select 1 from public.parcelamentos where pessoa_id = p_pessoa)
     or exists (select 1 from public.a_receber where pessoa_id = p_pessoa) then
    raise exception 'pessoa_em_uso';
  end if;
  delete from public.pessoas where id = p_pessoa and grupo_id = g;
  return true;
end $$;

revoke all on function public.juntar_pessoas(uuid, uuid[]) from public, anon;
revoke all on function public.apagar_pessoa(uuid) from public, anon;
grant execute on function public.juntar_pessoas(uuid, uuid[]) to authenticated;
grant execute on function public.apagar_pessoa(uuid) to authenticated;
