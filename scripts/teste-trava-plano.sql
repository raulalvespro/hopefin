-- Teste automático da TRAVA DO PLANO (A6.3, 19/11/2026) — roda no `npm run smoke`.
-- Tudo acontece numa transação que é DESFEITA no fim (o "raise exception RESULTADO" desfaz):
-- nada fica gravado, nem a assinatura mexida nem os lançamentos de teste.
--
-- Para cada situação da assinatura do grupo da conta de teste, confere com CADA pessoa do grupo:
--   • app e voz: grupo_pode_lancar() dá a resposta certa (o que a RLS usa);
--   • WhatsApp: pode_lancar_grupo() e wa_pode_grupo() (motivo 'assinatura') idem;
--   • gastos, entradas, parcelamentos e transferências: inserir é BARRADO quando o plano trava
--     e LIBERADO quando vale (a mesma regra pra quem criou o grupo e pros agregados);
--   • ler continua liberado com o plano travado ("vencido lê e exporta").
-- O marcador do id (v_uid abaixo) é trocado pelo id da conta de teste em scripts/smoke-login.mjs.
do $$
declare
  v_uid uuid := '__UID__';
  v_gid uuid;
  v_cof uuid;
  v_membros uuid[];
  c record;
  m uuid;
  falhas text[] := '{}';
  casos int := 0;
  checks int := 0;
  pode_db boolean;
  pode_app boolean;
  wa jsonb;
  tab text;
  barrado boolean;
  erro text;
  n_lidos int;
begin
  select grupo_id into v_gid from public.usuarios where id = v_uid;
  if v_gid is null then
    raise exception 'RESULTADO %', json_build_object('erro', 'conta de teste sem grupo');
  end if;
  select array_agg(id order by id) into v_membros from public.usuarios where grupo_id = v_gid;
  select id into v_cof from public.cofrinhos where grupo_id = v_gid limit 1;
  if v_cof is null then
    insert into public.cofrinhos (grupo_id, nome) values (v_gid, 'SMOKE trava') returning id into v_cof;
  end if;

  for c in
    select * from (values
      ('sem assinatura (grupo antigo)',     null::text, false, false, null::interval,     null::interval,     true),
      ('cortesia (mesmo com status expirado)', 'expired', true, false, null,              null,               true),
      ('ativa',                              'active',   false, false, null,               interval '-3 days', true),
      ('ativa, cancela no fim, no prazo',    'active',   false, true,  null,               interval '5 days',  true),
      ('ativa, cancela no fim, já passou',   'active',   false, true,  null,               interval '-1 hour', false),
      ('ativa, cancela sem data de fim',     'active',   false, true,  null,               null,               true),
      ('teste grátis no prazo',              'trial',    false, false, interval '2 days',  null,               true),
      ('teste grátis vencido',               'trial',    false, false, interval '-1 minute', null,             false),
      ('teste grátis sem data de fim',       'trial',    false, false, null,               null,               true),
      ('pagamento pendente',                 'past_due', false, false, null,               interval '10 days', false),
      ('cancelada',                          'canceled', false, false, null,               null,               false),
      ('expirada',                           'expired',  false, false, interval '-10 days', null,              false)
    ) as t(nome, status, cortesia, cancela, fim_trial, fim_periodo, esperado)
  loop
    casos := casos + 1;
    if c.status is null then
      delete from public.subscriptions where grupo_id = v_gid;
    else
      insert into public.subscriptions (grupo_id, status) values (v_gid, c.status)
        on conflict (grupo_id) do nothing;
      update public.subscriptions
         set status = c.status, is_cortesia = c.cortesia, cancel_at_period_end = c.cancela,
             trial_ends_at = case when c.fim_trial is null then null else now() + c.fim_trial end,
             current_period_end = case when c.fim_periodo is null then null else now() + c.fim_periodo end
       where grupo_id = v_gid;
    end if;

    -- WhatsApp (servidor)
    pode_db := public.pode_lancar_grupo(v_gid);
    wa := public.wa_pode_grupo(v_gid);
    checks := checks + 2;
    if pode_db is distinct from c.esperado then
      falhas := falhas || format('%s: pode_lancar_grupo deu %s', c.nome, pode_db);
    end if;
    if not c.esperado and (wa->>'motivo') is distinct from 'assinatura' then
      falhas := falhas || format('%s: WhatsApp não barrou (motivo=%s)', c.nome, coalesce(wa->>'motivo', 'nenhum'));
    elsif c.esperado and (wa->>'motivo') = 'assinatura' then
      falhas := falhas || format('%s: WhatsApp barrou com o plano valendo', c.nome);
    end if;

    -- Cada pessoa do grupo, como o app faz (papel authenticated + o JWT dela)
    foreach m in array v_membros loop
      perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', m::text, true);
      execute 'set local role authenticated';

      pode_app := public.grupo_pode_lancar();
      checks := checks + 1;
      if pode_app is distinct from c.esperado then
        falhas := falhas || format('%s: grupo_pode_lancar() deu %s pra %s', c.nome, pode_app, m);
      end if;

      foreach tab in array array['gastos', 'entradas', 'parcelamentos', 'transferencias'] loop
        barrado := false;
        erro := null;
        begin
          if tab = 'gastos' then
            insert into public.gastos (grupo_id, usuario_id, descricao, valor, tipo_pagamento, data)
            values (v_gid, m, 'SMOKE trava', 1, 'pix', current_date);
          elsif tab = 'entradas' then
            insert into public.entradas (grupo_id, usuario_id, descricao, valor, data)
            values (v_gid, m, 'SMOKE trava', 1, current_date);
          elsif tab = 'parcelamentos' then
            insert into public.parcelamentos (grupo_id, usuario_id, descricao, valor_total, num_parcelas, valor_parcela, data_primeira_parcela)
            values (v_gid, m, 'SMOKE trava', 2, 2, 1, current_date);
          else
            insert into public.transferencias (grupo_id, usuario_id, cofrinho_id, valor, data)
            values (v_gid, m, v_cof, 1, current_date);
          end if;
        exception
          when insufficient_privilege then barrado := true;   -- RLS: "new row violates row-level security policy"
          when others then erro := sqlerrm;
        end;
        checks := checks + 1;
        if erro is not null then
          falhas := falhas || format('%s: %s deu erro inesperado: %s', c.nome, tab, erro);
        elsif barrado = c.esperado then
          falhas := falhas || format('%s: %s %s', c.nome, tab,
            case when barrado then 'BARRADO com o plano valendo' else 'LIBERADO com o plano travado' end);
        end if;
      end loop;

      -- ler continua liberado
      begin
        select count(*) into n_lidos from public.gastos;
      exception when others then
        falhas := falhas || format('%s: leitura de gastos falhou: %s', c.nome, sqlerrm);
      end;
      checks := checks + 1;

      execute 'reset role';
    end loop;
  end loop;

  raise exception 'RESULTADO %', json_build_object(
    'casos', casos, 'pessoas', coalesce(array_length(v_membros, 1), 0), 'checagens', checks, 'falhas', falhas);
end $$;
