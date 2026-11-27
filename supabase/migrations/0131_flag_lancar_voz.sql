-- 0131_flag_lancar_voz.sql
-- Chave do lançar por voz DENTRO do app (A8.26, 27/11/2026): o microfone do Início, de Gastos e do
-- "Lançar vários". Ao contrário das outras chaves, esta nasce LIGADA PRA TODOS (audiência 'todos'): nada muda
-- pra ninguém hoje. Quando o WhatsApp estiver redondo, o Raul troca a audiência na Área de desenvolvimento
-- ("Só eu" = só ele ainda vê o microfone; isso tira o botão de todo mundo sem publicar nada).
-- O áudio pro Joca no WhatsApp não depende desta chave.
-- Só dado (sem mudança de schema). Idempotente.
insert into public.feature_flags (chave, titulo, descricao, audiencia)
values ('lancar_voz', 'Lançar por voz no app (microfone)',
        'Microfone do Início, de Gastos e do "Lançar vários" (A8.26). Nasceu LIGADA pra todos. Pra tirar o microfone do app quando o WhatsApp estiver redondo, troque pra "Só eu". O áudio pro Joca no WhatsApp continua igual.',
        'todos')
on conflict (chave) do nothing;
