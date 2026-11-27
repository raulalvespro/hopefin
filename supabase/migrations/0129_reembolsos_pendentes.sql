-- 0129 — Reembolsos pendentes (27/11/2026, achado no 1º Pix real).
--
-- O cliente pediu o reembolso nos 7 dias (art. 49 do CDC) e o Asaas RECUSOU o estorno por falta de saldo
-- (o Pix entra com a taxa descontada: R$ 24,90 viram R$ 23,91, e o estorno precisa do valor cheio).
-- Antes: erro na tela e nada mudava. Agora: o app cancela na hora (acesso encerrado, nenhuma cobrança nova),
-- registra o reembolso aqui com PRAZO, avisa o dono e tenta de novo sozinho (função reembolsos, cron de hora
-- em hora). Fica 'feito' quando o estorno passa (pela função, pelo painel ou pelo aviso PAYMENT_REFUNDED do
-- Asaas, se o dono estornar direto no painel do Asaas).
--
-- Acesso: só o servidor (service_role) e o painel do dono (sou_admin(), que exige o código do celular).
-- Sem CPF, sem dados de cartão: só IDs do Asaas e o valor.

create table if not exists public.reembolsos_pendentes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null,
  subscription_id uuid,
  titular_id uuid,
  email text,
  nome text,
  valor_centavos integer not null check (valor_centavos > 0),
  metodo text,                                   -- pix | cartao | boleto (o que a pessoa usou)
  asaas_payment_id text,                         -- cobrança avulsa / da assinatura
  asaas_installment_id text,                     -- anual 12x no cartão (estorna o parcelamento inteiro)
  motivo text not null,                          -- o que o Asaas respondeu (ex.: "Saldo insuficiente.")
  pedido_em timestamptz not null default now(),
  prazo_em timestamptz not null,                 -- prometido ao cliente (2 dias úteis)
  status text not null default 'pendente' check (status in ('pendente', 'feito', 'feito_manual', 'cancelado')),
  tentativas integer not null default 0,
  ultima_tentativa_em timestamptz,
  ultimo_erro text,
  ultimo_alerta_dono_em timestamptz,
  feito_em timestamptz,
  feito_por text,                                -- 'automatico' | 'painel' | 'asaas' (aviso do Asaas) | 'manual'
  aviso_cliente_em timestamptz                   -- e-mail "seu reembolso foi feito"
);

create index if not exists reembolsos_pendentes_status_idx on public.reembolsos_pendentes (status, prazo_em);
-- Um pedido aberto por cobrança (evita duplicar se a pessoa clicar duas vezes).
create unique index if not exists reembolsos_pendentes_um_aberto_pag
  on public.reembolsos_pendentes (asaas_payment_id) where status = 'pendente' and asaas_payment_id is not null;
create unique index if not exists reembolsos_pendentes_um_aberto_parc
  on public.reembolsos_pendentes (asaas_installment_id) where status = 'pendente' and asaas_installment_id is not null;

alter table public.reembolsos_pendentes enable row level security;
revoke all on public.reembolsos_pendentes from anon, authenticated;
grant select on public.reembolsos_pendentes to authenticated; -- filtrado pela regra abaixo (só admin com aal2)

drop policy if exists reembolsos_pendentes_admin_select on public.reembolsos_pendentes;
create policy reembolsos_pendentes_admin_select on public.reembolsos_pendentes
  for select to authenticated using (public.sou_admin());
