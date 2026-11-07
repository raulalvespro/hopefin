# HopeFin — Relatório da noite (06/11/2026)

> Fechamento do "Pacote da noite". Tudo testado e commitado; branches locais,
> **nada em produção**. Base de cobrança pronta em **sandbox**.

## 1. O que foi feito

| Prompt | Entrega | Branch / commit |
|---|---|---|
| 1 (5.2) | Hardening do cadastro (bug era auth/e-mail sem SMTP, não RLS) | `fix/cadastro-robustez` (2c7e61a) — **no origin** |
| 2→2.1 (3.7) | Nova oferta (Família, anual destaque + lançamento até 31/12), config única de preços | `feat/oferta-lancamento` (d73e6e1) |
| 3 (3.4) | `subscriptions` + `canUse()` + tela "assinatura vencida" (reconciliado com 0016/0017/0019) | idem acima |
| 4 (3.3) | Asaas **sandbox**: checkout próprio + `asaas-assinar`/`asaas-webhook` | `feat/asaas-sandbox` (5168c4c) — **no origin** |
| 5 (3.6) | Sentry (só erros) + PostHog (sem replay) + cookie consent LGPD | `feat/observabilidade` (4b36b90) — **no origin** |
| 7 (2.2) | **E-mails Resend** (fundação, fim de trial, vencimentos, resumo mensal) + crons | `feat/emails-resend` (f094d04) |
| 8 (3.8) | Painel `/admin` (MRR, trials, cupons…), **não lê lançamentos (LGPD)** | `feat/admin-painel` (274c372) |
| 9 (3.1) | `/termos` e `/privacidade` + checkbox obrigatório + versão do aceite no banco | `feat/aceite-legal` (de60774) |
| 10 | Este relatório | — |
| 11 (4.7) | Lançamento por **voz/texto** (Edge Function `interpretar-lancamento`, Haiku) | `feat/voz-lancamento` (1d8d9f0) |
| 12 | **Ícone/logo novos** + componente `Logo` | `feat/icone-logo` (8cfa7bb) |
| 13 | **Contraste** do texto colorido (vars `-text`, 61 trocas) | `feat/contraste-texto` (d88856b) |

**Crons ativados hoje** (pg_cron no banco de produção do HopeFin):
- `hopefin-digest-diario` — 08:00 BRT
- `hopefin-vencimentos` — 08:30 BRT
- `hopefin-fim-de-trial` — 09:00 BRT
- `hopefin-resumo-mensal` — dia 1, 09:30 BRT

## 2. Tabela de status para a planilha de backlog (ID · status · observação)

| ID | Status | Observação |
|---|---|---|
| 5.2 | Feito | Resolvido via `fix/cadastro-robustez` (já no origin) |
| 3.7 | Feito | Oferta nova + config única de preços (2.1) |
| 3.4 | Feito | `subscriptions` + `canUse` + tela vencida |
| 3.3 | **Parcial (sandbox)** | Checkout + webhook testados no sandbox; falta validar `installmentCount` 12x e ir pra produção |
| 3.6 | Feito | Observabilidade sem replay; consent LGPD |
| 3.5 | **Bloqueado** | Landing (prompt 6) depende da migração Cloudflare (21) |
| 2.2 | Feito | E-mails Resend + crons ativos |
| 3.8 | Feito | `/admin`; não lê lançamentos (LGPD) |
| 3.1 | Feito | Termos/Privacidade + aceite versionado |
| 4.7 | Feito | Voz/texto com IA (Haiku) + limites |
| 12 | Feito | Ícone/logo novos |
| 13 | Feito | Contraste do texto colorido |

## 3. O que você precisa testar / decidir

- **E-mails ao vivo:** os crons já rodam no projeto real. O único grupo real hoje é o
  endereço de teste (`teste.e2e@hopefin.app`), que **não entrega** → bounce inofensivo.
  Quando tiver usuários de verdade, os e-mails chegam sozinhos nos horários acima.
- **Asaas (ponto aberto):** validar no sandbox se a assinatura anual no cartão aceita
  `installmentCount: 12`; se recusar, decidir entre parcelado recriado por ano ou anual
  à vista no cartão.
- **Asaas (ação sua no painel):** setar **Nome comercial = HopeFin** (conta é PF, mostra nome/CPF).
- **Visual:** conferir no celular o ícone novo (readicionar o atalho pra trocar o ícone
  antigo) e o contraste do texto nos dois temas.

## 4. Variáveis / pendências para ir para PRODUÇÃO

**Secrets das Edge Functions já setados** (sandbox): `ANTHROPIC_API_KEY`, `ASAAS_API_KEY`
(sandbox `$aact_hmlg_`), `ASAAS_WEBHOOK_TOKEN` (sandbox), `CRON_SECRET`, `RESEND_API_KEY`,
`VAPID_*`, mais os do Supabase. **Front (`.env`):** `VITE_SUPABASE_*`, `VITE_SENTRY_DSN`,
`VITE_POSTHOG_KEY/HOST` — preenchidos.

**Falta para produção:**
- **`ASAAS_API_KEY` de produção** (`$aact_prod_`) + **`ASAAS_WEBHOOK_TOKEN` de produção** —
  ainda **não existem**; criar só depois de validar o sandbox e migrar pra Cloudflare.
- **Trocar os secrets Asaas sandbox → produção** nas Edge Functions quando for a hora.
- **Migrar Vercel → Cloudflare Workers** (prompt 21) antes do 1º cliente pagante (Free da
  Vercel não permite uso comercial).
- **(Opcional) `OPENAI_API_KEY`** — fallback de transcrição de voz no iPhone PWA; hoje não setado.
- **WhatsApp (11.1):** depende de publicar o app na Meta + número/perfil.

## 5. Estado do repositório

- **Branches no origin (backup hoje):** `feat/emails-resend`, `feat/icone-logo`,
  `feat/contraste-texto` (+ as já existentes `feat/asaas-sandbox`, `feat/observabilidade`,
  `fix/cadastro-robustez`, `main`).
- **Nada na `main`, nada em produção.** Sem workflow de deploy na Vercel (push de feature
  no máximo gera preview).
- Branches locais ainda **não** no origin: `feat/oferta-lancamento`, `feat/voz-lancamento`,
  `feat/admin-painel`, `feat/aceite-legal`, `docs/design-sistema-v2` (e antigas
  `feat/assinaturas-app`, `feat/planos-assinatura`). Os commits delas já viajam dentro da
  pilha empurrada; se quiser cada ref no GitHub, é só pedir.
