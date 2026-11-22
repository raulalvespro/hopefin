-- 0120_financiamentos.sql — Módulo de Financiamentos (22/11/2026, ok do Raul).
--
-- Financiamento (imóvel, carro, consignado, empréstimo pessoal...) = 1 parcelamento SEM cartão
-- (as parcelas: já entram no motor, em Contas do mês, Projeção, alertas e pendências, sem mexer
-- no motor) + 1 linha nesta tabela com a "ficha": banco, tipo, valor financiado, entrada,
-- sistema (Price/SAC/parcela fixa), juros, de quem é.
-- Apagou o parcelamento → a ficha some junto (cascade). Apagar a ficha não apaga as parcelas:
-- o app sempre apaga pelo parcelamento.
--
-- Chave de recurso 'financiamentos' com audiência 'dono' (como 'ajuda' na 0080): só o Raul vê
-- até liberar pra todos na Área de desenvolvimento do painel.
--
-- Sem função nova. Idempotente. DDL só via scripts/db.mjs; backup antes + smoke depois.

create table if not exists public.financiamentos (
  id                uuid primary key default gen_random_uuid(),
  grupo_id          uuid not null references public.grupos(id) on delete cascade,
  parcelamento_id   uuid not null unique references public.parcelamentos(id) on delete cascade,
  tipo              text not null default 'outro'
                    check (tipo in ('imovel','carro','consignado','pessoal','estudantil','outro')),
  banco             text,
  valor_financiado  numeric(14,2) check (valor_financiado is null or valor_financiado > 0),
  entrada           numeric(14,2) check (entrada is null or entrada >= 0),
  sistema           text not null default 'price' check (sistema in ('price','sac','fixa')),
  -- juros como a pessoa informou (ex.: 0,89 ao mês ou 11 ao ano), pra mostrar de volta igual
  taxa_valor        numeric(8,4) check (taxa_valor is null or (taxa_valor >= 0 and taxa_valor < 100)),
  taxa_periodo      text not null default 'mes' check (taxa_periodo in ('mes','ano')),
  -- de quem é: um membro do grupo (null = da família / de todos). Sem FK pra não criar
  -- mais um caminho entre tabelas que o PostgREST precise escolher.
  dono_id           uuid,
  observacao        text,
  criado_em         timestamptz not null default now()
);
comment on table public.financiamentos is 'Ficha do financiamento (0120). As parcelas ficam em parcelamentos/parcelas (sem cartão).';

create index if not exists financiamentos_grupo_idx on public.financiamentos(grupo_id);

alter table public.financiamentos enable row level security;

drop policy if exists financiamentos_todas on public.financiamentos;
create policy financiamentos_todas on public.financiamentos
  for all to authenticated
  using (grupo_id = public.meu_grupo_id())
  with check (grupo_id = public.meu_grupo_id());

-- Mesma trava de lançamento das outras tabelas (vencido lê, mas não cria novo).
drop policy if exists financiamentos_insert_assinatura on public.financiamentos;
create policy financiamentos_insert_assinatura on public.financiamentos
  as restrictive for insert to authenticated
  with check (public.grupo_pode_lancar());

grant select, insert, update, delete on public.financiamentos to authenticated;
revoke all on public.financiamentos from anon;

insert into public.feature_flags (chave, titulo, descricao, audiencia)
values ('financiamentos', 'Financiamentos',
        'Menu e tela de Financiamentos (imóvel, carro, consignado, empréstimo): parcelas nos meses, saldo devedor estimado e simulação de amortização. Textos em src/copy/pt-BR.js (copy.financiamentos).',
        'dono')
on conflict (chave) do nothing;
