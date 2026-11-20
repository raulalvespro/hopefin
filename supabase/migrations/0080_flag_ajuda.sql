-- 0080_flag_ajuda.sql
-- Chave de recurso do botão de Ajuda (L29, 20/11/2026): ícone "?" no topo do app, ao lado do
-- sininho, que abre as perguntas frequentes da tela aberta (curadoria por tela em
-- src/copy/pt-BR.js → copy.ajuda), as dúvidas gerais e o "Fale com a gente" (e-mail).
-- Nasce com audiência 'dono' (como 'importar' na 0070): só o Raul vê até liberar pra todos na
-- Área de desenvolvimento do painel. Sem a chave: nada aparece.
-- Só dado (sem mudança de schema). Idempotente.
insert into public.feature_flags (chave, titulo, descricao, audiencia)
values ('ajuda', 'Botão de Ajuda (perguntas frequentes)',
        'Ícone "?" no topo do app com as perguntas frequentes da tela aberta, dúvidas gerais e "Fale com a gente" (L29). Textos em src/copy/pt-BR.js (copy.ajuda).',
        'dono')
on conflict (chave) do nothing;
