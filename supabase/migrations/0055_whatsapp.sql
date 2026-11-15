-- 0055_whatsapp.sql
-- Base do lançamento por WhatsApp (prompt 11.1 / item L23 do painel de demandas).
-- O webhook roda como SERVICE_ROLE (a Meta chama sem JWT), então NÃO pode confiar
-- na RLS: toda a trava (assinatura, limite, isolamento por grupo) vive aqui, em
-- funções SECURITY DEFINER que recebem o grupo explicitamente.
--
-- Vínculo número<->conta: opção (a) decidida com o Raul — a pessoa CONECTA o
-- WhatsApp DENTRO do app (gera um código), manda o código pro nosso número e o
-- webhook casa o telefone com a conta. 'usuarios.telefone' já existe (0018).
--
-- Idempotente. DDL só via scripts/db.mjs (nunca MCP). Backup antes + smoke depois.

-- ============================================================
-- 1) Colunas de verificação do WhatsApp em usuarios
-- ============================================================
alter table public.usuarios add column if not exists whatsapp_verificado boolean not null default false;
alter table public.usuarios add column if not exists whatsapp_codigo text;
alter table public.usuarios add column if not exists whatsapp_codigo_expira timestamptz;
-- Um telefone verificado pertence a uma conta só (evita dois cadastros no mesmo número).
create unique index if not exists usuarios_telefone_verificado_unq
  on public.usuarios (telefone) where whatsapp_verificado;

-- ============================================================
-- 2) Log de mensagens do WhatsApp (auditoria + idempotência)
--    LGPD: o conteúdo financeiro NÃO é exposto a nenhuma RPC de admin — só
--    service_role lê a tabela; o admin vê contagem/resultado, nunca o texto.
-- ============================================================
create table if not exists public.whatsapp_mensagens (
  id            uuid primary key default gen_random_uuid(),
  wa_message_id text unique,                  -- id da Meta -> não processa a mesma 2x
  telefone      text,
  usuario_id    uuid references public.usuarios(id) on delete set null,
  grupo_id      uuid references public.grupos(id) on delete set null,
  direcao       text not null check (direcao in ('entrada','saida')),
  tipo          text not null default 'desconhecido'
                check (tipo in ('conexao','lancamento','desconhecido','bloqueado','erro','resposta')),
  texto         text,
  criado_em     timestamptz not null default now()
);
alter table public.whatsapp_mensagens enable row level security;
-- sem policies -> nenhum acesso por authenticated/anon; só service_role (bypassa RLS).
create index if not exists whatsapp_mensagens_grupo_idx on public.whatsapp_mensagens (grupo_id, criado_em desc);

-- ============================================================
-- 3) pode_lancar_grupo(grupo): espelha grupo_pode_lancar() para um grupo dado
--    (o original usa meu_grupo_id(), que é nulo no service_role). Mantém a trava
--    de assinatura também no caminho do WhatsApp.
-- ============================================================
create or replace function public.pode_lancar_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when s.is_cortesia then true
      when s.status = 'active'
           and (not s.cancel_at_period_end
                or s.current_period_end is null
                or s.current_period_end > now()) then true
      when s.status = 'trial' and (s.trial_ends_at is null or s.trial_ends_at > now()) then true
      else false
    end
    from public.subscriptions s where s.grupo_id = p_grupo
  ), true);
$$;
revoke all on function public.pode_lancar_grupo(uuid) from public;
grant execute on function public.pode_lancar_grupo(uuid) to service_role;

-- ============================================================
-- 4) App gera o código de conexão (authenticated, para o próprio usuário)
--    Retorna o código (6 caracteres, validade 15 min). O front mostra o código
--    + um link wa.me com a mensagem pronta.
-- ============================================================
create or replace function public.gerar_codigo_whatsapp()
returns text language plpgsql security definer set search_path = public as $$
declare
  cod text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
begin
  if auth.uid() is null then raise exception 'nao_autenticado' using errcode = 'P0001'; end if;
  update public.usuarios
     set whatsapp_codigo = cod,
         whatsapp_codigo_expira = now() + interval '15 minutes'
   where id = auth.uid();
  return cod;
end; $$;
revoke all on function public.gerar_codigo_whatsapp() from public;
grant execute on function public.gerar_codigo_whatsapp() to authenticated;

-- App desconecta o próprio WhatsApp.
create or replace function public.desconectar_whatsapp()
returns void language sql security definer set search_path = public as $$
  update public.usuarios
     set whatsapp_verificado = false, whatsapp_codigo = null, whatsapp_codigo_expira = null
   where id = auth.uid();
$$;
revoke all on function public.desconectar_whatsapp() from public;
grant execute on function public.desconectar_whatsapp() to authenticated;

-- ============================================================
-- 5) Webhook conecta um telefone a partir do código (service_role)
-- ============================================================
create or replace function public.wa_conectar(p_telefone text, p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u public.usuarios;
begin
  select * into u from public.usuarios
   where whatsapp_codigo = upper(btrim(p_codigo))
     and whatsapp_codigo_expira is not null and whatsapp_codigo_expira > now()
   limit 1;
  if not found then return jsonb_build_object('ok', false); end if;

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

-- Acha a conta verificada de um telefone (service_role).
create or replace function public.wa_usuario(p_telefone text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when u.id is null then jsonb_build_object('ok', false)
         else jsonb_build_object('ok', true, 'usuario_id', u.id, 'grupo_id', u.grupo_id, 'nome', u.nome) end
  from (select id, grupo_id, nome from public.usuarios
         where telefone = p_telefone and whatsapp_verificado limit 1) u
  right join (select 1) x on true;
$$;
revoke all on function public.wa_usuario(text) from public;
grant execute on function public.wa_usuario(text) to service_role;

-- ============================================================
-- 6) Salva o lançamento interpretado (service_role), respeitando a trava de
--    assinatura e registrando consumo. p_dados = JSON saneado do interpretador.
-- ============================================================
create or replace function public.wa_salvar_lancamento(p_grupo uuid, p_usuario uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tipo      text := coalesce(p_dados->>'tipo', 'gasto');
  v_valor     numeric := nullif(p_dados->>'valor','')::numeric;
  v_desc      text := left(coalesce(p_dados->>'descricao',''), 120);
  v_categoria text := coalesce(p_dados->>'categoria','outros');
  v_cartao    uuid := nullif(p_dados->>'cartao_id','')::uuid;
  v_data      date := coalesce(nullif(p_dados->>'data','')::date, current_date);
  v_parc      int  := coalesce(nullif(p_dados->>'parcelas','')::int, 1);
begin
  if v_valor is null or v_valor <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'sem_valor');
  end if;
  if not public.pode_lancar_grupo(p_grupo) then
    return jsonb_build_object('ok', false, 'motivo', 'assinatura');
  end if;

  if v_tipo = 'entrada' then
    insert into public.entradas (grupo_id, usuario_id, descricao, valor, tipo, recorrente, recebido, data)
    values (p_grupo, p_usuario, v_desc, v_valor, 'avulso', false, v_data <= current_date, v_data);
  elsif v_cartao is not null and v_parc > 1 then
    insert into public.parcelamentos
      (grupo_id, usuario_id, descricao, valor_total, num_parcelas, valor_parcela, cartao_id, categoria, data_primeira_parcela)
    values (p_grupo, p_usuario, v_desc, v_valor, v_parc, round(v_valor / v_parc, 2), v_cartao, v_categoria, v_data);
  else
    insert into public.gastos
      (grupo_id, usuario_id, descricao, valor, categoria, tipo_pagamento, cartao_id, data, origem)
    values (p_grupo, p_usuario, v_desc, v_valor, v_categoria,
            case when v_cartao is not null then 'cartao' else 'pix' end, v_cartao, v_data, 'whatsapp');
  end if;

  insert into public.consumo_ia (grupo_id, usuario_id, origem, quantidade)
  values (p_grupo, p_usuario, 'whatsapp', 1);

  return jsonb_build_object('ok', true, 'tipo', v_tipo, 'valor', v_valor, 'descricao', v_desc);
end; $$;
revoke all on function public.wa_salvar_lancamento(uuid, uuid, jsonb) from public;
grant execute on function public.wa_salvar_lancamento(uuid, uuid, jsonb) to service_role;

-- ============================================================
-- 7) Gestão no /admin (dono) — SEM expor conteúdo financeiro (LGPD)
-- ============================================================
create or replace function public.admin_whatsapp_resumo()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ini date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
begin
  if not public.sou_admin() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'conectados', (select count(*) from public.usuarios where whatsapp_verificado),
    'mensagens_mes', (select count(*) from public.whatsapp_mensagens where criado_em >= ini),
    'lancamentos_mes', (select count(*) from public.whatsapp_mensagens where tipo = 'lancamento' and criado_em >= ini),
    'erros_mes', (select count(*) from public.whatsapp_mensagens where tipo = 'erro' and criado_em >= ini),
    'pausado', (select whatsapp_pausado from public.admin_config where id = 1),
    'teto_centavos', (select whatsapp_teto_centavos from public.admin_config where id = 1)
  );
end; $$;
revoke all on function public.admin_whatsapp_resumo() from public;
grant execute on function public.admin_whatsapp_resumo() to authenticated;

-- Lista de quem conectou o WhatsApp (telefone mascarado — LGPD).
create or replace function public.admin_whatsapp_conexoes()
returns table (nome text, telefone_mascarado text, conectado boolean) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  return query
    select u.nome,
           case when u.telefone is null then null
                else '••••' || right(u.telefone, 4) end,
           u.whatsapp_verificado
      from public.usuarios u
     where u.whatsapp_verificado
     order by u.nome;
end; $$;
revoke all on function public.admin_whatsapp_conexoes() from public;
grant execute on function public.admin_whatsapp_conexoes() to authenticated;
