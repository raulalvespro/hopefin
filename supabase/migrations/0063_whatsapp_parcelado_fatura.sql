-- 0063_whatsapp_parcelado_fatura.sql
-- WhatsApp: parcelado no cartão segue a regra da compra à vista (A2.5) + trava das
-- funções do WhatsApp.
--
-- Decisão do Raul (18/11/2026): no parcelado NOVO no cartão a 1ª parcela cai na mesma
-- fatura em que a compra à vista cairia, e o 1º vencimento guardado
-- (parcelamentos.data_primeira_parcela) é o dia em que essa fatura vence. O app
-- (formulário e voz) já faz isso com primeiroVencimentoParcelado() do motor
-- (supabase/functions/_shared/motor.js). O WhatsApp ainda gravava a data da compra, e a
-- 1ª parcela ficava uma fatura antes em cartão que vence no mês seguinte ao fechamento
-- (ex.: fecha 26, vence 10) ou em compra feita no dia do fechamento ou depois.
--
--  1) vencimento_fatura_por_dias(fechamento, vencimento, regra, data) — espelho em SQL
--     de vencimentoDaComp(cartao, compDaCompra(cartao, data)) do motor, sem ler tabela:
--       • fechamento = dia_fechamento no mês da compra, limitado ao fim do mês;
--       • compra NO dia do fechamento vai pra próxima fatura, salvo regra 'atual';
--       • vencimento no dia <= fechamento => a fatura vence no mês seguinte ao fechamento;
--       • devolve o dia_vencimento nesse mês, limitado ao fim do mês.
--     Sem dia cadastrado (nulo ou 0): os mesmos padrões do motor (fecha 1, vence 10).
--     MUDOU A REGRA NO MOTOR? Mude aqui também (tests/motor.test.js tem os casos).
--  2) vencimento_da_fatura_da_compra(cartão, data) — a mesma conta lendo o cartão.
--  3) wa_salvar_lancamento — IGUAL à 0056; só muda o 1º vencimento do parcelado no
--     cartão. Cartão não encontrado: segue a data da compra, como antes.
--  4) Trava: as funções do WhatsApp são só do servidor (service_role). O
--     "revoke ... from public" da 0055/0056/0059 não bastava: o Supabase dá EXECUTE a
--     anon e authenticated em toda função nova do schema public, e com a chave pública
--     do app dava pra achar o grupo pelo número do WhatsApp (wa_usuario), lançar nele
--     (wa_salvar_lancamento) ou puxar o número de alguém pra outra conta (wa_conectar).
--     Nenhuma tela usa essas funções; só a Edge Function whatsapp-webhook (service_role).
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

-- 1) Núcleo da regra (sem tabela) -------------------------------------------------
create or replace function public.vencimento_fatura_por_dias(
  p_dia_fechamento int, p_dia_vencimento int, p_compra_no_fechamento text, p_data date)
returns date language plpgsql immutable set search_path = public as $$
declare
  v_fech     int  := coalesce(nullif(p_dia_fechamento, 0), 1);     -- motor: diaF()
  v_venc     int  := coalesce(nullif(p_dia_vencimento, 0), 10);    -- motor: diaV()
  v_mes      date := date_trunc('month', p_data::timestamp)::date; -- 1º dia do mês da compra
  v_dias     int;
  v_fechou   date;
  v_proxima  boolean;
  v_mes_venc date;
begin
  if p_data is null then return null; end if;

  -- Dia do fechamento no mês da compra (31 em fevereiro vira 28/29). motor: fechamentoNoMes()
  v_dias   := extract(day from (v_mes + interval '1 month' - interval '1 day'))::int;
  v_fechou := v_mes + (least(greatest(v_fech, 1), v_dias) - 1);

  -- Compra NO dia do fechamento vai pra próxima fatura, salvo regra 'atual'.
  v_proxima := case when p_compra_no_fechamento = 'atual' then p_data > v_fechou
                    else p_data >= v_fechou end;

  -- Mês em que a fatura vence: +1 se foi pra próxima, +1 se vence no mês seguinte ao
  -- fechamento (vencimento no dia <= fechamento). motor: compDaCompra()
  v_mes_venc := (v_mes + make_interval(months =>
                   (case when v_proxima then 1 else 0 end)
                 + (case when v_venc <= v_fech then 1 else 0 end)))::date;

  -- Dia do vencimento nesse mês, limitado ao fim do mês. motor: vencimentoDaComp()
  v_dias := extract(day from (v_mes_venc + interval '1 month' - interval '1 day'))::int;
  return v_mes_venc + (least(greatest(v_venc, 1), v_dias) - 1);
end; $$;

-- 2) A mesma conta lendo o cartão (nulo se o cartão não existe) -------------------
create or replace function public.vencimento_da_fatura_da_compra(p_cartao uuid, p_data date)
returns date language sql stable set search_path = public as $$
  select public.vencimento_fatura_por_dias(c.dia_fechamento, c.dia_vencimento, c.compra_no_fechamento, p_data)
    from public.cartoes c
   where c.id = p_cartao;
$$;

-- 3) wa_salvar_lancamento: igual à 0056, só o 1º vencimento do parcelado no cartão --
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
    -- A2.5: a 1ª parcela vence no dia em que vence a fatura da compra (igual ao app).
    insert into public.parcelamentos
      (grupo_id, usuario_id, descricao, valor_total, num_parcelas, valor_parcela, cartao_id, categoria, data_primeira_parcela)
    values (p_grupo, p_usuario, v_desc, v_valor, v_parc, round(v_valor / v_parc, 2), v_cartao, v_categoria,
            coalesce(public.vencimento_da_fatura_da_compra(v_cartao, v_data), v_data));
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

-- 4) Trava: funções do WhatsApp só para o servidor (service_role) -----------------
revoke all on function public.vencimento_fatura_por_dias(int, int, text, date) from public, anon, authenticated;
grant execute on function public.vencimento_fatura_por_dias(int, int, text, date) to service_role;
revoke all on function public.vencimento_da_fatura_da_compra(uuid, date) from public, anon, authenticated;
grant execute on function public.vencimento_da_fatura_da_compra(uuid, date) to service_role;
revoke all on function public.wa_salvar_lancamento(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.wa_salvar_lancamento(uuid, uuid, jsonb) to service_role;
revoke all on function public.wa_pode_grupo(uuid) from public, anon, authenticated;
grant execute on function public.wa_pode_grupo(uuid) to service_role;
revoke all on function public.pode_lancar_grupo(uuid) from public, anon, authenticated;
grant execute on function public.pode_lancar_grupo(uuid) to service_role;
revoke all on function public.wa_usuario(text) from public, anon, authenticated;
grant execute on function public.wa_usuario(text) to service_role;
revoke all on function public.wa_conectar(text, text) from public, anon, authenticated;
grant execute on function public.wa_conectar(text, text) to service_role;
