-- 0087 — Excluir cupom no painel (21/11/2026, pedido do Raul).
-- Só apaga cupom que NINGUÉM usou (usos = 0 e sem resgate). Cupom já usado fica guardado, porque
-- está ligado ao grupo que resgatou (cortesia ou desconto travado); pra esse, o caminho é desativar.
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

create or replace function public.admin_excluir_cupom(p_codigo text)
returns json language plpgsql security definer set search_path = public as $$
declare
  cod text := upper(btrim(coalesce(p_codigo, '')));
  c public.cupons;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select * into c from public.cupons where codigo = cod;
  if not found then raise exception 'cupom_nao_existe' using errcode = 'P0001'; end if;
  if c.usos > 0 or exists (select 1 from public.cupom_resgates r where r.cupom_codigo = cod) then
    raise exception 'cupom_usado' using errcode = 'P0001';
  end if;
  delete from public.cupons where codigo = cod;
  insert into public.admin_log (admin_id, acao, motivo, detalhe)
    values (auth.uid(), 'excluir_cupom', null, json_build_object('codigo', cod, 'tipo', c.tipo, 'desconto_pct', c.desconto_pct));
  return json_build_object('ok', true, 'codigo', cod);
end $$;
revoke all on function public.admin_excluir_cupom(text) from public, anon, authenticated;
grant execute on function public.admin_excluir_cupom(text) to authenticated;
