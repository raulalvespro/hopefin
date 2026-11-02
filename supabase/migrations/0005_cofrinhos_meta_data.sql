-- 4.4 Metas ligadas a cofrinhos: prazo-alvo opcional para a meta.
-- Permite calcular quanto guardar por mês e projetar a data de conclusão.
alter table public.cofrinhos add column if not exists meta_data date;
