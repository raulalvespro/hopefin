-- 0053_encerrar_trials_vencidos.sql
-- Fecha o buraco: um trial que vence sem virar pagante ficava como 'trial' para
-- sempre. Nada no sistema escrevia status='expired' — o fim-de-trial só mandava
-- e-mail, o webhook do Asaas só age em pagamento, e estender_trial faz o oposto
-- (expired -> trial). Isso não é furo de cobrança (grupo_pode_lancar() já bloqueia
-- por DATA: trial com trial_ends_at <= now() cai em "else false"), mas distorce as
-- contagens do painel (conta como trial ativo), mantém o alerta de saúde apontando
-- e deixa o status do grupo errado.
--
-- encerrar_trials_vencidos(): marca 'expired' os trials já vencidos (espelha
-- encerrar_assinaturas_canceladas da 0027). Idempotente. Chamada pelo cron diário
-- (fim-de-trial), best-effort.
--
-- Seguro por construção:
--   - Só mexe em status = 'trial' com trial_ends_at NÃO nulo e já passado.
--     trial_ends_at nulo = legado/sem prazo (grupo_pode_lancar trata como válido) -> não toca.
--   - Pula cortesia (is_cortesia): cortesia pode lançar para sempre, independente de data/status.
--   - 'expired' já era o estado final pretendido; grupo_pode_lancar trata igual ao de hoje
--     (vencido já caía em "else false"); estender_trial ainda revive (expired -> trial);
--     um pagamento posterior ainda vira 'active' pelo webhook.

create or replace function public.encerrar_trials_vencidos()
returns integer language sql security definer set search_path = public as $$
  with u as (
    update public.subscriptions
       set status = 'expired', atualizado_em = now()
     where status = 'trial'
       and not coalesce(is_cortesia, false)
       and trial_ends_at is not null
       and trial_ends_at <= now()
    returning 1
  )
  select count(*)::int from u;
$$;
revoke all on function public.encerrar_trials_vencidos() from public;
grant execute on function public.encerrar_trials_vencidos() to service_role;
