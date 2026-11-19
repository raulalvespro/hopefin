-- 0070_flag_importar.sql
-- Chave de recurso do Importar (A8.1, 19/11/2026). O Raul pediu: o Importar (A4.1) fica só
-- com ele, na Área de desenvolvimento, até estar redondo; depois ele libera pra todos.
-- Nasce com audiência 'dono' (como a busca_filtros da 0068). Com a chave: botão "Importar"
-- no topo de Gastos, card em Configurações e a rota /importar. Sem ela: nada disso aparece.
-- Só dado (sem mudança de schema). Idempotente.
insert into public.feature_flags (chave, titulo, descricao, audiencia)
values ('importar', 'Importar (extrato e fatura)',
        'Importar CSV de extrato ou fatura de cartão com destino (A4.1): botão no topo de Gastos, card em Configurações e a tela /importar. Ao liberar pra todos, voltar a frase do Importar no tour (copy.tour) — o item em Planos volta sozinho.',
        'dono')
on conflict (chave) do nothing;
