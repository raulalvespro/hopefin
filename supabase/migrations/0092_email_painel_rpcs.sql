-- 0092_email_painel_rpcs — funções do Painel "E-mails automáticos" e do motor de automações (22/11/2026).
-- Painel (grant authenticated + sou_admin(), que exige o código do celular): admin_email_painel,
-- admin_email_modelo_salvar, admin_email_modelo_excluir, admin_email_sequencia_salvar,
-- admin_remarketing_pessoas, admin_remarketing_pessoa.
-- Servidor (sem grant): automacao_candidatos — quem recebe uma automação criada no Painel.

-- Quem recebe uma automação personalizada hoje. Janela de 3 dias (dias..dias+2) para não perder
-- ninguém se o cron falhar um dia; o email_log (grupo, tipo, ref) garante 1 envio por pessoa/ref.
create or replace function public.automacao_candidatos(p_gatilho text, p_dias int)
returns table (usuario_id uuid, grupo_id uuid, nome text, email text, ref text)
language sql stable security definer set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select u.id, u.grupo_id, u.nome, au.email::text, x.ref
    from public.usuarios u
    join auth.users au on au.id = u.id
    left join public.subscriptions s on s.grupo_id = u.grupo_id
    cross join hoje
    cross join lateral (select case p_gatilho
        when 'apos_cadastro'  then (u.criado_em at time zone 'America/Sao_Paulo')::date
        when 'apos_fim_teste' then (s.trial_ends_at at time zone 'America/Sao_Paulo')::date
        when 'apos_cancelar'  then (coalesce(s.current_period_end, s.canceled_at) at time zone 'America/Sao_Paulo')::date
        when 'sem_entrar'     then (au.last_sign_in_at at time zone 'America/Sao_Paulo')::date
      end as base) b
    cross join lateral (select u.id::text || ':' || coalesce(b.base::text, '') as ref) x
   where u.grupo_id is not null and au.email is not null and u.recebe_comunicados
     and b.base is not null
     and hoje.d - b.base between greatest(coalesce(p_dias, 0), 0) and greatest(coalesce(p_dias, 0), 0) + 2
     and case p_gatilho
           when 'apos_cadastro'  then true
           when 'sem_entrar'     then true
           when 'apos_fim_teste' then s.titular_id = u.id and s.status in ('trial', 'expired')
                                      and not coalesce(s.is_cortesia, false) and s.trial_ends_at < now()
           when 'apos_cancelar'  then s.titular_id = u.id and s.status in ('canceled', 'expired') and s.canceled_at is not null
                                      and not coalesce(s.is_cortesia, false) and coalesce(s.current_period_end, s.canceled_at) < now()
           else false
         end;
$$;
revoke all on function public.automacao_candidatos(text, int) from public, anon, authenticated;

-- Painel: tudo de uma vez (config, sequências, modelos com números).
create or replace function public.admin_email_painel()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  return json_build_object(
    'config', (select row_to_json(c) from public.email_config c where id = 1),
    'sequencias', (select coalesce(json_agg(json_build_object(
        'chave', q.chave, 'nome', q.nome, 'descricao', q.descricao, 'ligada', q.ligada,
        'janela_dias', q.janela_dias, 'intervalo_dias', q.intervalo_dias,
        'ativos', (select count(*) from public.remarketing_pessoas p where p.sequencia = q.chave and p.status = 'ativo'),
        'pausados', (select count(*) from public.remarketing_pessoas p where p.sequencia = q.chave and p.status = 'pausado'),
        'assinaram', (select count(*) from public.remarketing_pessoas p where p.sequencia = q.chave and p.status = 'assinou'),
        'sairam', (select count(*) from public.remarketing_pessoas p where p.sequencia = q.chave and p.status in ('saiu', 'removido')),
        'total', (select count(*) from public.remarketing_pessoas p where p.sequencia = q.chave)
      ) order by q.chave), '[]'::json) from public.email_sequencias q),
    'modelos', (select coalesce(json_agg(t order by t.ordem, t.criado_em), '[]'::json) from (
      select m.*,
        (select count(*) from public.email_log e where e.tipo = m.chave and e.status = 'enviado') as enviados,
        (select count(*) from public.email_log e where e.tipo = m.chave and e.status = 'enviado' and e.criado_em > now() - interval '30 days') as enviados_30d,
        (select count(*) from public.email_log e where e.tipo = m.chave and e.aberto_em is not null) as abertos,
        (select count(*) from public.email_log e where e.tipo = m.chave and e.clicado_em is not null) as clicados,
        (select max(e.criado_em) from public.email_log e where e.tipo = m.chave and e.status = 'enviado') as ultimo_envio,
        case when m.categoria = 'remarketing' then
          (select count(distinct e.titular_id) from public.email_log e
             join public.remarketing_pessoas p on p.usuario_id = e.titular_id and p.assinou_em >= e.criado_em
            where e.tipo = m.chave and e.status = 'enviado')
        end as assinaram_depois
      from public.email_modelos m) t)
  );
end $$;
revoke all on function public.admin_email_painel() from public, anon, authenticated;
grant execute on function public.admin_email_painel() to authenticated;

-- Painel: salvar (p_chave = null cria uma automação nova). p_dados só com os campos que mudam.
create or replace function public.admin_email_modelo_salvar(p_chave text, p_dados jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  m public.email_modelos;
  v_chave text := p_chave;
  v_gatilho text; v_seq text; v_dias int;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  p_dados := coalesce(p_dados, '{}'::jsonb);

  if v_chave is null then
    v_seq := nullif(p_dados->>'sequencia', '');
    v_gatilho := nullif(p_dados->>'gatilho', '');
    if v_seq is not null then
      if not exists (select 1 from public.email_sequencias where chave = v_seq) then raise exception 'sequencia_invalida' using errcode = 'P0001'; end if;
      v_gatilho := null;
    elsif v_gatilho is null or v_gatilho not in ('apos_cadastro', 'apos_fim_teste', 'apos_cancelar', 'sem_entrar') then
      raise exception 'gatilho_invalido' using errcode = 'P0001';
    end if;
    v_chave := 'auto_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
    insert into public.email_modelos (chave, nome, descricao, categoria, para_quem, ligado, personalizado, gatilho, dias, dias_editavel, sequencia, ordem, variaveis)
    values (v_chave, coalesce(nullif(trim(p_dados->>'nome'), ''), 'Automação nova'), null,
            case when v_seq is not null then 'remarketing' else 'personalizado' end, 'cliente',
            false, true, v_gatilho, 0, true, v_seq, case when v_seq is not null then 105 else 200 end, '{ola,nome,oferta}');
  end if;

  select * into m from public.email_modelos where chave = v_chave for update;
  if not found then raise exception 'nao_encontrado' using errcode = 'P0001'; end if;
  if not m.editavel then raise exception 'nao_editavel' using errcode = 'P0001'; end if;

  v_dias := case when (m.dias_editavel or m.personalizado) and p_dados ? 'dias'
                 then least(greatest(coalesce((p_dados->>'dias')::int, 0), 0), 365) else m.dias end;

  update public.email_modelos set
    nome        = case when m.personalizado and p_dados ? 'nome' then coalesce(nullif(trim(p_dados->>'nome'), ''), m.nome) else m.nome end,
    ligado      = case when m.essencial then true when p_dados ? 'ligado' then coalesce((p_dados->>'ligado')::boolean, m.ligado) else m.ligado end,
    dias        = v_dias,
    gatilho     = case when m.personalizado and m.sequencia is null and p_dados ? 'gatilho'
                        and p_dados->>'gatilho' in ('apos_cadastro', 'apos_fim_teste', 'apos_cancelar', 'sem_entrar')
                       then p_dados->>'gatilho' else m.gatilho end,
    data_envio  = case when m.gatilho = 'data_fixa' and p_dados ? 'data_envio' then coalesce((p_dados->>'data_envio')::date, m.data_envio) else m.data_envio end,
    assunto     = case when p_dados ? 'assunto' then nullif(trim(p_dados->>'assunto'), '') else m.assunto end,
    titulo      = case when p_dados ? 'titulo' then nullif(trim(p_dados->>'titulo'), '') else m.titulo end,
    preheader   = case when p_dados ? 'preheader' then nullif(trim(p_dados->>'preheader'), '') else m.preheader end,
    corpo       = case when p_dados ? 'corpo' then nullif(trim(p_dados->>'corpo'), '') else m.corpo end,
    botao_texto = case when p_dados ? 'botao_texto' then nullif(trim(p_dados->>'botao_texto'), '') else m.botao_texto end,
    botao_link  = case when p_dados ? 'botao_link' then nullif(trim(p_dados->>'botao_link'), '') else m.botao_link end,
    atualizado_em = now(), atualizado_por = auth.uid()
  where chave = v_chave
  returning * into m;

  if coalesce(length(m.assunto), 0) not between 3 and 150 then raise exception 'assunto_invalido' using errcode = 'P0001'; end if;
  if coalesce(length(m.corpo), 0) not between 3 and 5000 then raise exception 'texto_invalido' using errcode = 'P0001'; end if;
  if length(coalesce(m.titulo, '')) > 120 or length(coalesce(m.preheader, '')) > 200 then raise exception 'titulo_invalido' using errcode = 'P0001'; end if;
  if m.botao_texto is not null and (length(m.botao_texto) > 30 or m.botao_link is null) then raise exception 'botao_invalido' using errcode = 'P0001'; end if;
  if m.botao_link is not null and m.botao_link !~ '^(/[A-Za-z0-9/?=&_.-]*|https://[^[:space:]"<>]+)$' then raise exception 'link_invalido' using errcode = 'P0001'; end if;

  insert into public.admin_log (admin_id, acao, detalhe)
  values (auth.uid(), case when p_chave is null then 'email_modelo_criar' else 'email_modelo_salvar' end,
          jsonb_build_object('chave', v_chave, 'campos', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_dados) k)));
  return v_chave;
end $$;
revoke all on function public.admin_email_modelo_salvar(text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_email_modelo_salvar(text, jsonb) to authenticated;

-- Painel: excluir uma automação criada no Painel (as de fábrica só desligam).
create or replace function public.admin_email_modelo_excluir(p_chave text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  delete from public.email_modelos where chave = p_chave and personalizado;
  if not found then raise exception 'nao_pode_excluir' using errcode = 'P0001'; end if;
  insert into public.admin_log (admin_id, acao, detalhe) values (auth.uid(), 'email_modelo_excluir', jsonb_build_object('chave', p_chave));
end $$;
revoke all on function public.admin_email_modelo_excluir(text) from public, anon, authenticated;
grant execute on function public.admin_email_modelo_excluir(text) to authenticated;

-- Painel: ligar/pausar uma sequência (e o intervalo mínimo entre e-mails).
create or replace function public.admin_email_sequencia_salvar(p_chave text, p_ligada boolean, p_intervalo int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  update public.email_sequencias set
    ligada = coalesce(p_ligada, ligada),
    intervalo_dias = coalesce(least(greatest(p_intervalo, 3), 60), intervalo_dias),
    atualizado_em = now()
  where chave = p_chave;
  if not found then raise exception 'nao_encontrado' using errcode = 'P0001'; end if;
  insert into public.admin_log (admin_id, acao, detalhe)
  values (auth.uid(), 'email_sequencia_salvar', jsonb_build_object('chave', p_chave, 'ligada', p_ligada, 'intervalo', p_intervalo));
end $$;
revoke all on function public.admin_email_sequencia_salvar(text, boolean, int) from public, anon, authenticated;
grant execute on function public.admin_email_sequencia_salvar(text, boolean, int) to authenticated;

-- Painel: quem está no remarketing, em que etapa e o que aconteceu com cada e-mail.
create or replace function public.admin_remarketing_pessoas()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  return (select coalesce(json_agg(t order by t.criado_em desc), '[]'::json) from (
    select p.id, p.sequencia, p.entrou_em, p.status, p.status_em, p.assinou_em, p.criado_em,
           u.nome, au.email::text as email, g.nome as grupo,
           (select coalesce(json_agg(json_build_object('chave', e.tipo, 'enviado_em', e.criado_em, 'status', e.status,
                     'aberto_em', e.aberto_em, 'clicado_em', e.clicado_em, 'problema', e.problema) order by e.criado_em), '[]'::json)
              from public.email_log e
              join public.email_modelos m on m.chave = e.tipo and m.categoria = 'remarketing'
             where e.titular_id = p.usuario_id) as envios
      from public.remarketing_pessoas p
      join public.usuarios u on u.id = p.usuario_id
      left join auth.users au on au.id = p.usuario_id
      left join public.grupos g on g.id = p.grupo_id
     order by p.criado_em desc limit 500) t);
end $$;
revoke all on function public.admin_remarketing_pessoas() from public, anon, authenticated;
grant execute on function public.admin_remarketing_pessoas() to authenticated;

-- Painel: pausar, retomar ou tirar alguém da sequência.
create or replace function public.admin_remarketing_pessoa(p_id uuid, p_acao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  update public.remarketing_pessoas set
    status = case p_acao when 'pausar' then 'pausado' when 'retomar' then 'ativo' when 'remover' then 'removido' end,
    status_em = now()
  where id = p_id
    and ((p_acao = 'pausar' and status = 'ativo') or (p_acao = 'retomar' and status = 'pausado')
         or (p_acao = 'remover' and status in ('ativo', 'pausado')));
  if not found then raise exception 'acao_invalida' using errcode = 'P0001'; end if;
  insert into public.admin_log (admin_id, acao, detalhe) values (auth.uid(), 'remarketing_' || p_acao, jsonb_build_object('id', p_id));
end $$;
revoke all on function public.admin_remarketing_pessoa(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_remarketing_pessoa(uuid, text) to authenticated;
