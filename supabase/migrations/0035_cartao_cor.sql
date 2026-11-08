-- 0035_cartao_cor — cor opcional do cartão, para identificação visual rápida na lista.
-- Guarda um hex escolhido de uma paleta fixa no app (ex.: '#8B5CF6'). Null = usa o accent.
-- Aditiva e retrocompatível: o app atual ignora a coluna.
alter table public.cartoes add column if not exists cor text;
