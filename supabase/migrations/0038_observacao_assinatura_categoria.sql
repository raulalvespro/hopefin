-- 0038 — dois ajustes de uso (aditivos e retrocompatíveis):
--   1) gastos.observacao: campo livre opcional pra anotar um detalhe do gasto.
--   2) assinaturas.categoria: pra tela de Assinaturas virar agregador por categoria.
-- Colunas nulas/com default => todo dado atual segue válido.

alter table public.gastos add column if not exists observacao text;

alter table public.assinaturas add column if not exists categoria text default 'outros';
