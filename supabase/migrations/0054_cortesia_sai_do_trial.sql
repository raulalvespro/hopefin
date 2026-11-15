-- 0054_cortesia_sai_do_trial.sql
-- Bug: quem ativa cortesia POR CUPOM (resgatar_cupom) continuava com status='trial'.
-- Se o trial já tinha vencido, o app lia "assinatura vencida"/"trial vencido" mesmo
-- tendo acesso de cortesia. O caminho do admin (admin_marcar_cortesia) e o pagamento
-- (webhook Asaas) já colocavam status='active' — só o cupom esquecia.
--
-- Regra combinada: quem ativa cortesia OU assina antes do fim do trial NÃO está mais
-- em trial. Cortesia é representada como status='active' + is_cortesia=true (igual ao
-- que o admin já fazia; as métricas do painel já excluem is_cortesia de MRR/assinantes).
--
-- 1) resgatar_cupom passa a setar status='active' ao conceder cortesia (espelha admin).
-- 2) Normaliza as linhas de cortesia que ficaram presas fora de 'active'.
-- Idempotente.

-- 1) resgatar_cupom: ao conceder cortesia, sai do trial (status='active').
create or replace function public.resgatar_cupom(p_codigo text)
returns json language plpgsql security definer set search_path = public as $$
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

  -- Cortesia tira do trial: status='active' (igual admin_marcar_cortesia).
  update public.subscriptions
     set is_cortesia = true, cupom_codigo = c.codigo, status = 'active', atualizado_em = now()
   where grupo_id = g;

  return json_build_object('ok', true, 'codigo', c.codigo,
                           'whatsapp_limite_mes', c.whatsapp_limite_mes);
end; $$;
revoke all on function public.resgatar_cupom(text) from public;
grant execute on function public.resgatar_cupom(text) to authenticated;

-- 2) Conserta o passado: cortesias que ficaram presas em trial/expired/etc.
update public.subscriptions
   set status = 'active', atualizado_em = now()
 where is_cortesia
   and status is distinct from 'active';
