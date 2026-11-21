-- 0084 — Cupom de DESCONTO (A6.1 item 4, 21/11/2026, pedido do Raul).
--
-- Até aqui todo cupom era cortesia (grupo usa de graça). Agora o painel cria também cupom de desconto:
--   tipo 'desconto' + desconto_pct (1 a 90 %), com o mesmo "Resgate até" (prazo), máx. de usos e
--   ativar/desativar. O valor do desconto é informado na criação (e pode ser editado).
-- Como funciona pra pessoa: resgata no "Meu plano" (ou pelo link /c/CODIGO) → o desconto fica guardado
--   no grupo (cupom_resgates, 1 cupom por grupo, como já era) → o Meu plano e o checkout mostram os
--   preços com desconto → a cobrança no Asaas sai com desconto (asaas-assinar) e o preço fica TRAVADO
--   nas renovações, como já acontece com o preço de lançamento (preco_centavos).
-- O desconto NÃO tira do teste e não mexe na assinatura no resgate: só vale quando a pessoa assinar.
-- A conta do desconto fica em supabase/functions/_shared/desconto.js (a mesma no app e no servidor).
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

-- 1) Tipo e valor --------------------------------------------------------------------------------
alter table public.cupons drop constraint if exists cupons_tipo_check;
alter table public.cupons add constraint cupons_tipo_check check (tipo in ('cortesia', 'desconto'));
alter table public.cupons add column if not exists desconto_pct int;
do $$ begin
  alter table public.cupons add constraint cupons_desconto_check check (
    (tipo = 'cortesia' and desconto_pct is null) or
    (tipo = 'desconto' and desconto_pct between 1 and 90));
exception when duplicate_object then null; end $$;
comment on column public.cupons.desconto_pct is 'Só no tipo desconto: % tirado do preço do plano na hora de assinar (1 a 90)';

-- 2) Painel: salvar com tipo e desconto -----------------------------------------------------------
-- Assinatura nova (7 parâmetros). A antiga (5) sai — o painel passa a chamar esta.
drop function if exists public.admin_salvar_cupom(text, int, date, int, boolean);
create or replace function public.admin_salvar_cupom(
  p_codigo text, p_max_usos int default 50, p_resgate_ate date default null,
  p_whatsapp_limite_mes int default 100, p_ativo boolean default true,
  p_tipo text default 'cortesia', p_desconto_pct int default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  cod  text := upper(btrim(coalesce(p_codigo, '')));
  tipo text := case when lower(coalesce(p_tipo, '')) = 'desconto' then 'desconto' else 'cortesia' end;
  pct  int  := case when lower(coalesce(p_tipo, '')) = 'desconto' then p_desconto_pct else null end;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  if cod = '' then raise exception 'codigo_vazio' using errcode = 'P0001'; end if;
  if cod !~ '^[A-Z0-9_-]{3,30}$' then raise exception 'codigo_invalido' using errcode = 'P0001'; end if;
  if tipo = 'desconto' and (pct is null or pct < 1 or pct > 90) then
    raise exception 'desconto_invalido' using errcode = 'P0001';
  end if;
  -- Já resgatado: não troca o tipo (quem resgatou cortesia não vira desconto e vice-versa).
  if exists (select 1 from public.cupons c where c.codigo = cod and c.tipo <> tipo and c.usos > 0) then
    raise exception 'tipo_travado' using errcode = 'P0001';
  end if;
  insert into public.cupons (codigo, tipo, desconto_pct, max_usos, resgate_ate, whatsapp_limite_mes, ativo)
    values (cod, tipo, pct, greatest(coalesce(p_max_usos, 1), 1), p_resgate_ate, greatest(coalesce(p_whatsapp_limite_mes, 0), 0), coalesce(p_ativo, true))
  on conflict (codigo) do update set
    tipo = excluded.tipo, desconto_pct = excluded.desconto_pct,
    max_usos = excluded.max_usos, resgate_ate = excluded.resgate_ate,
    whatsapp_limite_mes = excluded.whatsapp_limite_mes, ativo = excluded.ativo;
  insert into public.admin_log (admin_id, acao, motivo, detalhe)
    values (auth.uid(), 'salvar_cupom', null,
            json_build_object('codigo', cod, 'tipo', tipo, 'desconto_pct', pct, 'ativo', coalesce(p_ativo, true)));
  return json_build_object('ok', true, 'codigo', cod, 'tipo', tipo);
end; $$;
revoke all on function public.admin_salvar_cupom(text, int, date, int, boolean, text, int) from public, anon, authenticated;
grant execute on function public.admin_salvar_cupom(text, int, date, int, boolean, text, int) to authenticated;

-- 3) Resgate: cortesia segue igual (0067); desconto só guarda o cupom no grupo ---------------------
create or replace function public.resgatar_cupom(p_codigo text)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  g uuid := public.meu_grupo_id();
  cod text := upper(btrim(coalesce(p_codigo, '')));
  c public.cupons;
begin
  if g is null then raise exception 'usuario_sem_grupo' using errcode = 'P0001'; end if;
  if cod = '' then raise exception 'cupom_invalido' using errcode = 'P0001'; end if;
  if exists (select 1 from public.cupom_resgates where grupo_id = g) then
    raise exception 'grupo_ja_resgatou' using errcode = 'P0001';
  end if;

  update public.cupons
     set usos = usos + 1
   where codigo = cod
     and ativo
     and (resgate_ate is null or resgate_ate >= current_date)
     and usos < max_usos
  returning * into c;

  if not found then
    raise exception 'cupom_invalido' using errcode = 'P0001';
  end if;

  insert into public.cupom_resgates (grupo_id, cupom_codigo, usuario_id)
  values (g, c.codigo, auth.uid());

  if c.tipo = 'desconto' then
    -- Só guarda: o desconto entra quando a pessoa assinar (asaas-assinar lê cupom_resgates).
    return json_build_object('ok', true, 'codigo', c.codigo, 'tipo', 'desconto', 'desconto_pct', c.desconto_pct);
  end if;

  -- Cortesia tira do trial: status='active' (igual admin_marcar_cortesia). Cria a linha se faltar.
  insert into public.subscriptions (grupo_id, titular_id, status, is_cortesia, cupom_codigo)
  values (g, auth.uid(), 'active', true, c.codigo)
  on conflict (grupo_id) do update
     set is_cortesia = true, cupom_codigo = excluded.cupom_codigo, status = 'active', atualizado_em = now();

  return json_build_object('ok', true, 'codigo', c.codigo, 'tipo', 'cortesia',
                           'whatsapp_limite_mes', c.whatsapp_limite_mes);
end; $function$;
revoke all on function public.resgatar_cupom(text) from public, anon, authenticated;
grant execute on function public.resgatar_cupom(text) to authenticated;

-- 4) O desconto guardado do meu grupo (Meu plano e checkout) --------------------------------------
create or replace function public.meu_desconto()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('codigo', c.codigo, 'desconto_pct', c.desconto_pct)
    from public.cupom_resgates r
    join public.cupons c on c.codigo = r.cupom_codigo
   where r.grupo_id = public.meu_grupo_id() and c.tipo = 'desconto' and c.desconto_pct is not null;
$$;
revoke all on function public.meu_desconto() from public, anon, authenticated;
grant execute on function public.meu_desconto() to authenticated;
