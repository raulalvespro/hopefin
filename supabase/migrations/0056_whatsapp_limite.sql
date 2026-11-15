-- 0056_whatsapp_limite.sql
-- Teto mensal de IA no caminho do WhatsApp (service_role). limite_ia_status()
-- original usa meu_grupo_id() (nulo no service_role), então espelhamos a mesma
-- regra recebendo o grupo. O contador é o MESMO do app (voz + whatsapp somam no
-- mês), igual ao que a voz já respeita — trial não vira ralo de gasto de IA.
-- Idempotente.

-- Paywall + teto mensal para um grupo (service_role). Resolve o limite pelo
-- status da assinatura (cortesia / assinante / trial), igual limite_ia_status().
create or replace function public.wa_pode_grupo(p_grupo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select * from public.subscriptions where grupo_id = p_grupo),
  lc as (select * from public.limites_config where id = 1),
  lim as (
    select case
      when (select is_cortesia from s) then (select cortesia_mes from lc)
      when (select status from s) = 'active' then (select assinante_mes from lc)
      else (select teste_total from lc)   -- trial / sem assinatura
    end as limite_mes
  ),
  uso as (
    select coalesce(sum(quantidade) filter (
      where data >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date
    ), 0) as usados_mes
    from public.consumo_ia where grupo_id = p_grupo
  )
  select jsonb_build_object(
    'limite_mes', (select limite_mes from lim),
    'usados_mes', (select usados_mes from uso),
    'pode', public.pode_lancar_grupo(p_grupo) and (select usados_mes from uso) < (select limite_mes from lim),
    'motivo', case
      when not public.pode_lancar_grupo(p_grupo) then 'assinatura'
      when (select usados_mes from uso) >= (select limite_mes from lim) then 'limite'
      else null end
  );
$$;
revoke all on function public.wa_pode_grupo(uuid) from public;
grant execute on function public.wa_pode_grupo(uuid) to service_role;

-- wa_salvar_lancamento agora usa wa_pode_grupo (paywall + teto) como guarda única.
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
  v_pode      jsonb := public.wa_pode_grupo(p_grupo);
begin
  if v_valor is null or v_valor <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'sem_valor');
  end if;
  if not (v_pode->>'pode')::boolean then
    return jsonb_build_object('ok', false, 'motivo', coalesce(v_pode->>'motivo','bloqueado'));
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
