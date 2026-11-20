-- 0082 — Joca: gasto em dinheiro pelo WhatsApp + forma de pagamento nas mensagens (20/11/2026, tarde).
--
-- O Raul aprovou as mensagens do Joca com uma informação por linha, incluindo "💵 Pix" ou "💵 Dinheiro"
-- no gasto sem cartão. Até aqui todo gasto sem cartão do WhatsApp entrava como Pix. Agora:
--  • wa_salvar_lancamento aceita p_dados.tipo_pagamento = "dinheiro" (qualquer outra coisa = pix, como
--    antes; com cartão continua "cartao"). Resto da função idêntico ao da 0078.
--  • wa_ultimo_lancamento devolve tipo_pagamento do gasto (pra mostrar no "apaga o último" e no
--    "o valor era 50"). Resto idêntico.
-- Continuam só do servidor (service_role), como na 0063/0078.

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
  -- 0082: gasto sem cartão = Pix ou Dinheiro (o app só tem esses); qualquer outra coisa vira Pix.
  v_forma     text := case when lower(coalesce(p_dados->>'tipo_pagamento','')) = 'dinheiro' then 'dinheiro' else 'pix' end;
  v_pode      jsonb := public.wa_pode_grupo(p_grupo);
  v_id        uuid;
  v_tabela    text;
begin
  if v_valor is null or v_valor <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'sem_valor');
  end if;
  if not (v_pode->>'pode')::boolean then
    return jsonb_build_object('ok', false, 'motivo', coalesce(v_pode->>'motivo','bloqueado'));
  end if;

  if v_tipo = 'entrada' then
    insert into public.entradas (grupo_id, usuario_id, descricao, valor, tipo, recorrente, recebido, data)
    values (p_grupo, p_usuario, v_desc, v_valor, 'avulso', false, v_data <= current_date, v_data)
    returning id into v_id;
    v_tabela := 'entrada';
  elsif v_cartao is not null and v_parc > 1 then
    -- A2.5: a 1ª parcela vence no dia em que vence a fatura da compra (igual ao app).
    insert into public.parcelamentos
      (grupo_id, usuario_id, descricao, valor_total, num_parcelas, valor_parcela, cartao_id, categoria, data_primeira_parcela)
    values (p_grupo, p_usuario, v_desc, v_valor, v_parc, round(v_valor / v_parc, 2), v_cartao, v_categoria,
            coalesce(public.vencimento_da_fatura_da_compra(v_cartao, v_data), v_data))
    returning id into v_id;
    v_tabela := 'parcelamento';
  else
    insert into public.gastos
      (grupo_id, usuario_id, descricao, valor, categoria, tipo_pagamento, cartao_id, data, origem)
    values (p_grupo, p_usuario, v_desc, v_valor, v_categoria,
            case when v_cartao is not null then 'cartao' else v_forma end, v_cartao, v_data, 'whatsapp')
    returning id into v_id;
    v_tabela := 'gasto';
  end if;

  insert into public.consumo_ia (grupo_id, usuario_id, origem, quantidade)
  values (p_grupo, p_usuario, 'whatsapp', 1);

  -- Joca (0078): o último lançamento da pessoa ("apaga o último", "o valor era 50").
  insert into public.whatsapp_estado (usuario_id, grupo_id, ultimo_tipo, ultimo_id, ultimo_em, atualizado_em)
  values (p_usuario, p_grupo, v_tabela, v_id, now(), now())
  on conflict (usuario_id) do update
     set grupo_id = excluded.grupo_id, ultimo_tipo = excluded.ultimo_tipo, ultimo_id = excluded.ultimo_id,
         ultimo_em = excluded.ultimo_em, atualizado_em = now();

  return jsonb_build_object('ok', true, 'tipo', v_tipo, 'valor', v_valor, 'descricao', v_desc,
                            'id', v_id, 'tabela', v_tabela);
end; $$;

create or replace function public.wa_ultimo_lancamento(p_grupo uuid, p_usuario uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  e public.whatsapp_estado;
  r jsonb;
begin
  select * into e from public.whatsapp_estado where usuario_id = p_usuario and grupo_id = p_grupo;
  if not found or e.ultimo_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'nenhum');
  end if;

  if e.ultimo_tipo = 'gasto' then
    select jsonb_build_object(
             'ok', true, 'tipo', 'gasto', 'id', g.id, 'descricao', g.descricao, 'valor', g.valor,
             'data', g.data, 'categoria', g.categoria, 'cartao_nome', c.nome, 'num_parcelas', 1,
             'tipo_pagamento', g.tipo_pagamento,  -- 0082: "💵 Pix" / "💵 Dinheiro" no apagar/corrigir
             'bloqueio', case
               when g.pessoa_id is not null or g.reembolso_entrada_id is not null then 'terceiro'
               when exists (select 1 from public.a_receber a where a.gasto_id = g.id) then 'dividido'
               else null end)
      into r
      from public.gastos g
      left join public.cartoes c on c.id = g.cartao_id
     where g.id = e.ultimo_id and g.grupo_id = p_grupo and g.usuario_id = p_usuario;
  elsif e.ultimo_tipo = 'parcelamento' then
    select jsonb_build_object(
             'ok', true, 'tipo', 'parcelamento', 'id', p.id, 'descricao', p.descricao, 'valor', p.valor_total,
             'valor_parcela', p.valor_parcela, 'num_parcelas', p.num_parcelas, 'data', null,
             'categoria', p.categoria, 'cartao_nome', c.nome,
             'bloqueio', case
               when p.pessoa_id is not null then 'terceiro'
               when exists (select 1 from public.a_receber a where a.parcelamento_id = p.id) then 'dividido'
               when exists (select 1 from public.parcelas x where x.parcelamento_id = p.id and (x.paga or x.recebido)) then 'pago'
               else null end)
      into r
      from public.parcelamentos p
      left join public.cartoes c on c.id = p.cartao_id
     where p.id = e.ultimo_id and p.grupo_id = p_grupo and p.usuario_id = p_usuario;
  elsif e.ultimo_tipo = 'entrada' then
    select jsonb_build_object(
             'ok', true, 'tipo', 'entrada', 'id', en.id, 'descricao', en.descricao, 'valor', en.valor,
             'data', en.data, 'num_parcelas', 1,
             'bloqueio', case
               when en.serie_id is not null or en.recorrente then 'serie'
               when exists (select 1 from public.a_receber a where a.entrada_id = en.id or a.credito_de = en.id)
                 or exists (select 1 from public.gastos g where g.reembolso_entrada_id = en.id)
                 or exists (select 1 from public.parcelas x where x.reembolso_entrada_id = en.id)
                 or exists (select 1 from public.viradas_mes v where v.entrada_id = en.id) then 'ligado'
               else null end)
      into r
      from public.entradas en
     where en.id = e.ultimo_id and en.grupo_id = p_grupo and en.usuario_id = p_usuario;
  end if;

  if r is null then
    return jsonb_build_object('ok', false, 'motivo', 'sumiu');   -- apagado no app, ou de outro grupo
  end if;
  return r;
end; $$;

revoke all on function public.wa_salvar_lancamento(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.wa_salvar_lancamento(uuid, uuid, jsonb) to service_role;
revoke all on function public.wa_ultimo_lancamento(uuid, uuid) from public, anon, authenticated;
grant execute on function public.wa_ultimo_lancamento(uuid, uuid) to service_role;
