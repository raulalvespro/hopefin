-- 0059_onda0_saida_grupo_push.sql
-- Onda 0 (16/11/2026) — itens A0.1, A0.2 e A5.1 da aba "🛠️ Ajustes do app".
--
-- 1) Quem é removido do grupo para de receber os avisos (push) do grupo e tem o
--    WhatsApp desconectado. Antes: grupo_id virava null, mas as inscrições de push
--    guardavam o grupo antigo (o digest diário continuava indo pros aparelhos da
--    pessoa) e o número seguia "verificado" (o bot respondia falando de assinatura).
-- 2) wa_usuario devolve motivo 'sem_grupo' (o bot explica a situação);
--    wa_conectar e gerar_codigo_whatsapp passam a exigir que a pessoa tenha grupo.
-- 3) registrar_push(): grava a inscrição do aparelho para o usuário logado e a
--    reatribui se o mesmo navegador já foi usado por outra conta (o upsert direto
--    esbarrava na RLS de update, que só deixa mexer na própria linha).
-- 4) app_diagnostico: o app registra o erro exato ao ativar notificação / instalar
--    (sem nenhum dado financeiro) — pra diagnosticar aparelhos que não temos em mãos.
--
-- Idempotente. DDL só via scripts/db.mjs (nunca MCP). Backup antes + smoke depois.

-- ============================================================
-- 1) remover_membro: + desconecta WhatsApp + apaga as inscrições de push
-- ============================================================
create or replace function public.remover_membro(p_usuario_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid := public.meu_grupo_id(); dono uuid; titular uuid;
begin
  select criado_por into dono from public.grupos where id = gid;
  if gid is null or dono is distinct from auth.uid() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if p_usuario_id = auth.uid() then
    raise exception 'nao_pode_remover_a_si' using errcode = 'P0001';
  end if;
  select titular_id into titular from public.subscriptions where grupo_id = gid;
  if titular is not null and titular = p_usuario_id then
    raise exception 'titular_da_assinatura' using errcode = 'P0001';
  end if;

  update public.usuarios
     set grupo_id = null,
         whatsapp_verificado = false, whatsapp_codigo = null, whatsapp_codigo_expira = null
   where id = p_usuario_id and grupo_id = gid;
  if not found then raise exception 'membro_nao_encontrado' using errcode = 'P0001'; end if;

  -- Os aparelhos de quem saiu não recebem mais nada deste grupo.
  delete from public.push_subscriptions where usuario_id = p_usuario_id;
end; $$;
revoke all on function public.remover_membro(uuid) from public;
grant execute on function public.remover_membro(uuid) to authenticated;

-- ============================================================
-- 2) WhatsApp: 'sem_grupo'
-- ============================================================
create or replace function public.wa_usuario(p_telefone text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when v.id is not null and v.grupo_id is not null
      then jsonb_build_object('ok', true, 'usuario_id', v.id, 'grupo_id', v.grupo_id, 'nome', v.nome)
    when v.id is not null
      or exists (select 1 from public.usuarios s where s.telefone = p_telefone and s.grupo_id is null)
      then jsonb_build_object('ok', false, 'motivo', 'sem_grupo')
    else jsonb_build_object('ok', false)
  end
  from (select 1) x
  left join lateral (
    select id, grupo_id, nome from public.usuarios
     where telefone = p_telefone and whatsapp_verificado limit 1
  ) v on true;
$$;
revoke all on function public.wa_usuario(text) from public;
grant execute on function public.wa_usuario(text) to service_role;

create or replace function public.wa_conectar(p_telefone text, p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u public.usuarios;
begin
  select * into u from public.usuarios
   where whatsapp_codigo = upper(btrim(p_codigo))
     and whatsapp_codigo_expira is not null and whatsapp_codigo_expira > now()
   limit 1;
  if not found then return jsonb_build_object('ok', false); end if;
  if u.grupo_id is null then return jsonb_build_object('ok', false, 'motivo', 'sem_grupo'); end if;

  -- Tira o número de qualquer outra conta antes de fixar nesta (número troca de dono).
  update public.usuarios set whatsapp_verificado = false, telefone = null
   where telefone = p_telefone and id <> u.id;

  update public.usuarios
     set telefone = p_telefone, whatsapp_verificado = true,
         whatsapp_codigo = null, whatsapp_codigo_expira = null
   where id = u.id;

  return jsonb_build_object('ok', true, 'usuario_id', u.id, 'grupo_id', u.grupo_id, 'nome', u.nome);
end; $$;
revoke all on function public.wa_conectar(text, text) from public;
grant execute on function public.wa_conectar(text, text) to service_role;

create or replace function public.gerar_codigo_whatsapp()
returns text language plpgsql security definer set search_path = public as $$
declare
  cod text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
begin
  if auth.uid() is null then raise exception 'nao_autenticado' using errcode = 'P0001'; end if;
  if public.meu_grupo_id() is null then raise exception 'usuario_sem_grupo' using errcode = 'P0001'; end if;
  update public.usuarios
     set whatsapp_codigo = cod,
         whatsapp_codigo_expira = now() + interval '15 minutes'
   where id = auth.uid();
  return cod;
end; $$;
revoke all on function public.gerar_codigo_whatsapp() from public;
grant execute on function public.gerar_codigo_whatsapp() to authenticated;

-- ============================================================
-- 3) registrar_push: grava/reatribui a inscrição do aparelho
-- ============================================================
create or replace function public.registrar_push(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid := public.meu_grupo_id();
begin
  if auth.uid() is null then raise exception 'nao_autenticado' using errcode = 'P0001'; end if;
  if g is null then raise exception 'usuario_sem_grupo' using errcode = 'P0001'; end if;
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'inscricao_invalida' using errcode = 'P0001';
  end if;
  insert into public.push_subscriptions (usuario_id, grupo_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), g, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
     set usuario_id = excluded.usuario_id, grupo_id = excluded.grupo_id,
         p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end; $$;
revoke all on function public.registrar_push(text, text, text, text) from public;
grant execute on function public.registrar_push(text, text, text, text) to authenticated;

-- ============================================================
-- 4) app_diagnostico: erros de aparelho (sem dado financeiro)
--    authenticated só INSERE a própria linha; ninguém lê pelo app (só service_role).
-- ============================================================
create table if not exists public.app_diagnostico (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid default auth.uid() references auth.users(id) on delete cascade,
  grupo_id    uuid,
  tipo        text not null check (tipo in ('push', 'instalar')),
  detalhe     text check (char_length(detalhe) <= 600),
  user_agent  text check (char_length(user_agent) <= 300),
  criado_em   timestamptz not null default now()
);
alter table public.app_diagnostico enable row level security;
drop policy if exists app_diagnostico_ins on public.app_diagnostico;
create policy app_diagnostico_ins on public.app_diagnostico
  for insert to authenticated with check (usuario_id = auth.uid());
create index if not exists app_diagnostico_criado_idx on public.app_diagnostico (criado_em desc);
