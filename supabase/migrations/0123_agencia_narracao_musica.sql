-- 0123 — Reels com a voz do Raul e música da Meta Sound Collection (pedido de 23/11/2026).
-- Fluxo do reel: ideia → roteiro (equipe escrevendo) → aguardando_narracao (Raul grava) → aguardando_musica
-- (Raul escolhe 1 de 5) → producao (equipe monta) → revisao → pronto (Raul aprova) → agendado → postado.
--   roteiro_narracao  texto que o Raul lê (linhas numeradas, 1 linha = 1 cena)
--   narracao_path     arquivo que o Raul gravou/subiu (bucket mkt-midia, pasta narracao/)
--   musica_opcoes     5 faixas sugeridas: [{ titulo, artista, clima, duracao, path, motivo }] (prévias em musicas/)
--   musica_escolhida  a faixa que o Raul escolheu (um item de musica_opcoes)
-- Idempotente.

alter table public.mkt_pecas add column if not exists roteiro_narracao text;
alter table public.mkt_pecas add column if not exists narracao_path text;
alter table public.mkt_pecas add column if not exists narracao_em timestamptz;
alter table public.mkt_pecas add column if not exists musica_opcoes jsonb not null default '[]'::jsonb;
alter table public.mkt_pecas add column if not exists musica_escolhida jsonb;

alter table public.mkt_pecas drop constraint if exists mkt_pecas_status_check;
alter table public.mkt_pecas add constraint mkt_pecas_status_check check (status in (
  'ideia','roteiro','aguardando_narracao','aguardando_musica','producao','revisao',
  'aprovacao','pronto','agendado','postado','atrasado','cancelado'));

-- áudio no bucket (narração do Raul e prévias das músicas)
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','video/mp4',
     'audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/wav','audio/x-wav','audio/webm','audio/ogg']
 where id = 'mkt-midia';

-- o Raul (admin com código do celular) pode subir e trocar a narração pelo painel, só na pasta narracao/
drop policy if exists mkt_midia_admin_narracao_ins on storage.objects;
create policy mkt_midia_admin_narracao_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'mkt-midia' and name like 'narracao/%' and public.sou_admin());
drop policy if exists mkt_midia_admin_narracao_upd on storage.objects;
create policy mkt_midia_admin_narracao_upd on storage.objects for update to authenticated
  using (bucket_id = 'mkt-midia' and name like 'narracao/%' and public.sou_admin())
  with check (bucket_id = 'mkt-midia' and name like 'narracao/%' and public.sou_admin());
