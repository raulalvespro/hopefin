-- 0125 — Tarifa do Claude Opus 5.5 em ia_tarifas (26/11/2026), usada pela Edge Function mkt-texto
-- (ajuste de legenda/roteiro da Agência pelo painel). Sem ela, registrar_ia_chamada grava custo 0.
-- Preço oficial: US$ 4 por milhão de tokens de entrada, US$ 20 por milhão de saída. Idempotente.
insert into public.ia_tarifas (modelo, entrada_usd_milhao, saida_usd_milhao)
values ('claude-opus-5-5', 4.0, 20.0)
on conflict (modelo) do update
  set entrada_usd_milhao = excluded.entrada_usd_milhao,
      saida_usd_milhao   = excluded.saida_usd_milhao,
      atualizado_em      = now();
