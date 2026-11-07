-- 0027_cancelamento_assinatura.sql
-- Cancelamento pelo próprio usuário (Configurações → Assinatura).
--
-- Regra: ao cancelar, o acesso segue até o fim do período já pago e NÃO há novas
-- cobranças (a Edge Function asaas-cancelar apaga a assinatura e as cobranças
-- em aberto no Asaas). Aqui no banco:
--   1) grupo_pode_lancar(): assinatura 'active' com cancel_at_period_end = true
--      só pode lançar até current_period_end.
--   2) encerrar_assinaturas_canceladas(): vira status 'canceled' o que já passou do
--      fim do período (para o /admin e relatórios pararem de contar como ativo).
--      Chamada pelo cron diário (função fim-de-trial). Idempotente.
-- Colunas cancel_at_period_end / canceled_at já existem (0016/0017).

create or replace function public.grupo_pode_lancar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when s.is_cortesia then true
      when s.status = 'active'
           and (not s.cancel_at_period_end
                or s.current_period_end is null
                or s.current_period_end > now()) then true
      when s.status = 'trial' and (s.trial_ends_at is null or s.trial_ends_at > now()) then true
      else false
    end
    from public.subscriptions s where s.grupo_id = public.meu_grupo_id()
  ), true);
$$;
revoke all on function public.grupo_pode_lancar() from public;
grant execute on function public.grupo_pode_lancar() to authenticated;

create or replace function public.encerrar_assinaturas_canceladas()
returns integer language sql security definer set search_path = public as $$
  with u as (
    update public.subscriptions
       set status = 'canceled', atualizado_em = now()
     where status = 'active'
       and cancel_at_period_end
       and current_period_end is not null
       and current_period_end <= now()
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function public.encerrar_assinaturas_canceladas() from public;
grant execute on function public.encerrar_assinaturas_canceladas() to service_role;
