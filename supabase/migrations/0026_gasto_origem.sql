-- 0026_gasto_origem.sql
-- Marca COMO cada gasto foi lançado, para o selo "por voz" nos últimos
-- lançamentos do Início (prompt 16). Não altera nenhum gasto existente
-- (todos ficam 'app'); o BotaoVoz passa a gravar 'voz'/'texto' a partir daqui.
--   app      = formulário normal do app
--   voz      = ditado no lançamento rápido
--   texto    = digitado no lançamento rápido
--   whatsapp = lançado pelo WhatsApp (futuro)
alter table public.gastos
  add column if not exists origem text not null default 'app'
  check (origem in ('app', 'voz', 'texto', 'whatsapp'));
