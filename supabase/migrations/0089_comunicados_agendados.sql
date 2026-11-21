-- 0089 — Comunicados agendados (A8.15, 21/11/2026): o dono escolhe data e hora; a função
-- comunicados-agendados (cron hopefin-comunicados-agendados, a cada 5 min, só quando há algum
-- vencido) manda na hora, com o público calculado no momento do envio. Dá pra cancelar antes.
--
-- Idempotente. DDL só via scripts/db.mjs. Backup antes + smoke depois.

alter table public.comunicados add column if not exists agendado_para timestamptz;
alter table public.comunicados add column if not exists cancelado_em timestamptz;
create index if not exists idx_comunicados_agendados on public.comunicados (agendado_para)
  where enviado_em is null and cancelado_em is null and agendado_para is not null;

create or replace function public.admin_comunicado_cancelar(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  update public.comunicados set cancelado_em = now()
   where id = p_id and enviado_em is null and cancelado_em is null;
  if not found then raise exception 'nao_da_pra_cancelar' using errcode = 'P0001'; end if;
  insert into public.admin_log (admin_id, acao, detalhe) values (auth.uid(), 'comunicado_cancelar', json_build_object('comunicado_id', p_id));
  return json_build_object('ok', true);
end $$;
revoke all on function public.admin_comunicado_cancelar(uuid) from public, anon, authenticated;
grant execute on function public.admin_comunicado_cancelar(uuid) to authenticated;

-- Histórico com a data agendada e o cancelamento.
create or replace function public.admin_comunicados_listar()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'nao_autorizado' using errcode = 'P0001'; end if;
  return (select coalesce(json_agg(t order by t.criado_em desc), '[]'::json) from (
    select c.id, c.titulo, c.texto, c.botao_texto, c.botao_rota, c.publico, c.inativos_dias, c.grupo_id, c.canais,
           c.teste, c.criado_em, c.enviado_em, c.agendado_para, c.cancelado_em, c.destinatarios, c.enviados_push, c.enviados_email,
           (select count(*) from public.comunicado_entregas e where e.comunicado_id = c.id and e.visto_em is not null) as vistos,
           (select count(*) from public.comunicado_entregas e where e.comunicado_id = c.id and e.clicado_em is not null) as clicados
      from public.comunicados c
     order by c.criado_em desc limit 100) t);
end $$;
revoke all on function public.admin_comunicados_listar() from public, anon, authenticated;
grant execute on function public.admin_comunicados_listar() to authenticated;
