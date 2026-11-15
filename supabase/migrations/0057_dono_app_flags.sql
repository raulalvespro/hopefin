-- 0057_dono_app_flags.sql
-- "Dono do app" + feature flags (ÁREA DE DESENVOLVIMENTO): funcionalidades novas
-- nascem visíveis só para o DONO DO APP (audiência 'dono'); quando ele aprova,
-- promove para 'admins' e depois 'todos'. Reutilizável para qualquer feature.
--
-- ATENÇÃO: is_dono_app (dono do PRODUTO) é diferente de is_dono que aparece no
-- /admin = criador do grupo de um cliente (u.id = g.criado_por). Nomes distintos
-- de propósito. Idempotente.

-- 1) Marcador do dono do app + helper.
alter table public.usuarios add column if not exists is_dono_app boolean not null default false;
-- O dono do app é o mesmo e-mail que já vira admin na criação da conta.
update public.usuarios set is_dono_app = true
 where lower(email) = 'raullerickson@gmail.com' and is_admin and not is_dono_app;

create or replace function public.sou_dono_app()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_dono_app from public.usuarios where id = auth.uid()), false);
$$;
revoke all on function public.sou_dono_app() from public;
grant execute on function public.sou_dono_app() to authenticated;

-- 2) Feature flags.
create table if not exists public.feature_flags (
  chave         text primary key,
  titulo        text not null,
  descricao     text,
  audiencia     text not null default 'dono' check (audiencia in ('dono','admins','todos')),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id) on delete set null
);
alter table public.feature_flags enable row level security;
-- Sem select direto (uma flag 'dono' não pode vazar pro cliente): só via RPC.

-- O que o usuário atual ENXERGA (resolve por papel). Mapa { chave: true }.
create or replace function public.minhas_flags()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(chave, true), '{}'::jsonb)
  from public.feature_flags f
  where f.audiencia = 'todos'
     or (f.audiencia = 'admins' and (public.sou_admin() or public.sou_dono_app()))
     or (f.audiencia = 'dono'   and public.sou_dono_app());
$$;
revoke all on function public.minhas_flags() from public;
grant execute on function public.minhas_flags() to authenticated;

-- Lista completa para o dono gerenciar (área de desenvolvimento).
create or replace function public.admin_flags()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_dono_app() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  return (select coalesce(json_agg(f order by f.titulo), '[]'::json)
          from (select chave, titulo, descricao, audiencia, atualizado_em from public.feature_flags) f);
end; $$;
revoke all on function public.admin_flags() from public;
grant execute on function public.admin_flags() to authenticated;

-- Promover/recolher uma flag (só o dono do app).
create or replace function public.admin_set_flag(p_chave text, p_audiencia text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_dono_app() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  if p_audiencia not in ('dono','admins','todos') then raise exception 'audiencia_invalida' using errcode = 'P0001'; end if;
  update public.feature_flags
     set audiencia = p_audiencia, atualizado_em = now(), atualizado_por = auth.uid()
   where chave = p_chave;
end; $$;
revoke all on function public.admin_set_flag(text, text) from public;
grant execute on function public.admin_set_flag(text, text) to authenticated;

-- Flag inicial: a gestão de WhatsApp no painel nasce só para o dono.
insert into public.feature_flags (chave, titulo, descricao, audiencia) values
  ('whatsapp_admin', 'Gestão de WhatsApp no painel',
   'Resumo (conectados, mensagens, custo), números conectados e saúde do WhatsApp.', 'dono')
on conflict (chave) do nothing;

-- 3) Custo do WhatsApp no resumo (reusa a tarifa flat do admin_config, igual Custos).
create or replace function public.admin_whatsapp_resumo()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  ini date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  tarifa int := coalesce((select custo_resposta_centavos from public.admin_config where id = 1), 0);
  usos int := coalesce((select sum(quantidade) from public.consumo_ia where origem = 'whatsapp' and data >= ini), 0);
begin
  if not public.sou_admin() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'conectados', (select count(*) from public.usuarios where whatsapp_verificado),
    'mensagens_mes', (select count(*) from public.whatsapp_mensagens where criado_em >= ini),
    'lancamentos_mes', usos,
    'erros_mes', (select count(*) from public.whatsapp_mensagens where tipo = 'erro' and criado_em >= ini),
    'custo_centavos', round(usos * tarifa),
    'pausado', (select whatsapp_pausado from public.admin_config where id = 1),
    'teto_centavos', (select whatsapp_teto_centavos from public.admin_config where id = 1)
  );
end; $$;
revoke all on function public.admin_whatsapp_resumo() from public;
grant execute on function public.admin_whatsapp_resumo() to authenticated;
