-- 0039_gasto_fatura_ajuste — permite CORRIGIR em qual fatura do cartão um gasto entra.
--
-- Problema: a fatura de um gasto é derivada da data (ciclo fechamento→vencimento). Mas em
-- casos de borda (compra no dia do fechamento, lançamento retroativo, estorno) o cartão real
-- pode ter jogado a compra pra outra fatura. Antes só dava pra mover PARCELAS; gasto normal não.
--
-- `fatura_ajuste` = nº de faturas a deslocar a partir da fatura natural (por data):
--   0 = fatura natural (padrão), +1 = joga pra próxima, -1 = volta pra anterior, etc.
-- O front calcula a fatura natural pela data e soma esse ajuste. A DATA real do gasto não muda
-- (continua certa em Gastos, mês, projeção) — só muda em qual fatura do cartão ele é contado.
-- Aditiva: default 0 => todo gasto atual segue na fatura natural, sem mudança de comportamento.

alter table public.gastos add column if not exists fatura_ajuste int not null default 0;
