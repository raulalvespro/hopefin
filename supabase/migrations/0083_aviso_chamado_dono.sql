-- 0083 — Aviso pro dono quando chega chamado novo (21/11/2026, "Depois disso" do Estado atual).
--
-- Até aqui o chamado aberto no app (0081) só aparecia no Painel › Suporte: ninguém era avisado.
-- Agora a Edge Function `suporte-aviso-dono` manda e-mail + notificação no celular pros admins.
-- Quem dispara: o cron `hopefin-suporte-aviso` (a cada 5 min, scripts/setup-cron.mjs), que SÓ chama
-- a função quando existe chamado sem aviso — nas outras vezes não faz nada.
--
-- aviso_dono_em: quando o dono foi avisado. A função marca ANTES de enviar (uma vez só por chamado).
-- Chamados antigos entram já marcados, pra não chover aviso do que já foi visto no painel.
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

alter table public.suporte_emails add column if not exists aviso_dono_em timestamptz;

comment on column public.suporte_emails.aviso_dono_em is
  'Quando o dono foi avisado (e-mail + push) do chamado novo do app — função suporte-aviso-dono';

update public.suporte_emails set aviso_dono_em = coalesce(recebido_em, now())
 where aviso_dono_em is null;

create index if not exists idx_suporte_emails_sem_aviso
  on public.suporte_emails (recebido_em) where aviso_dono_em is null and origem = 'app';
