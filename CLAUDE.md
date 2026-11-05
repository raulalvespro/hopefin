# HopeFin — guia do projeto (para o Claude e para o Raul)

App de **finanças da família/casal**, em português, simples e compartilhado (um grupo
= casal/família no mesmo painel). Diferenciais: lançamento rápido (voz hoje, WhatsApp
depois), **planejado × praticado** nas contas recorrentes, grupo compartilhado de verdade.

> Este arquivo não existia até 05/11/2026. O histórico do que foi construído está no
> **código** (`src/`), em **`docs/`** (ROADMAP + LGPD), em **`supabase/`** (schema.sql +
> migrations 0001–00NN + README) e no **git log**. Nada se perdeu — só faltava este índice.

---

## Stack

- **Front:** React 18 + Vite 5, React Router 6, Recharts, lucide-react, date-fns. Sem TS.
- **PWA:** `vite-plugin-pwa` (instalável, push). Componente `InstalarApp`, `src/lib/push.js`.
- **Backend:** Supabase **próprio** do HopeFin — ref `oapcjmkklzaodgpuwjsh` (conta
  **separada** do SGQ). Auth + Postgres + Edge Functions.
- **Hospedagem:** hoje na **Vercel** (`vercel.json` com rewrite de SPA). Migração para
  **Cloudflare** planejada (prompt 21).

Rodar local: `npm run dev` (porta 5173, ver `.claude/launch.json`).

## Estrutura

- `src/pages/` — 22 telas (Dashboard, Gastos, Entradas, Cartões, ContasFixas,
  ContasDoMes, Assinaturas, Parcelamentos, Projecao, Cofrinhos, Orcamento, Categorias,
  Fechamento, Importar, Historico, Notificacoes, Planos, MeusDados, Login…).
- `src/contexts/` — `AuthContext`, `ThemeContext`, `ToastContext`.
- `src/hooks/` — `useDb`, `useCategorias`, `useAlertas`, `useVoz`.
- `src/lib/` — `supabase.js` (client), `format.js`, `push.js`.
- `docs/` — `ROADMAP_HOPEFIN.md` (auditoria + plano comercial), LGPD (política + termos).
- `supabase/` — `schema.sql` (espelho de leitura), `migrations/`, `functions/`, `seed/`,
  `README.md`, `.env.local` (gitignored, com token/segredos).
- `scripts/` — `db.mjs`, `set-secrets.mjs`, `gen-vapid.mjs`, `setup-cron.mjs`.

---

## Banco de dados (regras importantes)

- **DDL/migrations do HopeFin SÓ via `scripts/db.mjs`** (Management API, lê
  `supabase/.env.local`). **NUNCA** rodar DDL do HopeFin pelo MCP do Supabase.
- Uma migração por mudança: `supabase/migrations/NNNN_descricao.sql`, ordem numérica,
  idempotente quando possível. `schema.sql` é espelho consolidado (atualizar ao criar
  tabela nova).
- Comandos:
  ```bash
  node scripts/db.mjs supabase/migrations/00NN_x.sql   # roda um arquivo
  node scripts/db.mjs -e "select count(*) from gastos" # SQL pontual
  node scripts/db.mjs --migrate                        # roda todas (idempotentes)
  ```
- **RLS por grupo:** helper `meu_grupo_id()` (SECURITY DEFINER evita recursão). Entrar/
  criar grupo via RPC (`entrar_no_grupo`, `criar_grupo`). Tabelas de dados usam política
  `FOR ALL ... using (grupo_id = meu_grupo_id())`.

## Chaves e segredos — onde cada coisa vai

- **Front (público, embutido no bundle) → `.env`** (gitignored; prefixo `VITE_`):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, e quando entrarem: `VITE_SENTRY_DSN`,
  `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`.
- **Servidor/privado → `supabase/.env.local`** (gitignored): `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_PROJECT_REF`, `VAPID_*`, `CRON_SECRET`, e quando entrarem: `ASAAS_API_KEY`
  (sandbox), `ASAAS_WEBHOOK_TOKEN`, `RESEND_API_KEY`. Daí vão para as Edge Functions
  via `scripts/set-secrets.mjs` (Management API `/secrets`).
- **NUNCA** colocar chave no código ou no chat. **NUNCA** a `service_role` no front.
  **NUNCA** guardar CPF ou dados de cartão no nosso banco (o Asaas guarda; guardamos só
  os IDs de referência dele).

---

## Comercial (decidido em 05/11/2026)

- **Cobrança** no CPF do dono (conta Asaas sem CNPJ ainda), via **Asaas**. Hoje tudo em
  **SANDBOX** — nada em produção.
- **Plano Família:** R$ 19,90/mês ou R$ 149,90/ano. **Trial 14 dias, sem cartão.**
- **Preço de fundador:** R$ 14,90/mês ou R$ 119,90/ano para os **100 primeiros que
  PAGAREM** (não conta trial). Travado enquanto a assinatura seguir **ativa**; se cancelar
  e voltar, volta ao preço padrão.
- Modelo: **um plano pago + trial** no começo (sem free tier por ora). Free limitado só
  se virar funil de aquisição; múltiplos planos pagos só com Open Finance.

### Assinatura do app no banco (migrações 0016 + 0017)
- Tabela `public.subscriptions` (criada como `assinaturas_app` na 0016, **renomeada** na
  0017): **uma por grupo**. Status `trial | active | past_due | canceled | expired`
  (default `trial`), `ciclo`, `is_fundador`, `preco_centavos` (travado), datas de
  trial/período, IDs do Asaas. RLS de select por grupo (`meu_grupo_id()`).
- Tabela `public.planos_config` (0017): **linha única** (`id = 1`) com os preços em
  centavos (família 1990/14990, fundador 1490/11990), `fundador_limite` (100),
  `fundador_usados`, `trial_dias` (14). Escrita só por `service_role`/SECURITY DEFINER;
  select liberado para `anon` (para a landing).
- **RPCs** (todas `SECURITY DEFINER`):
  - `iniciar_trial_familia(dias int default null)` — cria a linha de trial do grupo no
    1º acesso (idempotente; `dias` vem de `planos_config.trial_dias`). Chamada no
    `AuthContext` ao carregar o perfil com grupo.
  - `planos_publicos()` — JSON de preços + `fundador_vagas` (limite − usados) para a
    página de Planos e a landing (`grant` a `anon`).
  - `contar_fundadores()` — quantos já pegaram vaga de fundador.
  - `reservar_vaga_fundador(p_grupo)` — reserva **atômica** (nunca passa de 100); **sem
    grant**, só o webhook do Asaas (service_role) executa, no 1º pagamento confirmado.
  - `grupo_pode_lancar()` — true se `active`, trial válido, ou grupo legado (sem linha).
- **Trava de novos lançamentos:** policies RLS **restrictive de INSERT**
  (`<tabela>_insert_assinatura`) em `gastos/entradas/parcelamentos/transferencias`, com
  `with check (grupo_pode_lancar())`. Vencido/inadimplente **lê e exporta**, mas não
  cria lançamento. UX espelhada no front: `useAssinatura` + `BannerAssinatura`.
- Mudança de status/preço vem **só** do webhook do Asaas (service_role) ou dessas RPCs.

## Integrações planejadas (ainda não no código)

- **Asaas** (sandbox): assinatura + webhook (Edge Function) para status trial/ativo/
  inadimplente e trava de features por status.
- **Resend**: e-mails (lembrete de vencimento, fim de trial, resumo). Remetente num
  domínio verificado (`contato@hopefin.com.br` / caixas na Hostinger).
- **Sentry**: erros em produção. **PostHog**: analytics de uso.

## Domínios

- `hopefin.com.br` — site + páginas legais. `app.hopefin.com.br` — o app (Vercel por ora).
- `admin.hopefin.com.br` — **painel do dono**: planejado como **rota protegida dentro do
  próprio app**, no mesmo banco (modelo parecido com a "Central" do SGQ Tech), não um
  projeto separado.
- Domínio registrado na **Hostinger**; **DNS e site na Cloudflare**; caixas de e-mail na
  Hostinger (plano Business).

---

## Infraestrutura e contas (atualizado 05/11/2026)

### DNS e hospedagem
- **DNS de `hopefin.com.br` na Cloudflare** (nameservers `galilea`/`gerardo`.ns.cloudflare.com);
  domínio segue **registrado na Hostinger**. **Todo registro DNS novo é criado na
  Cloudflare, nunca na Hostinger.**
- **`hopefin.com.br` e `www`** servem um **Worker da Cloudflare `hopefin-site`** (static
  assets) — hoje só uma página "em construção" por upload. A **landing** (prompt 6) virá
  do repo **`hopefin-site`** ligado a esse Worker. Usar **Workers com static assets, não o
  Pages antigo**.
- **`app.hopefin.com.br`** → CNAME (proxy **desligado**) para o projeto **hopefin na
  Vercel**; `hopefin.vercel.app` segue ativo.
- **Supabase Auth:** Site URL `https://app.hopefin.com.br`; Redirect URLs
  `https://app.hopefin.com.br/**`, `https://hopefin.vercel.app/**`, `http://localhost:5173/**`.
- **Migração Vercel → Cloudflare (Workers static assets) antes do 1º cliente pagante
  (prompt 21)** — o plano Free da Vercel não permite uso comercial.

### E-mail
- Caixas `contato@` e `privacidade@` na **Hostinger** (MX, SPF, DKIM `hostingermail-a/b/c`,
  `_dmarc` com `p=none` — todos na Cloudflare).
- **Resend** com `hopefin.com.br` **verificado**, região **São Paulo** (registros
  `resend._domainkey`, `send`, `rsend`); recebimento desligado (só envio).
- **NUNCA** alterar os **MX**, o **SPF da raiz** nem o **`_dmarc`**.

### Backup (crítico)
- Supabase no **plano Free, sem backup automático**. **Antes de qualquer migração, fazer
  dump** (`supabase db dump` ou `pg_dump`) e dizer ao Raul onde salvou.

### Contas e chaves (ficam com o Raul)
Chave nunca é pedida no chat; quando a tarefa precisar, eu digo o **nome do secret e onde
colocar** e o Raul mesmo cola. Secrets conhecidos (nomes, sem valores):
- **Asaas sandbox:** `ASAAS_API_KEY` (sem permissão de saque) + `ASAAS_WEBHOOK_TOKEN` — prontos.
- **Asaas produção:** conta no CPF, documentos enviados, chave Pix aleatória criada. **A
  chave de API de produção ainda NÃO existe** — só depois do teste no sandbox e da migração
  pra Cloudflare.
- **Sentry:** projeto React `hopefin-app`, só error monitoring → `VITE_SENTRY_DSN`.
- **PostHog:** só product analytics, sem session replay → `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`.
- **Resend:** `RESEND_API_KEY` (só envio).
- **Anthropic:** `ANTHROPIC_API_KEY` (sem validade, com limite de gasto mensal).

### Regras de produto (novas, 05/11/2026)
- **App só para maiores de 18 anos** — filhos não são usuários. **Limite de 6 pessoas por
  grupo** precisa estar implementado e testado.
- **Texto do cadastro:** trocar "Depois você convida sua esposa" por algo neutro, ex.:
  "Depois você convida quem divide as contas com você".
- **Estratégia comercial oficial** (posicionamento, oferta, tom de voz, o que pode ser
  anunciado) está no doc **"HopeFin — Estratégia comercial"**. Todo texto novo do app segue
  esse doc.

## Fluxo de trabalho (combinado com o Raul)

- **Branch nova por tarefa.** Uma migração por mudança de banco.
- **Nunca** commit/push sem o **ok explícito** do Raul.
- Ao fim de cada tarefa: dizer **o que testar** e então fazer o commit (com ok).
- Raul planeja no Claude.ai e implementa aqui. Comunicação **sempre em PT-BR**.

> Roadmap completo e backlog por fases: `docs/ROADMAP_HOPEFIN.md`.
