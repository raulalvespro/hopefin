-- 0085 — Correção da 0084 (21/11/2026): salvar cupom dava "column reference \"tipo\" is ambiguous".
-- As variáveis da função admin_salvar_cupom tinham o mesmo nome das colunas da tabela cupons (tipo).
-- Agora são v_tipo e v_pct. O resto é igual à 0084.
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

create or replace function public.admin_salvar_cupom(
  p_codigo text, p_max_usos int default 50, p_resgate_ate date default null,
  p_whatsapp_limite_mes int default 100, p_ativo boolean default true,
  p_tipo text default 'cortesia', p_desconto_pct int default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  cod  text := upper(btrim(coalesce(p_codigo, '')));
  v_tipo text := case when lower(coalesce(p_tipo, '')) = 'desconto' then 'desconto' else 'cortesia' end;
  v_pct  int  := case when lower(coalesce(p_tipo, '')) = 'desconto' then p_desconto_pct else null end;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  if cod = '' then raise exception 'codigo_vazio' using errcode = 'P0001'; end if;
  if cod !~ '^[A-Z0-9_-]{3,30}$' then raise exception 'codigo_invalido' using errcode = 'P0001'; end if;
  if v_tipo = 'desconto' and (v_pct is null or v_pct < 1 or v_pct > 90) then
    raise exception 'desconto_invalido' using errcode = 'P0001';
  end if;
  -- Já resgatado: não troca o tipo (quem resgatou cortesia não vira desconto e vice-versa).
  if exists (select 1 from public.cupons c where c.codigo = cod and c.tipo <> v_tipo and c.usos > 0) then
    raise exception 'tipo_travado' using errcode = 'P0001';
  end if;
  insert into public.cupons (codigo, tipo, desconto_pct, max_usos, resgate_ate, whatsapp_limite_mes, ativo)
    values (cod, v_tipo, v_pct, greatest(coalesce(p_max_usos, 1), 1), p_resgate_ate, greatest(coalesce(p_whatsapp_limite_mes, 0), 0), coalesce(p_ativo, true))
  on conflict (codigo) do update set
    tipo = excluded.tipo, desconto_pct = excluded.desconto_pct,
    max_usos = excluded.max_usos, resgate_ate = excluded.resgate_ate,
    whatsapp_limite_mes = excluded.whatsapp_limite_mes, ativo = excluded.ativo;
  insert into public.admin_log (admin_id, acao, motivo, detalhe)
    values (auth.uid(), 'salvar_cupom', null,
            json_build_object('codigo', cod, 'tipo', v_tipo, 'desconto_pct', v_pct, 'ativo', coalesce(p_ativo, true)));
  return json_build_object('ok', true, 'codigo', cod, 'tipo', v_tipo);
end; $$;
revoke all on function public.admin_salvar_cupom(text, int, date, int, boolean, text, int) from public, anon, authenticated;
grant execute on function public.admin_salvar_cupom(text, int, date, int, boolean, text, int) to authenticated;
