-- 0122 — Prévia das peças da agência dentro do painel.
-- Bucket PRIVADO `mkt-midia` no Storage (imagens JPEG dos carrosséis/tirinhas, mp4 + capa dos reels) e a coluna
-- mkt_pecas.midia com a lista do que tem lá, na ordem: [{ "tipo": "imagem"|"video"|"capa", "path": "<slug>/..." }].
-- Quem sobe é o scripts/painel.mjs do hopefin-social (chave de serviço buscada na hora pela Management API).
-- Quem vê: só admin com o código do celular (sou_admin), por URL assinada. Na Fase 3 (postar pela Meta) a
-- função de publicar gera a URL assinada pra Meta buscar o arquivo. JPEG porque a API do Instagram só aceita JPEG.
-- Idempotente.

alter table public.mkt_pecas add column if not exists midia jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mkt-midia', 'mkt-midia', false, 104857600, array['image/jpeg', 'image/png', 'video/mp4'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists mkt_midia_admin_ler on storage.objects;
create policy mkt_midia_admin_ler on storage.objects for select to authenticated
  using (bucket_id = 'mkt-midia' and public.sou_admin());
