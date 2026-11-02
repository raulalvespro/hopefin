-- 7: "pago" de itens que não têm estado próprio (faturas de cartão e assinaturas),
-- por competência. Contas fixas usam fixas_lancamentos.pago; parcelas usam parcelas.paga.
create table if not exists public.contas_pagas (
  id             uuid primary key default gen_random_uuid(),
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  tipo           text not null,                 -- 'fatura' | 'assinatura'
  referencia_id  uuid not null,                 -- cartao_id ou assinatura_id
  competencia    text not null,                 -- 'YYYY-MM'
  valor          numeric(12,2),
  pago           boolean not null default true,
  data_pagamento date,
  criado_em      timestamptz not null default now(),
  unique (tipo, referencia_id, competencia)
);
create index if not exists idx_contas_pagas_grupo_comp on public.contas_pagas(grupo_id, competencia);
alter table public.contas_pagas enable row level security;
drop policy if exists contas_pagas_todas on public.contas_pagas;
create policy contas_pagas_todas on public.contas_pagas
  for all to authenticated
  using (grupo_id = public.meu_grupo_id())
  with check (grupo_id = public.meu_grupo_id());
