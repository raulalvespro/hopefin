-- 0124 — Agência de marketing, FASE 3: publicar sozinho no Instagram (e na Página do Facebook).
-- A Edge Function mkt-publicar (cron a cada 5 min) pega as peças 'agendado' cujo data+horario (America/Sao_Paulo)
-- já passou e posta pela API da Meta. Controle por peça:
--   pub_tentativas    falhas seguidas (3 → status 'atrasado')
--   pub_erro          última mensagem de erro (curta, vinda da Meta)
--   pub_ig_id         id da mídia publicada no Instagram (preenchido = não posta de novo no IG)
--   pub_ig_container  container de reel ainda processando na Meta (a próxima execução continua dele)
--   pub_fb_id         id do post/reel na Página do Facebook (preenchido = não posta de novo no FB)
--   pub_iniciada_em   trava: quem pegou a peça e quando (evita publicar 2x se duas execuções se cruzarem)
-- E a config linha única public.mkt_config (id = 1). A chave geral publicar_ativo NASCE DESLIGADA.
-- IDs da conta/página não são segredo; o TOKEN fica só no secret META_PAGE_TOKEN das Edge Functions.
-- Acesso: só admin com o código do celular (sou_admin, aal2); service_role livre. Sem função nova.
-- Idempotente.

alter table public.mkt_pecas add column if not exists pub_tentativas   int not null default 0;
alter table public.mkt_pecas add column if not exists pub_erro         text;
alter table public.mkt_pecas add column if not exists pub_ig_id        text;
alter table public.mkt_pecas add column if not exists pub_ig_container text;
alter table public.mkt_pecas add column if not exists pub_fb_id        text;
alter table public.mkt_pecas add column if not exists pub_iniciada_em  timestamptz;

create index if not exists mkt_pecas_agendado_idx on public.mkt_pecas (data, horario) where status = 'agendado';

create table if not exists public.mkt_config (
  id                  int primary key default 1 check (id = 1),
  publicar_ativo      boolean not null default false,   -- chave geral (nasce DESLIGADA)
  publicar_instagram  boolean not null default true,
  publicar_facebook   boolean not null default false,
  ig_user_id          text,                             -- id da conta profissional do @hopefinapp
  fb_page_id          text,                             -- id da Página do Facebook
  atualizado_em       timestamptz not null default now()
);
insert into public.mkt_config (id) values (1) on conflict (id) do nothing;

drop trigger if exists mkt_config_tocar on public.mkt_config;
create trigger mkt_config_tocar before update on public.mkt_config
  for each row execute function public.mkt_tocar_atualizado();

alter table public.mkt_config enable row level security;
revoke all on public.mkt_config from anon;

drop policy if exists mkt_config_admin on public.mkt_config;
create policy mkt_config_admin on public.mkt_config for all to authenticated
  using (public.sou_admin()) with check (public.sou_admin());
