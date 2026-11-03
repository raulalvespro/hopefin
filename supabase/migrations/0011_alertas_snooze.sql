-- 11: soneca de alerta ("lembrar amanhã").
-- lembrar_em NULL  -> alerta dispensado de vez.
-- lembrar_em data  -> em soneca; o alerta volta a aparecer nessa data.
alter table public.alertas_dispensados add column if not exists lembrar_em date;
