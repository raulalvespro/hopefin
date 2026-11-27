-- 0126 — Campos protegidos em public.usuarios (achado 26/11/2026).
--
-- O problema: a regra de UPDATE da tabela usuarios deixa cada pessoa editar a PRÓPRIA linha, e a chave
-- pública do app tinha permissão em todas as colunas. Com o login dela + a chave pública (que está no app),
-- qualquer pessoa conseguia mandar direto pra API: "is_admin = true" / "is_dono_app = true" na própria
-- linha → virava admin, cadastrava o código do celular no 1º acesso e via o painel (nome, e-mail e
-- situação de todos os clientes). Também dava pra marcar "whatsapp_verificado = true" com o telefone de
-- outra pessoa e receber as mensagens dela. Conferido em 26/11: ninguém usou (só o Raul é admin/dono).
--
-- A correção: um gatilho que, quando a mudança vem do app (papel authenticated/anon), mantém os campos
-- sensíveis como estavam. O que é do servidor continua funcionando igual: as funções SECURITY DEFINER
-- (criar_grupo, entrar_no_grupo, gerar/desconectar WhatsApp, admin_*) rodam como dono da função e as
-- Edge Functions usam service_role — o gatilho não mexe nelas.
-- O app só edita direto: nome, foto_url, recebe_comunicados (e o cadastro inicial). Idempotente.

create or replace function public.usuarios_protege_campos()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;   -- servidor (SECURITY DEFINER / service_role / migração): sem restrição
  end if;

  if tg_op = 'INSERT' then
    new.is_admin               := false;
    new.is_dono_app            := false;
    new.whatsapp_verificado    := false;
    new.whatsapp_codigo        := null;
    new.whatsapp_codigo_expira := null;
    new.grupo_id               := null;                    -- grupo só por RPC (criar_grupo / entrar_no_grupo)
    new.email                  := coalesce(auth.jwt() ->> 'email', new.email);
    return new;
  end if;

  -- UPDATE vindo do app: campos sensíveis ficam como estavam
  new.id                     := old.id;
  new.is_admin               := old.is_admin;
  new.is_dono_app            := old.is_dono_app;
  new.whatsapp_verificado    := old.whatsapp_verificado;
  new.whatsapp_codigo        := old.whatsapp_codigo;
  new.whatsapp_codigo_expira := old.whatsapp_codigo_expira;
  new.telefone               := old.telefone;
  new.email                  := old.email;
  new.grupo_id               := old.grupo_id;
  new.criado_em              := old.criado_em;
  return new;
end $$;

revoke all on function public.usuarios_protege_campos() from public, anon, authenticated;

drop trigger if exists usuarios_protege_campos on public.usuarios;
create trigger usuarios_protege_campos
  before insert or update on public.usuarios
  for each row execute function public.usuarios_protege_campos();
