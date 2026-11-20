-- 0078_joca_parte1.sql
-- Joca parte 1 (A8.23 + A8.24, 20/11/2026). O WhatsApp passa a entender, além de gasto e
-- entrada: "tá certo?" quando a IA fica em dúvida, "paguei a fatura do X", "apaga o último" e
-- "o valor era 50". E cada chamada de IA do WhatsApp grava o custo real (tokens / áudio).
--
--  1) whatsapp_estado — uma linha por pessoa: a confirmação que espera o "sim" (pendência, vale
--     30 min) e o último lançamento que ela fez pelo WhatsApp (o que "apaga o último" e "o valor
--     era" mexem). Só o servidor (service_role) lê e grava: RLS ligada, sem política.
--  2) wa_salvar_lancamento — IGUAL à 0063 (mesma regra do parcelado no cartão); a mais: devolve o
--     id do que criou e guarda como "último" da pessoa.
--  3) wa_ultimo_lancamento(grupo, pessoa) — o último lançamento da pessoa pelo WhatsApp e se dá
--     pra mexer nele por lá. NÃO mexe (manda pro app): compra de outra pessoa ou dividida, parcelado
--     com parcela já paga, entrada que repete ou ligada a reembolso/virada do mês.
--  4) wa_apagar_ultimo / wa_corrigir_ultimo — apagam / corrigem o valor, conferindo tudo de novo
--     na hora (e que é o MESMO lançamento da pergunta). Corrigir parcelado = valor total novo,
--     parcelas iguais (como a edição do app). Não contam no consumo do mês (é desfazer/arrumar).
--  5) wa_pagar_fatura(grupo, pessoa, cartão, competência, valor) — igual ao "Marcar como paga" de
--     Cartões: contas_pagas (tipo 'fatura') + as parcelas da fatura viram pagas. Conta 1 no
--     consumo do mês, como um lançamento.
--  6) wa_registrar_ia_chamada — custo real de cada chamada de IA do WhatsApp em ia_chamadas (a
--     registrar_ia_chamada do app usa auth.uid(), que é nulo no servidor). Áudio: custo em US$
--     calculado pela duração (p_custo_usd).
--
-- Tudo só para o servidor (service_role): função nova já nasce fechada (0064), e o revoke abaixo
-- deixa explícito. Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

-- 1) Estado da conversa -----------------------------------------------------------
create table if not exists public.whatsapp_estado (
  usuario_id       uuid primary key references public.usuarios(id) on delete cascade,
  grupo_id         uuid not null,          -- sem FK pra grupos (regra do CLAUDE.md: nada que crie 2º caminho grupos<->usuarios)
  pendencia        jsonb,                  -- ação esperando o "sim": { acao, ... }
  pendencia_expira timestamptz,
  ultimo_tipo      text check (ultimo_tipo in ('gasto', 'entrada', 'parcelamento')),
  ultimo_id        uuid,
  ultimo_em        timestamptz,
  atualizado_em    timestamptz not null default now()
);
alter table public.whatsapp_estado enable row level security;
-- sem policies -> nada pra anon/authenticated; só service_role (que ignora a RLS).
revoke all on table public.whatsapp_estado from anon, authenticated;

-- 2) wa_salvar_lancamento: igual à 0063 + devolve o id e guarda o "último" ---------
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
            case when v_cartao is not null then 'cartao' else 'pix' end, v_cartao, v_data, 'whatsapp')
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

-- 3) O último lançamento da pessoa pelo WhatsApp + se dá pra mexer por lá ----------
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

-- 4a) Apagar o último (confere tudo de novo e que é o mesmo da pergunta) -----------
create or replace function public.wa_apagar_ultimo(p_grupo uuid, p_usuario uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb := public.wa_ultimo_lancamento(p_grupo, p_usuario);
begin
  if not coalesce((v->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', coalesce(v->>'motivo', 'nenhum'));
  end if;
  if (v->>'id')::uuid is distinct from p_id then
    return jsonb_build_object('ok', false, 'motivo', 'mudou');
  end if;
  if v->>'bloqueio' is not null then
    return jsonb_build_object('ok', false, 'motivo', v->>'bloqueio');
  end if;

  if v->>'tipo' = 'gasto' then
    delete from public.gastos where id = p_id and grupo_id = p_grupo and usuario_id = p_usuario;
  elsif v->>'tipo' = 'parcelamento' then
    delete from public.parcelamentos where id = p_id and grupo_id = p_grupo and usuario_id = p_usuario;  -- parcelas: on delete cascade
  elsif v->>'tipo' = 'entrada' then
    delete from public.entradas where id = p_id and grupo_id = p_grupo and usuario_id = p_usuario;
  end if;

  update public.whatsapp_estado
     set ultimo_tipo = null, ultimo_id = null, ultimo_em = null, atualizado_em = now()
   where usuario_id = p_usuario;

  return v || jsonb_build_object('ok', true);
end; $$;

-- 4b) Corrigir o valor do último -----------------------------------------------------
create or replace function public.wa_corrigir_ultimo(p_grupo uuid, p_usuario uuid, p_id uuid, p_valor numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v      jsonb := public.wa_ultimo_lancamento(p_grupo, p_usuario);
  v_val  numeric := round(p_valor, 2);
  v_n    int;
  v_parc numeric;
begin
  if v_val is null or v_val <= 0 or v_val > 10000000 then
    return jsonb_build_object('ok', false, 'motivo', 'valor');
  end if;
  if not coalesce((v->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', coalesce(v->>'motivo', 'nenhum'));
  end if;
  if (v->>'id')::uuid is distinct from p_id then
    return jsonb_build_object('ok', false, 'motivo', 'mudou');
  end if;
  if v->>'bloqueio' is not null then
    return jsonb_build_object('ok', false, 'motivo', v->>'bloqueio');
  end if;

  if v->>'tipo' = 'gasto' then
    update public.gastos set valor = v_val where id = p_id and grupo_id = p_grupo and usuario_id = p_usuario;
  elsif v->>'tipo' = 'entrada' then
    update public.entradas set valor = v_val where id = p_id and grupo_id = p_grupo and usuario_id = p_usuario;
  elsif v->>'tipo' = 'parcelamento' then
    -- Como a edição do app: valor total novo e todas as parcelas iguais (nenhuma está paga aqui).
    v_n := greatest(1, coalesce((v->>'num_parcelas')::int, 1));
    v_parc := round(v_val / v_n, 2);
    update public.parcelamentos set valor_total = v_val, valor_parcela = v_parc
     where id = p_id and grupo_id = p_grupo and usuario_id = p_usuario;
    update public.parcelas set valor = v_parc where parcelamento_id = p_id and grupo_id = p_grupo;
  end if;

  update public.whatsapp_estado set atualizado_em = now() where usuario_id = p_usuario;

  return v || jsonb_build_object('ok', true, 'valor_antes', v->'valor', 'valor', v_val,
                                 'valor_parcela', coalesce(v_parc, v_val));
end; $$;

-- 5) "Paguei a fatura do X" = o "Marcar como paga" de Cartões ----------------------
create or replace function public.wa_pagar_fatura(p_grupo uuid, p_usuario uuid, p_cartao uuid, p_comp text, p_valor numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_n int := 0;
begin
  if not exists (select 1 from public.usuarios where id = p_usuario and grupo_id = p_grupo) then
    return jsonb_build_object('ok', false, 'motivo', 'pessoa');
  end if;
  if not exists (select 1 from public.cartoes where id = p_cartao and grupo_id = p_grupo) then
    return jsonb_build_object('ok', false, 'motivo', 'cartao');
  end if;
  if p_comp is null or p_comp !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('ok', false, 'motivo', 'competencia');
  end if;
  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'valor');
  end if;
  if exists (select 1 from public.contas_pagas
              where tipo = 'fatura' and referencia_id = p_cartao and competencia = p_comp and pago) then
    return jsonb_build_object('ok', false, 'motivo', 'ja_paga');
  end if;

  insert into public.contas_pagas (grupo_id, tipo, referencia_id, competencia, valor, pago, data_pagamento)
  values (p_grupo, 'fatura', p_cartao, p_comp, round(p_valor, 2), true, (now() at time zone 'America/Sao_Paulo')::date)
  on conflict (tipo, referencia_id, competencia) do update
     set valor = excluded.valor, pago = true, data_pagamento = excluded.data_pagamento;

  -- As parcelas dessa fatura entram como pagas (as do cartão que vencem no mês da fatura).
  update public.parcelas x
     set paga = true
    from public.parcelamentos p
   where x.parcelamento_id = p.id
     and p.cartao_id = p_cartao and p.grupo_id = p_grupo and x.grupo_id = p_grupo
     and to_char(x.data_vencimento, 'YYYY-MM') = p_comp
     and not x.paga;
  get diagnostics v_n = row_count;

  insert into public.consumo_ia (grupo_id, usuario_id, origem, quantidade)
  values (p_grupo, p_usuario, 'whatsapp', 1);

  return jsonb_build_object('ok', true, 'parcelas', v_n);
end; $$;

-- 6) Custo real de cada chamada de IA do WhatsApp ----------------------------------
create or replace function public.wa_registrar_ia_chamada(
  p_grupo          uuid,
  p_usuario        uuid,
  p_operacao       text,
  p_modelo         text    default null,
  p_tokens_entrada int     default 0,
  p_tokens_saida   int     default 0,
  p_ms             int     default null,
  p_sucesso        boolean default true,
  p_erro           text    default null,
  p_custo_usd      numeric default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_tar   public.ia_tarifas%rowtype;
  v_ent   int := greatest(0, coalesce(p_tokens_entrada, 0));
  v_sai   int := greatest(0, coalesce(p_tokens_saida, 0));
  v_custo numeric(12,6) := 0;
begin
  if p_custo_usd is not null then
    v_custo := least(greatest(0, p_custo_usd), 10);
  else
    select * into v_tar from public.ia_tarifas where modelo = p_modelo;
    if found then
      v_custo := v_ent / 1000000.0 * v_tar.entrada_usd_milhao + v_sai / 1000000.0 * v_tar.saida_usd_milhao;
    end if;
  end if;
  insert into public.ia_chamadas (grupo_id, usuario_id, operacao, modelo, tokens_entrada, tokens_saida, custo_usd, ms, sucesso, erro)
  values (p_grupo, p_usuario, left(coalesce(p_operacao, 'whatsapp'), 60), left(p_modelo, 60), v_ent, v_sai, v_custo,
          greatest(0, p_ms), coalesce(p_sucesso, true), left(p_erro, 300));
end; $$;

-- Trava: tudo só para o servidor (service_role) ------------------------------------
revoke all on function public.wa_salvar_lancamento(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.wa_salvar_lancamento(uuid, uuid, jsonb) to service_role;
revoke all on function public.wa_ultimo_lancamento(uuid, uuid) from public, anon, authenticated;
grant execute on function public.wa_ultimo_lancamento(uuid, uuid) to service_role;
revoke all on function public.wa_apagar_ultimo(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.wa_apagar_ultimo(uuid, uuid, uuid) to service_role;
revoke all on function public.wa_corrigir_ultimo(uuid, uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.wa_corrigir_ultimo(uuid, uuid, uuid, numeric) to service_role;
revoke all on function public.wa_pagar_fatura(uuid, uuid, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.wa_pagar_fatura(uuid, uuid, uuid, text, numeric) to service_role;
revoke all on function public.wa_registrar_ia_chamada(uuid, uuid, text, text, int, int, int, boolean, text, numeric) from public, anon, authenticated;
grant execute on function public.wa_registrar_ia_chamada(uuid, uuid, text, text, int, int, int, boolean, text, numeric) to service_role;
