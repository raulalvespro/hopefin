-- 0121 — Agência de marketing (Fase 2 do docs/PLANO_AGENCIA_MARKETING.md)
-- Mesa de controle do conteúdo do @hopefinapp dentro do painel do dono:
--   mkt_pecas        calendário de postagens (cada peça: data, formato, status, arquivos, legenda, link, números)
--   mkt_pedidos      o que o Raul pediu pra agência
--   mkt_comentarios  aprovações e pedidos de ajuste por peça
--   mkt_agentes      os membros da agência (função + instruções editáveis)
-- Acesso: só admin com o código do celular (sou_admin() exige aal2). Os agentes do Claude Code
-- leem/escrevem pelo scripts/db.mjs (service). Sem função nova (nada pra abrir/fechar no smoke).
-- Idempotente.

create table if not exists public.mkt_pecas (
  id               uuid primary key default gen_random_uuid(),
  data             date not null,
  horario          time,
  formato          text not null check (formato in ('reel','tirinha','carrossel','estatico','story')),
  titulo           text not null,
  ideia            text,
  comemorativa     text,
  status           text not null default 'ideia'
                   check (status in ('ideia','producao','revisao','aprovacao','pronto','agendado','postado','atrasado','cancelado')),
  responsavel      text,          -- slug do membro (mkt_agentes.id)
  cor              text,
  slug             text,          -- roteiros/<slug>.json no hopefin-social
  arquivo_url      text,          -- pasta/arquivo no Drive (prévia)
  legenda          text,
  link_post        text,          -- link no Instagram depois de postado
  postado_em       timestamptz,
  alcance          int,
  curtidas         int,
  comentarios      int,
  salvamentos      int,
  compartilhamentos int,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists mkt_pecas_data_idx on public.mkt_pecas (data, horario);
create unique index if not exists mkt_pecas_slot_uidx on public.mkt_pecas (data, horario, formato);

create table if not exists public.mkt_pedidos (
  id            uuid primary key default gen_random_uuid(),
  texto         text not null,
  status        text not null default 'novo' check (status in ('novo','andamento','feito','cancelado')),
  resposta      text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.mkt_comentarios (
  id        uuid primary key default gen_random_uuid(),
  peca_id   uuid not null references public.mkt_pecas(id) on delete cascade,
  autor     text not null default 'raul',
  tipo      text not null default 'comentario' check (tipo in ('comentario','ajuste','aprovado')),
  texto     text not null default '',
  criado_em timestamptz not null default now()
);
create index if not exists mkt_comentarios_peca_idx on public.mkt_comentarios (peca_id, criado_em);

create table if not exists public.mkt_agentes (
  id            text primary key,   -- slug: gerente, mkt-redator, ...
  nome          text not null,
  funcao        text not null,
  instrucoes    text,               -- notas do Raul pra moldar o membro (o sync leva pro .md do agente)
  ativo         boolean not null default true,
  ordem         int not null default 0,
  atualizado_em timestamptz not null default now()
);

-- atualizado_em automático
create or replace function public.mkt_tocar_atualizado() returns trigger
language plpgsql set search_path = public as $$
begin new.atualizado_em := now(); return new; end $$;
revoke all on function public.mkt_tocar_atualizado() from public, anon, authenticated;

drop trigger if exists mkt_pecas_tocar on public.mkt_pecas;
create trigger mkt_pecas_tocar before update on public.mkt_pecas for each row execute function public.mkt_tocar_atualizado();
drop trigger if exists mkt_pedidos_tocar on public.mkt_pedidos;
create trigger mkt_pedidos_tocar before update on public.mkt_pedidos for each row execute function public.mkt_tocar_atualizado();
drop trigger if exists mkt_agentes_tocar on public.mkt_agentes;
create trigger mkt_agentes_tocar before update on public.mkt_agentes for each row execute function public.mkt_tocar_atualizado();

-- RLS: só admin (aal2). anon não vê nada.
alter table public.mkt_pecas       enable row level security;
alter table public.mkt_pedidos     enable row level security;
alter table public.mkt_comentarios enable row level security;
alter table public.mkt_agentes     enable row level security;

revoke all on public.mkt_pecas, public.mkt_pedidos, public.mkt_comentarios, public.mkt_agentes from anon;

drop policy if exists mkt_pecas_admin on public.mkt_pecas;
create policy mkt_pecas_admin on public.mkt_pecas for all to authenticated
  using (public.sou_admin()) with check (public.sou_admin());
drop policy if exists mkt_pedidos_admin on public.mkt_pedidos;
create policy mkt_pedidos_admin on public.mkt_pedidos for all to authenticated
  using (public.sou_admin()) with check (public.sou_admin());
drop policy if exists mkt_comentarios_admin on public.mkt_comentarios;
create policy mkt_comentarios_admin on public.mkt_comentarios for all to authenticated
  using (public.sou_admin()) with check (public.sou_admin());
drop policy if exists mkt_agentes_admin on public.mkt_agentes;
create policy mkt_agentes_admin on public.mkt_agentes for all to authenticated
  using (public.sou_admin()) with check (public.sou_admin());

-- Equipe inicial (não sobrescreve o que o Raul já editou)
insert into public.mkt_agentes (id, nome, funcao, ordem) values
  ('gerente',          'Gerente de marketing', 'Planeja o calendário (2 posts/dia), escreve o briefing de cada peça, distribui, revisa e entrega pronto pra aprovar. Skill /agencia.', 0),
  ('mkt-pesquisador',  'Pesquisador de pautas', 'Datas comemorativas, sazonais e tendências do nicho; sugere pautas sem repetir tema em 30 dias.', 1),
  ('mkt-redator',      'Redator',               'Roteiros (reel, tirinha, carrossel) e legendas: storytelling + até 3 hashtags.', 2),
  ('mkt-designer',     'Designer',              'Carrossel, tirinha e estático 1080x1350: monta, renderiza, confere e sobe no Drive.', 3),
  ('mkt-editor-video', 'Editor de vídeo',       'Reels no Remotion: escolhe o estilo, confere quadros, renderiza mp4 + capa e sobe no Drive.', 4),
  ('mkt-revisor',      'Revisor de marca',      'Porteiro: confere oferta, promessa, português, visual e hashtags. Libera ou bloqueia.', 5),
  ('mkt-social-media', 'Social media',          'Confere o que foi ao ar no Instagram, atualiza status e links, monta o pacote do dia.', 6),
  ('mkt-analista',     'Analista',              'Números por peça; o que repetir, ajustar e parar; experimentos da semana.', 7),
  ('mkt-automacoes',   'Automações (ManyChat)', 'Fase 4: palavra no comentário vira DM com link, sequências e etiquetas. Ainda não ativo.', 8),
  ('mkt-trafego',      'Gestor de tráfego',     'Fase 4: propõe impulsionamento e campanhas; só gasta com aprovação. Ainda não ativo.', 9)
on conflict (id) do nothing;
update public.mkt_agentes set ativo = false where id in ('mkt-automacoes','mkt-trafego') and instrucoes is null;
