-- ============================================================
-- HopeFin — Migração 0076: receber uma parte (A8.4) + dividir conta (A8.6) — 19/11/2026 noite
--
-- a_receber ganha:
--   gasto_id / parcelamento_id — a PARTE de outra pessoa numa compra dividida (A8.6). A compra
--     continua inteira na fatura/no pagamento; só a sua parte conta no seu gasto (motor). Apagou
--     a compra → as partes somem junto. Parcelado: uma linha por parcela (parcela_num/total, mesma
--     serie_id por pessoa).
--   por_conta / credito_de — "Pago por conta" (A8.4): quando a pessoa paga só uma parte, o que não
--     cobre um item inteiro vira um valor NEGATIVO que abate o que ela deve; aponta pra entrada que
--     gerou (apagou a entrada → o crédito some junto).
-- receber_parte_de_pessoa(): quita do mais antigo pro mais novo (ordem que o app manda).
-- desfazer_recebimento(): também apaga o "pago por conta" que aquele recebimento criou.
-- Idempotente.
-- ============================================================

alter table public.a_receber add column if not exists gasto_id uuid references public.gastos(id) on delete cascade;
alter table public.a_receber add column if not exists parcelamento_id uuid references public.parcelamentos(id) on delete cascade;
alter table public.a_receber add column if not exists por_conta boolean not null default false;
alter table public.a_receber add column if not exists credito_de uuid references public.entradas(id) on delete cascade;
create index if not exists a_receber_gasto_idx on public.a_receber(gasto_id) where gasto_id is not null;
create index if not exists a_receber_parcelamento_idx on public.a_receber(parcelamento_id) where parcelamento_id is not null;

-- valor: positivo, ou negativo só no "pago por conta"
alter table public.a_receber drop constraint if exists a_receber_valor_check;
alter table public.a_receber add constraint a_receber_valor_check check (valor > 0 or (por_conta and valor < 0));

-- parcela de a receber: até 600 (parcelados longos divididos, ex.: terrenos)
alter table public.a_receber drop constraint if exists a_receber_parcela_chk;
alter table public.a_receber add constraint a_receber_parcela_chk check (
  (parcela_num is null and parcela_total is null) or
  (parcela_total between 2 and 600 and parcela_num between 1 and parcela_total and serie_id is not null and recorrente = false)
);

-- Recebe um VALOR da pessoa (pode ser só uma parte). p_itens: os itens em aberto dela, na ordem
-- de quitar ([{"t":"gasto|parcela|manual","id":"..."}], créditos primeiro). Quita inteiro o que
-- couber; o que sobrar sem cobrir o próximo item vira "Pago por conta" (negativo, em aberto).
-- Lança UMA entrada com o valor recebido (origem 'reembolso'), se pedido.
create or replace function public.receber_parte_de_pessoa(
  p_pessoa uuid, p_valor numeric, p_itens jsonb,
  p_criar_entrada boolean default true, p_data date default current_date)
returns json language plpgsql security definer set search_path = public as $$
declare
  g uuid := public.meu_grupo_id();
  v_nome text; v_entrada uuid; v_data date := coalesce(p_data, current_date);
  v_resto numeric := round(coalesce(p_valor, 0), 2);
  it jsonb; v_t text; v_id uuid; v_val numeric;
  v_gastos uuid[] := '{}'; v_parcelas uuid[] := '{}'; v_ar uuid[] := '{}'; v_n int := 0;
begin
  if g is null then raise exception 'usuario_sem_grupo' using errcode = 'P0001'; end if;
  select nome into v_nome from public.pessoas where id = p_pessoa and grupo_id = g;
  if v_nome is null then raise exception 'pessoa_invalida' using errcode = 'P0001'; end if;
  if v_resto <= 0 or v_resto > 10000000 then raise exception 'valor_invalido' using errcode = 'P0001'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 2000 then
    raise exception 'itens_invalidos' using errcode = 'P0001';
  end if;

  for it in select value from jsonb_array_elements(p_itens) loop
    v_t := it->>'t';
    begin v_id := (it->>'id')::uuid; exception when others then raise exception 'itens_invalidos' using errcode = 'P0001'; end;
    v_val := null;
    if v_t = 'gasto' then
      select valor into v_val from public.gastos
       where id = v_id and grupo_id = g and pessoa_id = p_pessoa and coalesce(reembolso_status, 'pendente') <> 'quitado';
    elsif v_t = 'parcela' then
      select pr.valor into v_val from public.parcelas pr join public.parcelamentos pm on pm.id = pr.parcelamento_id
       where pr.id = v_id and pr.grupo_id = g and pm.pessoa_id = p_pessoa and not pr.recebido;
    elsif v_t = 'manual' then
      select valor into v_val from public.a_receber
       where id = v_id and grupo_id = g and pessoa_id = p_pessoa and not recebido;
    else
      raise exception 'itens_invalidos' using errcode = 'P0001';
    end if;
    continue when v_val is null;            -- já recebido ou de outra pessoa: ignora
    exit when v_resto + 0.005 < v_val;      -- não cobre este inteiro: para aqui
    v_resto := round(v_resto - v_val, 2);   -- crédito (negativo) aumenta o que sobra
    v_n := v_n + 1;
    if v_t = 'gasto' then v_gastos := v_gastos || v_id;
    elsif v_t = 'parcela' then v_parcelas := v_parcelas || v_id;
    else v_ar := v_ar || v_id; end if;
  end loop;

  if coalesce(p_criar_entrada, true) then
    insert into public.entradas (grupo_id, usuario_id, descricao, valor, tipo, recorrente, recebido, data_recebimento, data, origem)
    values (g, auth.uid(), left('Reembolso · ' || v_nome || case when v_resto > 0.004 then ' (parte)' else '' end, 120),
            round(p_valor, 2), 'avulso', false, true, v_data, v_data, 'reembolso')
    returning id into v_entrada;
  end if;

  update public.gastos set reembolso_status = 'quitado', reembolso_quitado_em = v_data, reembolso_entrada_id = v_entrada
   where id = any(v_gastos) and grupo_id = g and pessoa_id = p_pessoa;
  update public.parcelas pr set recebido = true, reembolso_entrada_id = v_entrada
    from public.parcelamentos pm
   where pm.id = pr.parcelamento_id and pr.id = any(v_parcelas) and pr.grupo_id = g and pm.pessoa_id = p_pessoa;
  update public.a_receber set recebido = true, recebido_em = v_data, entrada_id = v_entrada
   where id = any(v_ar) and grupo_id = g and pessoa_id = p_pessoa;

  if v_resto > 0.004 then
    insert into public.a_receber (grupo_id, pessoa_id, descricao, valor, data, recorrente, recebido, por_conta, credito_de)
    values (g, p_pessoa, 'Pago por conta', -v_resto, v_data, false, false, true, v_entrada);
  end if;

  return json_build_object('ok', true, 'entrada_id', v_entrada, 'quitados', v_n, 'por_conta', greatest(v_resto, 0));
end; $$;
revoke all on function public.receber_parte_de_pessoa(uuid, numeric, jsonb, boolean, date) from public, anon;
grant execute on function public.receber_parte_de_pessoa(uuid, numeric, jsonb, boolean, date) to authenticated;

-- Desfazer: também apaga o "pago por conta" que aquele recebimento criou. Se esse crédito já foi
-- usado num recebimento depois, pede pra desfazer aquele primeiro.
create or replace function public.desfazer_recebimento(p_entrada uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid := public.meu_grupo_id();
begin
  if g is null then raise exception 'usuario_sem_grupo' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.entradas where id = p_entrada and grupo_id = g and origem = 'reembolso') then
    raise exception 'recebimento_invalido' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.a_receber where credito_de = p_entrada and grupo_id = g and recebido) then
    raise exception 'credito_ja_usado' using errcode = 'P0001';
  end if;
  delete from public.a_receber where credito_de = p_entrada and grupo_id = g and not recebido;
  update public.gastos set reembolso_status = 'pendente', reembolso_quitado_em = null, reembolso_entrada_id = null
   where reembolso_entrada_id = p_entrada and grupo_id = g;
  update public.parcelas set recebido = false, reembolso_entrada_id = null
   where reembolso_entrada_id = p_entrada and grupo_id = g;
  update public.a_receber set recebido = false, recebido_em = null, entrada_id = null
   where entrada_id = p_entrada and grupo_id = g;
  delete from public.entradas where id = p_entrada and grupo_id = g;
end; $$;
revoke all on function public.desfazer_recebimento(uuid) from public, anon;
grant execute on function public.desfazer_recebimento(uuid) to authenticated;
