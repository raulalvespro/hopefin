-- 0048 — Painel do dono (ERP), Fase 1: Auditoria, Configurações e IA por cliente.
-- Nada muda no fluxo do app; só leitura/admin, tudo guardado por sou_admin().

-- ──────────────────────────────────────────────────────────────────────────
-- AUDITORIA: lê o admin_log (que já gravamos) com nome do admin e do grupo,
-- categoriza pela ação e permite filtro por categoria/busca. A tabela nunca é
-- apagada aqui — é só leitura.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_auditoria(
  p_categoria text default null,
  p_busca     text default null,
  p_limite    int  default 200
) returns json language plpgsql stable security definer set search_path = public as $$
declare r json; lim int := least(greatest(coalesce(p_limite,200), 1), 500);
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;

  with base as (
    select
      l.id, l.acao, l.motivo, l.detalhe, l.criado_em, l.grupo_id,
      coalesce(au.email, '—')               as admin_email,
      coalesce(g.nome, null)                 as grupo_nome,
      case
        when l.acao ilike '%servico%'                                      then 'Serviços'
        when l.acao ilike '%suporte%'                                      then 'Suporte'
        when l.acao ilike '%admin%'                                        then 'Admin'
        when l.acao ilike '%cupom%'                                        then 'Cupons'
        when l.acao ilike '%trial%' or l.acao ilike '%cortesia%'
          or l.acao ilike '%assinatura%' or l.acao ilike '%cancel%'        then 'Assinatura'
        when l.acao ilike '%email%' or l.acao ilike '%reenviar%'           then 'E-mail'
        when l.acao ilike '%membro%'                                       then 'Membros'
        when l.acao ilike '%config%' or l.acao ilike '%tarifa%'            then 'Config'
        else 'Outros'
      end as categoria
    from public.admin_log l
    left join auth.users au on au.id = l.admin_id
    left join public.grupos g on g.id = l.grupo_id
  ),
  filtrada as (
    select * from base
    where (p_categoria is null or categoria = p_categoria)
      and (
        p_busca is null or btrim(p_busca) = '' or
        acao ilike '%'||p_busca||'%' or
        coalesce(admin_email,'') ilike '%'||p_busca||'%' or
        coalesce(grupo_nome,'')  ilike '%'||p_busca||'%' or
        coalesce(motivo,'')      ilike '%'||p_busca||'%'
      )
  )
  select json_build_object(
    'itens', (select coalesce(json_agg(t order by (t->>'criado_em') desc), '[]'::json)
              from (select * from filtrada order by criado_em desc limit lim) t),
    'categorias', (select coalesce(json_agg(c order by c->>'categoria'), '[]'::json)
                   from (select categoria, count(*) as n from base group by categoria) c)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_auditoria(text,text,int) from public;
grant execute on function public.admin_auditoria(text,text,int) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- CONFIGURAÇÕES: devolve os valores atuais (config, tarifas de IA, dias de trial)
-- pra tela. Preços de plano continuam na planos_config (fonte única) — só leitura.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_configuracoes()
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select json_build_object(
    'config', (select row_to_json(c) from (
        select ia_gratis_mes, custo_resposta_centavos, whatsapp_pausado, whatsapp_teto_centavos,
               mascote_ativo, figurinhas_ativas, atualizado_em
        from public.admin_config where id = 1) c),
    'tarifas', (select coalesce(json_agg(t order by modelo), '[]'::json) from (
        select modelo, entrada_usd_milhao, saida_usd_milhao, atualizado_em from public.ia_tarifas) t),
    'trial_dias', (select trial_dias from public.planos_config where id = 1)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_configuracoes() from public;
grant execute on function public.admin_configuracoes() to authenticated;

-- Salvar as chaves editáveis da config (IA grátis, tarifa estimada, teto/pausa do WhatsApp). Auditado.
create or replace function public.admin_salvar_config(
  p_ia_gratis_mes           int     default null,
  p_custo_resposta_centavos numeric default null,
  p_whatsapp_teto_centavos  int     default null,
  p_whatsapp_pausado        boolean default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  update public.admin_config set
    ia_gratis_mes           = coalesce(p_ia_gratis_mes, ia_gratis_mes),
    custo_resposta_centavos = coalesce(p_custo_resposta_centavos, custo_resposta_centavos),
    whatsapp_teto_centavos  = coalesce(p_whatsapp_teto_centavos, whatsapp_teto_centavos),
    whatsapp_pausado        = coalesce(p_whatsapp_pausado, whatsapp_pausado),
    atualizado_em           = now()
  where id = 1;
  insert into public.admin_log (admin_id, acao, detalhe)
  values (auth.uid(), 'salvar_config', json_build_object(
    'ia_gratis_mes', p_ia_gratis_mes, 'custo_resposta_centavos', p_custo_resposta_centavos,
    'whatsapp_teto_centavos', p_whatsapp_teto_centavos, 'whatsapp_pausado', p_whatsapp_pausado)::jsonb);
end; $$;
revoke all on function public.admin_salvar_config(int,numeric,int,boolean) from public;
grant execute on function public.admin_salvar_config(int,numeric,int,boolean) to authenticated;

-- Salvar/atualizar a tarifa de um modelo de IA (US$ por milhão de tokens). Auditado.
create or replace function public.admin_salvar_tarifa(
  p_modelo  text,
  p_entrada numeric,
  p_saida   numeric
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_modelo),'') = '' then raise exception 'modelo_obrigatorio' using errcode = 'P0001'; end if;
  insert into public.ia_tarifas (modelo, entrada_usd_milhao, saida_usd_milhao, atualizado_em)
  values (btrim(p_modelo), coalesce(p_entrada,0), coalesce(p_saida,0), now())
  on conflict (modelo) do update
    set entrada_usd_milhao = excluded.entrada_usd_milhao,
        saida_usd_milhao   = excluded.saida_usd_milhao,
        atualizado_em      = now();
  insert into public.admin_log (admin_id, acao, detalhe)
  values (auth.uid(), 'salvar_tarifa', json_build_object('modelo', btrim(p_modelo), 'entrada', p_entrada, 'saida', p_saida)::jsonb);
end; $$;
revoke all on function public.admin_salvar_tarifa(text,numeric,numeric) from public;
grant execute on function public.admin_salvar_tarifa(text,numeric,numeric) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- IA por cliente: custo real de IA de um grupo (para a ficha do cliente).
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_cliente_ia(p_grupo_id uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select json_build_object(
    'chamadas_total',  coalesce((select count(*) from public.ia_chamadas where grupo_id = p_grupo_id), 0),
    'custo_usd_total', coalesce((select round(sum(custo_usd),4) from public.ia_chamadas where grupo_id = p_grupo_id), 0),
    'chamadas_30d',    coalesce((select count(*) from public.ia_chamadas where grupo_id = p_grupo_id and criado_em >= now() - interval '30 days'), 0),
    'custo_usd_30d',   coalesce((select round(sum(custo_usd),4) from public.ia_chamadas where grupo_id = p_grupo_id and criado_em >= now() - interval '30 days'), 0),
    'falhas_total',    coalesce((select count(*) from public.ia_chamadas where grupo_id = p_grupo_id and not sucesso), 0)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_cliente_ia(uuid) from public;
grant execute on function public.admin_cliente_ia(uuid) to authenticated;
