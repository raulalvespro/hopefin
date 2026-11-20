-- ============================================================
-- HopeFin — Migração 0074: categorias que faltavam + renomear sem perder os lançamentos
-- (A8.20, 19/11/2026 noite)
--
-- 1) Grupos NOVOS já nascem com as categorias que faltavam pra uma família (saíram da análise
--    do uso real): filhos, dízimo e doações, impostos e taxas, seguros, presentes, beleza e
--    cuidados, trabalho e empresa. Grupos que já existem NÃO mudam aqui (o do dono foi feito
--    à parte, com o ok dele; os outros só com o ok dele).
-- 2) renomear_categoria(id, nome): renomeia a categoria E os lançamentos dela. Antes, renomear
--    em Categorias trocava só o nome da categoria e os gastos/parcelados/assinaturas/contas/
--    orçamento ficavam com o nome velho (sem ícone, fora da categoria).
-- Idempotente.
-- ============================================================

create or replace function public.seed_categorias_grupo()
returns trigger
language plpgsql
as $$
begin
  insert into public.categorias (grupo_id, nome, emoji, ordem)
  values
    (new.id, 'mercado',            '🛒', 1),
    (new.id, 'transporte',         '⛽', 2),
    (new.id, 'alimentacao',        '🍔', 3),
    (new.id, 'saude',              '💊', 4),
    (new.id, 'lazer',              '🎉', 5),
    (new.id, 'vestuario',          '👕', 6),
    (new.id, 'eletronico',         '📱', 7),
    (new.id, 'moveis',             '🛋️', 8),
    (new.id, 'assinatura',         '📺', 9),
    (new.id, 'moradia',            '🏠', 10),
    (new.id, 'educacao',           '📚', 11),
    (new.id, 'filhos',             '👶', 12),
    (new.id, 'dízimo e doações',   '🙏', 13),
    (new.id, 'impostos e taxas',   '🏛️', 14),
    (new.id, 'seguros',            '🛡️', 15),
    (new.id, 'presentes',          '🎁', 16),
    (new.id, 'beleza e cuidados',  '💈', 17),
    (new.id, 'trabalho e empresa', '💼', 18),
    (new.id, 'outros',             '📦', 99)
  on conflict (grupo_id, nome) do nothing;
  return new;
end;
$$;

create or replace function public.renomear_categoria(p_id uuid, p_nome text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo  uuid := public.meu_grupo_id();
  v_antigo text;
  v_novo   text := lower(btrim(coalesce(p_nome, '')));
begin
  if v_grupo is null then raise exception 'sem_grupo'; end if;
  if v_novo = '' or length(v_novo) > 40 then raise exception 'nome_invalido'; end if;

  select nome into v_antigo from public.categorias where id = p_id and grupo_id = v_grupo for update;
  if v_antigo is null then raise exception 'categoria_nao_encontrada'; end if;
  if v_antigo = v_novo then return true; end if;
  -- "outros" é o destino padrão (WhatsApp, voz, importar): não muda de nome
  if v_antigo = 'outros' then raise exception 'categoria_fixa'; end if;
  if exists (select 1 from public.categorias where grupo_id = v_grupo and nome = v_novo) then
    raise exception 'nome_em_uso';
  end if;

  update public.categorias    set nome = v_novo      where id = p_id;
  update public.gastos        set categoria = v_novo where grupo_id = v_grupo and categoria = v_antigo;
  update public.parcelamentos set categoria = v_novo where grupo_id = v_grupo and categoria = v_antigo;
  update public.assinaturas   set categoria = v_novo where grupo_id = v_grupo and categoria = v_antigo;
  update public.contas_fixas  set categoria = v_novo where grupo_id = v_grupo and categoria = v_antigo;
  update public.orcamentos    set categoria = v_novo where grupo_id = v_grupo and categoria = v_antigo;
  return true;
end;
$$;

-- Função nova nasce fechada (0064): só o app logado usa.
revoke all on function public.renomear_categoria(uuid, text) from public, anon;
grant execute on function public.renomear_categoria(uuid, text) to authenticated;
