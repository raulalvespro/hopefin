-- 0052 — Fase 5.1: suporte helpdesk (sem enviar e-mail).
--  • status ganha 'spam' (amplia o CHECK; valores atuais seguem válidos).
--  • respostas prontas (canned): tabela + RPCs admin (listar/salvar/remover) + seed.
--  • admin_suporte_listar passa a devolver 'sla' (tempo médio até a 1ª resposta)
--    e o código do ticket é derivado do id no front (sem coluna nova).
-- Tudo guardado por sou_admin() (SECURITY DEFINER). Não dispara nada.

-- 1) status: + 'spam' ------------------------------------------------------
alter table public.suporte_emails drop constraint if exists suporte_emails_status_check;
alter table public.suporte_emails add constraint suporte_emails_status_check
  check (status = any (array['novo','lido','respondido','arquivado','spam']));

-- 2) respostas prontas -----------------------------------------------------
create table if not exists public.suporte_respostas_prontas (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  corpo      text not null,
  ordem      int  not null default 100,
  criado_em  timestamptz not null default now()
);
alter table public.suporte_respostas_prontas enable row level security;
-- sem policy: só as RPCs SECURITY DEFINER (abaixo) e o service_role acessam.

-- seed idempotente (só na primeira vez; não sobrescreve edições do dono).
insert into public.suporte_respostas_prontas (titulo, corpo, ordem)
select * from (values
  ('Acesso / login', E'Oi! Para entrar, use o e-mail cadastrado e toque em "Esqueci minha senha" na tela de login — chega um link para criar uma nova. Se não aparecer, confere a caixa de spam. Qualquer coisa, me chama por aqui. 🙂', 10),
  ('Como cancelar', E'Você pode cancelar a qualquer momento em Configurações › Assinatura › Cancelar. O acesso continua até o fim do período já pago e nada é cobrado depois. Se preferir, eu cancelo por aqui para você — é só confirmar.', 20),
  ('Reembolso (7 dias)', E'Nos primeiros 7 dias da primeira cobrança você tem direito a reembolso integral (art. 49 do CDC). É só usar "Cancelar e pedir reembolso" em Configurações › Assinatura, que o estorno é automático. Se tiver passado dos 7 dias, me avisa que a gente vê juntos.', 30),
  ('Recebido — estou vendo', E'Recebi sua mensagem e já estou olhando! Volto em breve com uma resposta. Obrigado pela paciência. 🙏', 40),
  ('Encerramento', E'Fico feliz em ajudar! Se precisar de mais alguma coisa, é só responder este e-mail. Um abraço e bom uso do HopeFin! 💚', 50)
) v(titulo, corpo, ordem)
where not exists (select 1 from public.suporte_respostas_prontas);

create or replace function public.admin_respostas_listar()
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select coalesce(json_agg(t order by t.ordem, t.titulo), '[]'::json) into r
  from (select id, titulo, corpo, ordem from public.suporte_respostas_prontas) t;
  return r;
end; $$;
revoke all on function public.admin_respostas_listar() from public;
grant execute on function public.admin_respostas_listar() to authenticated;

create or replace function public.admin_resposta_salvar(
  p_id uuid default null, p_titulo text default null,
  p_corpo text default null, p_ordem int default 100
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_titulo),'') = '' or coalesce(btrim(p_corpo),'') = '' then
    raise exception 'titulo e corpo obrigatorios' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.suporte_respostas_prontas (titulo, corpo, ordem)
    values (btrim(p_titulo), p_corpo, coalesce(p_ordem,100)) returning id into v_id;
    insert into public.admin_log (admin_id, acao, detalhe)
      values (auth.uid(), 'suporte_resposta_criada', json_build_object('id', v_id, 'titulo', btrim(p_titulo)));
  else
    update public.suporte_respostas_prontas
      set titulo = btrim(p_titulo), corpo = p_corpo, ordem = coalesce(p_ordem,100)
      where id = p_id returning id into v_id;
    insert into public.admin_log (admin_id, acao, detalhe)
      values (auth.uid(), 'suporte_resposta_editada', json_build_object('id', v_id, 'titulo', btrim(p_titulo)));
  end if;
  return v_id;
end; $$;
revoke all on function public.admin_resposta_salvar(uuid,text,text,int) from public;
grant execute on function public.admin_resposta_salvar(uuid,text,text,int) to authenticated;

create or replace function public.admin_resposta_remover(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  delete from public.suporte_respostas_prontas where id = p_id;
  insert into public.admin_log (admin_id, acao, detalhe)
    values (auth.uid(), 'suporte_resposta_removida', json_build_object('id', p_id));
end; $$;
revoke all on function public.admin_resposta_remover(uuid) from public;
grant execute on function public.admin_resposta_remover(uuid) to authenticated;

-- 3) admin_suporte_listar + SLA e respondido_em ----------------------------
create or replace function public.admin_suporte_listar(p_status text default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  select json_build_object(
    'itens', (select coalesce(json_agg(t), '[]'::json) from (
      select id, de_email, de_nome, assunto, corpo, status, recebido_em, grupo_id, resposta, respondido_em
      from public.suporte_emails
      where p_status is null or status = p_status
      order by recebido_em desc limit 200) t),
    'contagem', (select coalesce(json_object_agg(status, q), '{}'::json) from (
      select status, count(*) q from public.suporte_emails group by status) x),
    'sla', (select json_build_object(
        'respondidos', count(*) filter (where respondido_em is not null),
        'pendentes',   count(*) filter (where respondido_em is null and status in ('novo','lido')),
        'horas_media_1a_resposta', round(avg(extract(epoch from (respondido_em - recebido_em))/3600.0)
                                         filter (where respondido_em is not null)::numeric, 1)
      ) from public.suporte_emails)
  ) into r;
  return r;
end; $$;
revoke all on function public.admin_suporte_listar(text) from public;
grant execute on function public.admin_suporte_listar(text) to authenticated;
