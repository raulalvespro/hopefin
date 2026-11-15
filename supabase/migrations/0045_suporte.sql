-- 0045 — Painel do dono (ERP), Etapa 4: Suporte (caixa de e-mails no painel).
-- Guarda os e-mails recebidos do domínio pra responder de dentro do painel.
-- A INGESTÃO (como os e-mails entram aqui) depende de uma decisão de DNS do Raul
-- (ver opções no relatório) — esta migração só cria a caixa + RPCs de leitura/gestão.
-- Responder (envio) é feito pela Edge Function admin-suporte-responder (Resend).
-- Tudo guardado por sou_admin().

create table if not exists public.suporte_emails (
  id            uuid primary key default gen_random_uuid(),
  de_email      text not null,
  de_nome       text,
  assunto       text,
  corpo         text,
  recebido_em   timestamptz not null default now(),
  status        text not null default 'novo' check (status in ('novo','lido','respondido','arquivado')),
  grupo_id      uuid references public.grupos(id) on delete set null,  -- liga à ficha, se o e-mail for de um cliente
  message_id    text,
  resposta      text,
  respondido_em timestamptz,
  criado_em     timestamptz not null default now()
);
create index if not exists idx_suporte_emails_status on public.suporte_emails(status, recebido_em desc);
alter table public.suporte_emails enable row level security;
-- Só admin LÊ. Escrita vem do ingestor (service_role) e das RPCs/Função SECURITY DEFINER.
drop policy if exists suporte_emails_sel on public.suporte_emails;
create policy suporte_emails_sel on public.suporte_emails
  for select to authenticated using (public.sou_admin());

-- Dois exemplos pra enxergar a caixa na prévia (removíveis no próprio painel).
insert into public.suporte_emails (de_email, de_nome, assunto, corpo, status, recebido_em)
select * from (values
  ('maria.exemplo@gmail.com', 'Maria (exemplo)', 'Como cancelo minha assinatura?',
   E'Oi! Quero entender como cancelar e se tenho direito a reembolso.\n\n[e-mail de exemplo — pode apagar]', 'novo', now() - interval '2 hours'),
  ('joao.exemplo@gmail.com', 'João (exemplo)', 'Não recebi o e-mail de acesso',
   E'Cadastrei minha esposa mas ela não recebeu o link.\n\n[e-mail de exemplo — pode apagar]', 'lido', now() - interval '1 day')
) as v(de_email, de_nome, assunto, corpo, status, recebido_em)
where not exists (select 1 from public.suporte_emails);

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: listar e-mails (opcionalmente por status) + contagem por status.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_suporte_listar(p_status text default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select json_build_object(
    'itens', (select coalesce(json_agg(t), '[]'::json) from (
      select id, de_email, de_nome, assunto, corpo, status, recebido_em, grupo_id, resposta, respondido_em
      from public.suporte_emails
      where p_status is null or status = p_status
      order by recebido_em desc limit 200) t),
    'contagem', (select coalesce(json_object_agg(status, q), '{}'::json) from (
      select status, count(*) q from public.suporte_emails group by status) x)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_suporte_listar(text) from public;
grant execute on function public.admin_suporte_listar(text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: mudar status (novo/lido/respondido/arquivado).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_suporte_marcar(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  if p_status not in ('novo','lido','respondido','arquivado') then raise exception 'status_invalido' using errcode = 'P0001'; end if;
  update public.suporte_emails set status = p_status where id = p_id;
end; $$;
revoke all on function public.admin_suporte_marcar(uuid, text) from public;
grant execute on function public.admin_suporte_marcar(uuid, text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: remover e-mail.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_suporte_remover(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  delete from public.suporte_emails where id = p_id;
end; $$;
revoke all on function public.admin_suporte_remover(uuid) from public;
grant execute on function public.admin_suporte_remover(uuid) to authenticated;
