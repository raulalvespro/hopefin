-- 6: assinatura pode ser cobrada em um cartão (aparece na fatura dele).
alter table public.assinaturas add column if not exists cartao_id uuid references public.cartoes(id) on delete set null;
