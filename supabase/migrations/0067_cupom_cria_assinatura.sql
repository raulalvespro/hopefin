-- 0067_cupom_cria_assinatura.sql
-- Cupom (A6.1, item 5 — 19/11/2026): o resgate garante a assinatura do grupo.
--
-- Antes: se o grupo ainda não tinha a linha de assinatura (ex.: cupom resgatado logo no 1º acesso,
-- antes do iniciar_trial_familia), o cupom era GASTO (usos + 1 e cupom_resgates) mas a cortesia
-- não era aplicada, porque o update não achava linha nenhuma.
-- Agora cria a linha já como cortesia ativa ou atualiza a que existe (uma por grupo). O resto é
-- igual à 0054. O cupom saiu do cadastro e vem pelo link de parceiro /c/CODIGO (resgatado no 1º
-- acesso, no AuthContext) ou pelo Meu plano.
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

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

  -- Cortesia tira do trial: status='active' (igual admin_marcar_cortesia). Cria a linha se faltar.
  insert into public.subscriptions (grupo_id, titular_id, status, is_cortesia, cupom_codigo)
  values (g, auth.uid(), 'active', true, c.codigo)
  on conflict (grupo_id) do update
     set is_cortesia = true, cupom_codigo = excluded.cupom_codigo, status = 'active', atualizado_em = now();

  return json_build_object('ok', true, 'codigo', c.codigo,
                           'whatsapp_limite_mes', c.whatsapp_limite_mes);
end; $function$;
