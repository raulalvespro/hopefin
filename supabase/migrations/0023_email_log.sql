-- 0023_email_log — registro operacional de e-mails transacionais (Resend).
-- Base de idempotência dos crons de e-mail (fim de trial, vencimentos, resumo
-- mensal): o índice único (grupo_id, tipo, ref) impede reenviar o mesmo aviso.
-- É dado OPERACIONAL (não é lançamento das famílias): RLS ligada SEM policy
-- pública — ninguém lê via anon/authenticated; só a service_role (Edge Functions)
-- escreve e lê (service_role ignora RLS).

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid references public.grupos(id) on delete set null,
  titular_id uuid references public.usuarios(id) on delete set null,
  tipo text not null,                      -- ex.: 'fim_trial_2d', 'fim_trial_0d'
  ref text not null default '',            -- âncora de idempotência (ex.: data do fim do trial)
  destino text,
  assunto text,
  resend_id text,
  status text not null default 'enviado',  -- 'enviado' | 'erro'
  erro text,
  criado_em timestamptz not null default now()
);

-- Um aviso de cada tipo por grupo por referência (ex.: por data de fim de trial).
create unique index if not exists email_log_unq on public.email_log (grupo_id, tipo, ref);
create index if not exists email_log_grupo_idx on public.email_log (grupo_id, criado_em desc);

alter table public.email_log enable row level security;
-- (sem policy proposital: acesso só pela service_role das Edge Functions)
