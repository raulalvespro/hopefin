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
- `docs/` — `ROADMAP_HOPEFIN.md` (auditoria + plano comercial), LGPD (política + termos),
  **`design/`** (biblioteca de design v2 — ver seção abaixo).
- `supabase/` — `schema.sql` (espelho de leitura), `migrations/`, `functions/`, `seed/`,
  `README.md`, `.env.local` (gitignored, com token/segredos).
- `scripts/` — `db.mjs`, `set-secrets.mjs`, `gen-vapid.mjs`, `setup-cron.mjs`.

---

## Design — fonte única de visual (`docs/design/`)

Toda tela, e-mail ou componente **novo** segue a biblioteca de design em `docs/design/`
(instalada em 06/11/2026, "biblioteca de design v2"). Regras:

- **`docs/design/tokens/tokens.json` é a fonte oficial dos tokens** (cores com variantes
  de contraste, fontes **Syne** para títulos/display + **DM Sans** para corpo, espaços,
  raios, sombra). Quando uma tela de referência diverge do `tokens.json`, **vale o
  `tokens.json`**.
- `docs/design/telas/*.html` são referência **de visual**, não de conteúdo nem de
  estrutura — o app atual manda no que já existe. Mapa prompt→arquivo e os estilos oficiais
  (ícone claro/limpo = estilo 6; noite = conteúdo sério; divertido = campanhas) estão no
  `docs/design/README.md`.
- E-mails usam `docs/design/telas/email-topo.html` como base de cabeçalho
  (`supabase/functions/_shared/email.ts`).
- **Escopo:** o redesenho de todas as telas do app é o bloco dos **prompts 14–20**. Fora
  disso, só coisas novas já nascem no design; não refazer telas existentes sem tarefa.

### Regras do redesenho (prompts 14–20) — valem em todo prompt do bloco

1. **O app atual manda.** As telas de `docs/design/` são referência de **visual** (cores,
   tipografia, espaços, componentes, animações), **não** de conteúdo nem de estrutura.
2. **Não remova** nenhuma tela, rota, campo, botão, função, filtro, configuração ou dado
   que já existe. Se a tela de referência não mostra algo que o app tem, **mantenha** no
   visual novo.
3. **Não crie por conta própria** o que a referência mostra e o app não tem: liste como
   **sugestão** no fim da tarefa e espere o ok do Raul.
4. **Não altere** banco, migrações, RLS, regras de negócio nem rotas para encaixar o
   design. Só a camada **visual**, a menos que o prompt peça outra coisa.
5. Se já existe um componente parecido, **evolua ele** em vez de criar outro.
6. Números, nomes e datas das telas de referência são **exemplo**: use sempre os **dados
   reais** do grupo.
7. Antes de mexer em cada tela, **mostre a lista** do que ela tem hoje e como cada item
   fica no visual novo; ao terminar, **confirme item por item** que tudo continua funcionando.
8. As telas ficam em `docs/design/telas/` (leia antes o `docs/design/README.md`); os tokens
   oficiais estão em `docs/design/tokens/tokens.json` e **valem quando divergirem** de uma tela.
9. **Uma branch por prompt** (para dar pra voltar atrás). Textos das telas novas ficam
   centralizados em `src/copy/pt-BR.js` — nenhuma tela nova com frase escrita direto no componente.

**Base visual (prompt 14, em `src/components/ui/` + `src/index.css`):** fontes Syne 600/700
(títulos, dinheiro, botões) e DM Sans 400/500 (resto); tokens de cor/espaço/raio/sombra do
`tokens.json` (já no CSS global, + `--panel-ink`, raios `pill/xl/2xl`, `--space-*` e tokens de
movimento `--ease`/`--dur-*`); movimento com `cubic-bezier(.2,.8,.2,1)`, 150–600 ms, **desligado
em `prefers-reduced-motion`**. Componentes: `Button`, `Card`, `Tag`, `Money`, `ListItem`,
`Meter`, `Avatar`, `Toast`, `EmptyState`, `MicButton`; ícones de categoria com Lucide (traço
1.75, 24px). Vitrine em **`/dev/componentes`** (só em `import.meta.env.DEV`).

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

## Comercial (oferta atual — decidida em 06/11/2026, substitui o modelo fundador)

- **Cobrança** no CPF do dono (conta Asaas sem CNPJ ainda), via **Asaas**. Hoje tudo em
  **SANDBOX** — nada em produção.
- **Plano Família, até 6 pessoas:**
  - **Mensal:** R$ 24,90 (Pix ou cartão, sem desconto de lançamento).
  - **Anual normal:** R$ 199,90 no Pix à vista ou 12x de R$ 19,90 no cartão (R$ 238,80).
  - **Anual lançamento:** R$ 149,90 no Pix ou 12x de R$ 14,90 no cartão (R$ 178,80), para
    quem assinar **até 31/12/2026 23:59 (America/Sao_Paulo)**; preço travado nas
    renovações enquanto a assinatura seguir ativa, sem interrupção.
  - **Trial: 7 dias, sem cartão** (com até 50 mensagens no WhatsApp).
- **NÃO existe mais:** oferta "fundador", limite de 100 vagas, trial de 14 dias nem os
  preços antigos (R$ 19,90/mês, R$ 14,90/mês). Nada disso pode aparecer no app/e-mails.
- **Cortesia:** grupos que resgatam cupom (ex.: `IGREJA2026`) viram cortesia por tempo
  indeterminado, sem cobrança (WhatsApp até 100/mês). 1 cupom por grupo.
- Modelo: **um plano pago + trial** no começo (sem free tier por ora). Múltiplos planos
  pagos só com Open Finance.

### Assinatura do app no banco (migrações 0016 + 0017 + **0019**)
- Tabela `public.subscriptions` (criada como `assinaturas_app` na 0016, **renomeada** na
  0017): **uma por grupo**. Status `trial | active | past_due | canceled | expired`
  (default `trial`), `ciclo`, `preco_centavos` (travado), datas de trial/período, IDs do
  Asaas. Na **0019**: `is_fundador`→**`is_lancamento`** (+ `lancamento_em`), e novos
  `is_cortesia` + `cupom_codigo`. RLS de select por grupo (`meu_grupo_id()`).
- Tabela `public.planos_config` (0017, **remodelada na 0019**): **linha única** (`id = 1`)
  em centavos — `mensal_centavos` (2490), `anual_pix_centavos` (19990),
  `anual_cartao_centavos` (23880) + `anual_cartao_parcela_centavos` (1990),
  `lanc_anual_pix_centavos` (14990), `lanc_anual_cartao_centavos` (17880) +
  `lanc_anual_cartao_parcela_centavos` (1490), `lancamento_ate` (31/12/2026),
  `trial_dias` (**7**). Escrita só por `service_role`/SECURITY DEFINER; select liberado
  para `anon`. **Fonte única de preços** — front lê via `planos_publicos()` e
  `src/lib/precos.js` (fallback + helpers).
- Config de uso (**0019**): `public.limites_config` (linha única: 200 assinante / 50 trial
  / 100 cortesia / 40 pessoa-dia / áudio 60s) e `public.consumo_ia` (um registro por uso
  de IA/WhatsApp; base do prompt 11). Cupons: `public.cupons` (+ `cupom_resgates`), 1 por
  grupo; cupom `IGREJA2026` criado (30 usos, até 31/03/2027).
- **RPCs** (todas `SECURITY DEFINER`):
  - `iniciar_trial_familia(dias int default null)` — cria a linha de trial do grupo no
    1º acesso (idempotente; `dias` vem de `planos_config.trial_dias` = 7). Chamada no
    `AuthContext`.
  - `planos_publicos()` — JSON de preços + `lancamento_ativo` (`grant` a `anon`).
  - `grupo_pode_lancar()` — true se **cortesia**, `active`, trial válido ou legado (sem linha).
  - `limite_ia_status()` / `registrar_consumo_ia(origem,qtd,custo)` — uso de IA (prompt 11).
  - `resgatar_cupom(codigo)` — resgate **atômico** de cortesia; 1 cupom por grupo.
  - Removidas na 0019: `contar_fundadores()`, `reservar_vaga_fundador()`.
- **Trava de novos lançamentos:** policies RLS **restrictive de INSERT**
  (`<tabela>_insert_assinatura`) em `gastos/entradas/parcelamentos/transferencias`, com
  `with check (grupo_pode_lancar())`. Vencido/inadimplente **lê e exporta**, mas não
  cria lançamento. UX espelhada no front: `useAssinatura` + `BannerAssinatura`.
- Mudança de status/preço vem **só** do webhook do Asaas (service_role) ou dessas RPCs.
- **Asaas — anual no cartão (VALIDADO no sandbox em 07/11/2026): o "12x" NÃO funciona em assinatura.**
  Na subscription `cycle: YEARLY` o `installmentCount` é ignorado: o Asaas cobra o valor cheio de uma vez
  (R$ 178,80 num único lançamento). Parcelamento real existe só em **cobrança avulsa**
  (`POST /payments` com `installmentCount` + `totalValue`): testei 12x (12 × R$ 14,90), 6x e 1x, e a resposta traz
  `creditCardToken` para recobrar. **Pendente de decisão:** anual no cartão virar cobrança parcelada (1–12x) +
  renovação anual por token (cron). Até lá, a tela de Planos/Checkout promete 12x que não acontece.
- **Cancelamento (0027 + `asaas-cancelar`)** e **remoção de membro (0028 + `remover-membro`)** estão no ar e testados
  no sandbox (e-mails de cancelamento e de remoção incluídos). Webhook sandbox: token e evento
  `SUBSCRIPTION_DELETED` configurados em 07/11/2026.

## Integrações planejadas (ainda não no código)

- **Asaas** (sandbox): assinatura + webhook (Edge Function) para status trial/ativo/
  inadimplente e trava de features por status.
- **Resend**: e-mails (lembrete de vencimento, fim de trial, resumo). Remetente num
  domínio verificado (`contato@hopefin.com.br` / caixas na Hostinger).
- **Sentry**: erros em produção. **PostHog**: analytics de uso.

## Domínios

- `hopefin.com.br` — site + páginas legais. `app.hopefin.com.br` — o app (Vercel por ora).
- `admin.hopefin.com.br` — **painel do dono**: **implementado (prompt 8)** como rota
  `/admin` dentro do próprio app (fora do Layout, `noindex`), guarda por
  `usuarios.is_admin` + RPCs `admin_*` (SECURITY DEFINER, migração **0021**). Mostra MRR,
  assinantes, trials, inadimplentes, lançamento, consumo de IA/WhatsApp (+ custo, top
  consumidores, taxa de acerto da voz, pausa do WhatsApp com teto), grupos (status/plano,
  **nunca os lançamentos — LGPD**), cupons e log de webhooks. Ações com auditoria
  (`admin_log`): estender trial, marcar/tirar cortesia. O admin é marcado pelo e-mail
  `raullerickson@gmail.com` quando a conta é criada. (Reenviar e-mail depende do prompt 7.)
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
