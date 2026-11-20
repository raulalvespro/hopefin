-- 0081 — Chamados de suporte pelo app (Ajuda › "Abrir um chamado", 20/11/2026, pedido do Raul).
--
-- Evolui a caixa de suporte do painel (0045/0052) em vez de criar outra: o chamado aberto no app
-- entra na MESMA tabela (suporte_emails) com origem 'app', ligado a quem abriu. O dono responde no
-- painel (Edge Function admin-suporte-responder) e a resposta aparece no app (Ajuda › Meus
-- chamados), no e-mail e numa notificação da pessoa. Prazo de resposta combinado: 2 dias úteis
-- (prazo_em). O e-mail que chega (origem 'email') segue como estava.
--
-- Segurança: a pessoa NÃO lê a tabela direto (a regra de leitura continua só do admin). Tudo pelo
-- app passa pelas RPCs abaixo (SECURITY DEFINER, só authenticated), que só enxergam os chamados de
-- auth.uid(). Trava contra abuso: até 5 chamados por pessoa a cada 24 h.

-- 1) Colunas novas ---------------------------------------------------------------------------
alter table public.suporte_emails
  add column if not exists origem            text not null default 'email',
  add column if not exists usuario_id        uuid references public.usuarios(id) on delete set null,
  add column if not exists categoria         text,
  add column if not exists tela              text,
  add column if not exists prazo_em          timestamptz,
  add column if not exists resposta_vista_em timestamptz;

do $$ begin
  alter table public.suporte_emails add constraint suporte_emails_origem_check
    check (origem in ('email', 'app'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.suporte_emails add constraint suporte_emails_categoria_check
    check (categoria is null or categoria in ('duvida', 'problema', 'sugestao', 'assinatura', 'outro'));
exception when duplicate_object then null; end $$;

create index if not exists idx_suporte_emails_usuario
  on public.suporte_emails (usuario_id, recebido_em desc) where usuario_id is not null;

comment on column public.suporte_emails.origem is 'email = caixa de e-mail; app = chamado aberto no app (Ajuda)';
comment on column public.suporte_emails.prazo_em is 'Prazo da 1ª resposta (2 dias úteis a partir da abertura)';
comment on column public.suporte_emails.resposta_vista_em is 'Quando a pessoa viu a resposta no app (bolinha da Ajuda)';

-- 2) Prazo: N dias úteis (seg a sex, horário de Brasília) a partir de um momento ------------------
create or replace function public.suporte_prazo(p_de timestamptz, p_dias int default 2)
returns timestamptz language plpgsql stable set search_path = public as $$
declare
  d timestamptz := p_de;
  n int := 0;
begin
  while n < greatest(coalesce(p_dias, 2), 1) loop
    d := d + interval '1 day';
    if extract(isodow from (d at time zone 'America/Sao_Paulo')) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;
revoke all on function public.suporte_prazo(timestamptz, int) from public, anon, authenticated;

-- 3) Abrir um chamado (app) ------------------------------------------------------------------
create or replace function public.suporte_abrir_chamado(
  p_categoria text, p_assunto text, p_mensagem text, p_tela text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_nome    text;
  v_grupo   uuid;
  v_email   text;
  v_msg     text := btrim(coalesce(p_mensagem, ''));
  v_assunto text := btrim(regexp_replace(coalesce(p_assunto, ''), '\s+', ' ', 'g'));
  v_cat     text := lower(btrim(coalesce(p_categoria, '')));
  v_tela    text := nullif(btrim(coalesce(p_tela, '')), '');
  v_id      uuid;
  v_prazo   timestamptz;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = 'P0001'; end if;
  select u.nome, u.grupo_id into v_nome, v_grupo from public.usuarios u where u.id = v_uid;
  if not found then raise exception 'sem_perfil' using errcode = 'P0001'; end if;
  select a.email into v_email from auth.users a where a.id = v_uid;

  if v_cat not in ('duvida', 'problema', 'sugestao', 'assinatura', 'outro') then v_cat := 'outro'; end if;
  if char_length(v_msg) < 10 then raise exception 'mensagem_curta' using errcode = 'P0001'; end if;
  if char_length(v_msg) > 4000 then raise exception 'mensagem_longa' using errcode = 'P0001'; end if;
  if v_assunto = '' then v_assunto := left(regexp_replace(v_msg, '\s+', ' ', 'g'), 80); end if;
  v_assunto := left(v_assunto, 120);
  if v_tela is not null and (char_length(v_tela) > 60 or v_tela !~ '^/[a-z0-9/-]*$') then v_tela := null; end if;

  -- Trava contra abuso: até 5 chamados por pessoa a cada 24 h.
  if (select count(*) from public.suporte_emails s
       where s.usuario_id = v_uid and s.origem = 'app' and s.recebido_em > now() - interval '24 hours') >= 5 then
    raise exception 'muitos_chamados' using errcode = 'P0001';
  end if;

  v_prazo := public.suporte_prazo(now(), 2);
  insert into public.suporte_emails
    (de_email, de_nome, assunto, corpo, status, grupo_id, origem, usuario_id, categoria, tela, prazo_em, recebido_em)
  values
    (coalesce(v_email, ''), v_nome, v_assunto, v_msg, 'novo', v_grupo, 'app', v_uid, v_cat, v_tela, v_prazo, now())
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id, 'prazo_em', v_prazo);
end $$;
revoke all on function public.suporte_abrir_chamado(text, text, text, text) from public, anon, authenticated;
grant execute on function public.suporte_abrir_chamado(text, text, text, text) to authenticated;

-- 4) Meus chamados (só os de quem chama) ------------------------------------------------------
-- situacao: aberto (esperando resposta) · respondido · encerrado (arquivado/spam no painel).
create or replace function public.suporte_meus_chamados()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'nao_autenticado' using errcode = 'P0001'; end if;
  return (
    select coalesce(json_agg(t order by t.recebido_em desc), '[]'::json) from (
      select s.id, s.categoria, s.assunto, s.corpo, s.tela, s.recebido_em, s.prazo_em,
             s.resposta, s.respondido_em,
             case when s.status in ('arquivado', 'spam') then 'encerrado'
                  when s.resposta is not null then 'respondido'
                  else 'aberto' end as situacao,
             (s.respondido_em is not null and (s.resposta_vista_em is null or s.resposta_vista_em < s.respondido_em)) as resposta_nova
      from public.suporte_emails s
      where s.usuario_id = auth.uid() and s.origem = 'app'
      order by s.recebido_em desc
      limit 50
    ) t
  );
end $$;
revoke all on function public.suporte_meus_chamados() from public, anon, authenticated;
grant execute on function public.suporte_meus_chamados() to authenticated;

-- 5) Respostas que a pessoa ainda não viu (bolinha no botão de Ajuda) -------------------------
create or replace function public.suporte_respostas_novas()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.suporte_emails s
   where s.usuario_id = auth.uid() and s.origem = 'app' and s.respondido_em is not null
     and (s.resposta_vista_em is null or s.resposta_vista_em < s.respondido_em);
$$;
revoke all on function public.suporte_respostas_novas() from public, anon, authenticated;
grant execute on function public.suporte_respostas_novas() to authenticated;

-- 6) Marcar as respostas como vistas (abriu "Meus chamados") ---------------------------------
create or replace function public.suporte_marcar_respostas_vistas()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.suporte_emails s set resposta_vista_em = now()
   where s.usuario_id = auth.uid() and s.origem = 'app' and s.respondido_em is not null
     and (s.resposta_vista_em is null or s.resposta_vista_em < s.respondido_em);
end $$;
revoke all on function public.suporte_marcar_respostas_vistas() from public, anon, authenticated;
grant execute on function public.suporte_marcar_respostas_vistas() to authenticated;

-- 7) Painel: a lista passa a trazer origem, categoria, tela e prazo (+ atrasados no SLA) --------
create or replace function public.admin_suporte_listar(p_status text default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select json_build_object(
    'itens', (select coalesce(json_agg(t), '[]'::json) from (
      select s.id, s.de_email, s.de_nome, s.assunto, s.corpo, s.status, s.recebido_em, s.grupo_id,
             s.resposta, s.respondido_em, s.origem, s.usuario_id, s.categoria, s.tela, s.prazo_em,
             s.resposta_vista_em
      from public.suporte_emails s
      where p_status is null or s.status = p_status
      order by s.recebido_em desc limit 200) t),
    'contagem', (select coalesce(json_object_agg(status, q), '{}'::json) from (
      select status, count(*) q from public.suporte_emails group by status) x),
    'sla', (select json_build_object(
        'respondidos', count(*) filter (where respondido_em is not null),
        'pendentes',   count(*) filter (where respondido_em is null and status in ('novo', 'lido')),
        'atrasados',   count(*) filter (where respondido_em is null and status in ('novo', 'lido')
                                          and prazo_em is not null and prazo_em < now()),
        'horas_media_1a_resposta', round(avg(extract(epoch from (respondido_em - recebido_em)) / 3600.0)
                                         filter (where respondido_em is not null)::numeric, 1)
      ) from public.suporte_emails)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_suporte_listar(text) from public, anon;
grant execute on function public.admin_suporte_listar(text) to authenticated;
