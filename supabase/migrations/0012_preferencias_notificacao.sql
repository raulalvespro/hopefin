-- 12: preferências de notificação por grupo.
-- Uma linha por grupo; ausência = tudo ligado (padrões abaixo).
-- Liga/desliga cada tipo de alerta do sininho + janela padrão de antecedência
-- usada pelos alertas sem ajuste próprio (parcelas e assinaturas).
create table if not exists public.preferencias_notificacao (
  grupo_id            uuid primary key references public.grupos(id) on delete cascade,
  alertar_vencimentos boolean not null default true,
  alertar_fatura      boolean not null default true,
  alertar_orcamento   boolean not null default true,
  alertar_metas       boolean not null default true,
  alertar_projecao    boolean not null default true,
  dias_padrao         int     not null default 7,
  atualizado_em       timestamptz not null default now()
);

alter table public.preferencias_notificacao enable row level security;
drop policy if exists preferencias_notificacao_todas on public.preferencias_notificacao;
create policy preferencias_notificacao_todas on public.preferencias_notificacao
  for all to authenticated
  using (grupo_id = public.meu_grupo_id())
  with check (grupo_id = public.meu_grupo_id());
