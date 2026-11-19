-- 0068_flag_busca_filtros.sql
-- Chave de recurso da busca e filtros (A3.1, 19/11/2026). Nasce só no usuário do dono
-- (audiência 'dono'), como o Raul pediu; ele libera pra todos na Área de desenvolvimento do /admin.
-- Só dado (sem mudança de schema). Idempotente.
insert into public.feature_flags (chave, titulo, descricao, audiencia)
values ('busca_filtros', 'Busca e filtros',
        'Busca enquanto digita + filtros (período, categoria, cartão, pessoa, tipo e valor) com o total do que foi filtrado, em Gastos, Parcelamentos e Assinaturas (A3.1).',
        'dono')
on conflict (chave) do nothing;
