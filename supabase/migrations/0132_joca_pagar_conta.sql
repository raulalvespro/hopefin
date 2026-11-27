-- 0132_joca_pagar_conta.sql (27/11/2026)
-- "Paguei a parcela da usina solar" pelo WhatsApp = a bolinha de Contas do mês. Antes o Joca só sabia marcar
-- FATURA de cartão como paga (wa_pagar_fatura, 0078); conta fixa, parcela sem cartão (carnê, empréstimo,
-- financiamento) e assinatura fora do cartão viravam "gasto sem valor".
--
-- wa_pagar_conta(grupo, pessoa, tipo, id, competência, valor) faz EXATAMENTE o que o app faz:
--   fixa       → fixas_lancamentos (conta_fixa_id, competência) pago = true, data de hoje; valor diferente do
--                previsto vira o valor real do mês (como digitar o valor em Contas do mês)
--   parcela    → parcelas.paga = true (o id é da PARCELA daquele mês)
--   assinatura → contas_pagas (tipo 'assinatura', referência, competência) pago = true
-- Quem escolhe a conta e o mês é o webhook (motor do app); aqui só confere que tudo é do grupo e não estava pago.
-- Só o servidor chama (service_role): sem grant pra anon/authenticated (função nasce fechada desde a 0064).
-- Idempotente.

create or replace function public.wa_pagar_conta(
  p_grupo uuid, p_usuario uuid, p_tipo text, p_id uuid, p_comp text, p_valor numeric default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fixa public.contas_fixas%rowtype;
  v_lanc public.fixas_lancamentos%rowtype;
  v_parc public.parcelas%rowtype;
  v_ass  record;
  v_real numeric;
begin
  if not exists (select 1 from public.usuarios where id = p_usuario and grupo_id = p_grupo) then
    return jsonb_build_object('ok', false, 'motivo', 'pessoa');
  end if;
  if p_comp is null or p_comp !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('ok', false, 'motivo', 'competencia');
  end if;
  if p_valor is not null and (p_valor <= 0 or p_valor > 10000000) then
    return jsonb_build_object('ok', false, 'motivo', 'valor');
  end if;

  if p_tipo = 'fixa' then
    select * into v_fixa from public.contas_fixas where id = p_id and grupo_id = p_grupo;
    if not found then return jsonb_build_object('ok', false, 'motivo', 'conta'); end if;
    select * into v_lanc from public.fixas_lancamentos where conta_fixa_id = p_id and competencia = p_comp;
    if found and v_lanc.pago then return jsonb_build_object('ok', false, 'motivo', 'ja_paga'); end if;
    -- valor dito diferente do previsto = valor real do mês; senão mantém o real que já tinha (ou nenhum)
    v_real := case when p_valor is not null and abs(p_valor - v_fixa.valor) >= 0.01 then round(p_valor, 2)
                   else v_lanc.valor_real end;
    insert into public.fixas_lancamentos (grupo_id, conta_fixa_id, competencia, valor_previsto, valor_real, pago, data_pagamento, atualizado_em)
    values (p_grupo, p_id, p_comp, v_fixa.valor, v_real, true, v_hoje, now())
    on conflict (conta_fixa_id, competencia) do update
       set valor_real = excluded.valor_real, pago = true, data_pagamento = excluded.data_pagamento, atualizado_em = now();
    insert into public.consumo_ia (grupo_id, usuario_id, origem, quantidade) values (p_grupo, p_usuario, 'whatsapp', 1);
    return jsonb_build_object('ok', true, 'tipo', 'fixa', 'valor', coalesce(v_real, v_fixa.valor));

  elsif p_tipo = 'parcela' then
    select * into v_parc from public.parcelas where id = p_id and grupo_id = p_grupo;
    if not found then return jsonb_build_object('ok', false, 'motivo', 'conta'); end if;
    if exists (select 1 from public.parcelamentos where id = v_parc.parcelamento_id and cartao_id is not null) then
      return jsonb_build_object('ok', false, 'motivo', 'cartao'); -- parcela de cartão se paga pela fatura
    end if;
    if to_char(v_parc.data_vencimento, 'YYYY-MM') <> p_comp then
      return jsonb_build_object('ok', false, 'motivo', 'competencia');
    end if;
    if v_parc.paga then return jsonb_build_object('ok', false, 'motivo', 'ja_paga'); end if;
    update public.parcelas set paga = true where id = p_id;
    insert into public.consumo_ia (grupo_id, usuario_id, origem, quantidade) values (p_grupo, p_usuario, 'whatsapp', 1);
    return jsonb_build_object('ok', true, 'tipo', 'parcela', 'valor', v_parc.valor, 'numero', v_parc.numero);

  elsif p_tipo = 'assinatura' then
    select id, valor into v_ass from public.assinaturas where id = p_id and grupo_id = p_grupo;
    if not found then return jsonb_build_object('ok', false, 'motivo', 'conta'); end if;
    if exists (select 1 from public.contas_pagas
                where tipo = 'assinatura' and referencia_id = p_id and competencia = p_comp and pago) then
      return jsonb_build_object('ok', false, 'motivo', 'ja_paga');
    end if;
    insert into public.contas_pagas (grupo_id, tipo, referencia_id, competencia, valor, pago, data_pagamento)
    values (p_grupo, 'assinatura', p_id, p_comp, round(coalesce(p_valor, v_ass.valor), 2), true, v_hoje)
    on conflict (tipo, referencia_id, competencia) do update
       set valor = excluded.valor, pago = true, data_pagamento = excluded.data_pagamento;
    insert into public.consumo_ia (grupo_id, usuario_id, origem, quantidade) values (p_grupo, p_usuario, 'whatsapp', 1);
    return jsonb_build_object('ok', true, 'tipo', 'assinatura', 'valor', round(coalesce(p_valor, v_ass.valor), 2));
  end if;

  return jsonb_build_object('ok', false, 'motivo', 'tipo');
end; $$;

revoke all on function public.wa_pagar_conta(uuid, uuid, text, uuid, text, numeric) from public, anon, authenticated;
