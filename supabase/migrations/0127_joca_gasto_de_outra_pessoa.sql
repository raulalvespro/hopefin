-- 0127 — Joca: gasto de OUTRA PESSOA pelo WhatsApp (26/11/2026).
--
-- O Raul lançou pelo WhatsApp gastos que eram de outra pessoa ("foi da Jack") e o Joca salvou como gasto
-- dele. Agora o Joca entende a pessoa e manda p_dados.pessoa_nome: a função acha a pessoa no cadastro do
-- grupo (sem diferenciar maiúscula) ou cadastra, e salva igual ao app quando marca "foi de outra pessoa":
--  • gasto à vista → gastos.pessoa_id + reembolso_status 'pendente' (vai pro A receber);
--  • parcelado no cartão → parcelamentos.pessoa_id (cada parcela vai pro A receber).
-- Entrada ignora a pessoa. Resto idêntico ao da 0082. Continua só do servidor (service_role).

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
  v_forma     text := case when lower(coalesce(p_dados->>'tipo_pagamento','')) = 'dinheiro' then 'dinheiro' else 'pix' end;
  v_pessoa_nm text := left(nullif(btrim(coalesce(p_dados->>'pessoa_nome','')), ''), 60);
  v_pessoa    uuid;
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

  -- 0127: pessoa do "foi de outra pessoa" (só em gasto)
  if v_tipo <> 'entrada' and v_pessoa_nm is not null then
    select id into v_pessoa from public.pessoas
     where grupo_id = p_grupo and lower(btrim(nome)) = lower(v_pessoa_nm)
     order by criado_em limit 1;
    if v_pessoa is null then
      insert into public.pessoas (grupo_id, nome) values (p_grupo, v_pessoa_nm) returning id into v_pessoa;
    end if;
  end if;

  if v_tipo = 'entrada' then
    insert into public.entradas (grupo_id, usuario_id, descricao, valor, tipo, recorrente, recebido, data)
    values (p_grupo, p_usuario, v_desc, v_valor, 'avulso', false, v_data <= current_date, v_data)
    returning id into v_id;
    v_tabela := 'entrada';
  elsif v_cartao is not null and v_parc > 1 then
    insert into public.parcelamentos
      (grupo_id, usuario_id, descricao, valor_total, num_parcelas, valor_parcela, cartao_id, categoria, data_primeira_parcela, pessoa_id)
    values (p_grupo, p_usuario, v_desc, v_valor, v_parc, round(v_valor / v_parc, 2), v_cartao, v_categoria,
            coalesce(public.vencimento_da_fatura_da_compra(v_cartao, v_data), v_data), v_pessoa)
    returning id into v_id;
    v_tabela := 'parcelamento';
  else
    insert into public.gastos
      (grupo_id, usuario_id, descricao, valor, categoria, tipo_pagamento, cartao_id, data, origem, pessoa_id, reembolso_status)
    values (p_grupo, p_usuario, v_desc, v_valor, v_categoria,
            case when v_cartao is not null then 'cartao' else v_forma end, v_cartao, v_data, 'whatsapp',
            v_pessoa, case when v_pessoa is not null then 'pendente' end)
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

revoke all on function public.wa_salvar_lancamento(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.wa_salvar_lancamento(uuid, uuid, jsonb) to service_role;
