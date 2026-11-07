# Migração do app: Vercel → Cloudflare Workers (prompt 21)

Objetivo: tirar `app.hopefin.com.br` da Vercel (plano grátis não permite uso comercial) e servir como **Worker com static
assets** da Cloudflare (não o Pages), **sem mudar o endereço**. Status: configuração pronta e testada localmente; falta publicar
em `*.workers.dev` (precisa da sua conta Cloudflare) — ver passos 4 e 5.

## 1) O que o projeto usava da Vercel — e como fica

| Item na Vercel | Como fica na Cloudflare |
| --- | --- |
| `vercel.json` → 1 rewrite de SPA (tudo que não é `assets/` nem arquivo com extensão → `index.html`) | `worker.js` repete a mesma regra: telas → `index.html`; arquivo inexistente → **404 de verdade** (sem isso um arquivo velho viraria "HTML com cache de 1 ano" e travaria o PWA) |
| Headers / redirects | **Nenhum** no `vercel.json`. Cache agora é explícito em `public/_headers` |
| Funções em `/api` | **Não existem** (a API é o Supabase) |
| Vercel Analytics / Speed Insights / `@vercel/*` | **Não usa** (analytics = PostHog; erros = Sentry) |
| Variáveis de ambiente | 5 variáveis `VITE_*` (ver item 3) — só em tempo de build |
| Domínio `hopefin.vercel.app` | Fica no ar 1 semana como plano de volta |
| Build | `npm run build` → pasta `dist/` (igual) |

Nada no código referencia a Vercel (só `vercel.json` e um comentário em `tokens.json`).

## 2) O que foi configurado (nesta branch)

- `wrangler.jsonc` — Worker `hopefin-app`, `main: worker.js`, assets em `./dist` (binding `ASSETS`).
- `worker.js` — fallback de SPA descrito acima (só executa quando o arquivo não existe; arquivo existente é servido de graça).
- `public/_headers` (vai para `dist/`) — cache do PWA: `index.html`, `sw.js`, `registerSW.js`, `push-sw.js` e `manifest.webmanifest`
  com `no-cache`; `/assets/*` e `workbox-*.js` (nomes com hash) com 1 ano `immutable`; headers básicos de segurança.
- `package.json` — `npm run cf:dev` (testa local) e `npm run cf:deploy` (build + publica); `wrangler` como devDependency.
- `vercel.json` **continua** (plano de volta por 1 semana).

**Testado local (`wrangler dev`):** `/`, `/gastos`, `/contas-do-mes`, `/entrar?c=…` → 200 com o app; `/assets/inexistente.js` e
`/foto.png` → 404; `index.html`/`sw.js`/`manifest` sem cache; JS com hash `immutable`; manifest com `application/manifest+json`.

## 3) Variáveis de ambiente para copiar da Vercel → Cloudflare (só os NOMES)

`VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY` · `VITE_SENTRY_DSN` · `VITE_POSTHOG_KEY` · `VITE_POSTHOG_HOST`

São públicas (vão embutidas no JavaScript) e só valem **na hora do build**. Quando o build roda na Cloudflare (Workers Builds),
cadastre as 5 em *Settings → Build → Variables and secrets* do Worker. Se você publicar pelo seu computador com
`npm run cf:deploy`, ele usa o seu `.env` local e **não precisa cadastrar nada na Cloudflare**.
**Não** copie nenhuma chave de `supabase/.env.local` (Asaas, Resend, Anthropic, service role…): essas ficam só no Supabase.

## 4) Publicar no endereço de teste `*.workers.dev` (precisa da sua conta)

Opção A — pelo seu terminal (mais simples):
```bash
npx wrangler login        # abre o navegador; entre na sua conta Cloudflare e clique em "Allow"
npm run cf:deploy         # build + publica; no fim mostra https://hopefin-app.<seu-subdominio>.workers.dev
```
Opção B — Git (build na Cloudflare, publica a cada push): Cloudflare → *Workers & Pages* → *Create* → *Import a repository*
→ `raulalvespro/hopefin`; build command `npm run build`; deploy command `npx wrangler deploy`; cadastre as 5 variáveis do item 3.

Antes de testar o login no endereço novo, no **Supabase → Authentication → URL Configuration**, acrescente em *Redirect URLs*:
`https://hopefin-app.<seu-subdominio>.workers.dev/**` (pode tirar depois). *Site URL* continua `https://app.hopefin.com.br`.

### Roteiro de teste no `*.workers.dev`
1. Abrir `/` → entra no login/onboarding; abrir direto `/gastos` e `/entrar?c=ABCD1234` (recarregar a página) → não dá 404.
2. **Login** com a conta de teste (`teste.e2e@hopefin.app`) → Início carrega com os dados.
3. **Lançamento** manual (um gasto de R$ 1) e conferir no Início; **apagar** depois.
4. **Voz/texto:** "mercado 10 reais" → card "Entendi assim" → salvar (e apagar).
5. **Instalar o PWA** (Chrome: ícone de instalar na barra; celular: "Adicionar à tela inicial") → abre standalone, ícone certo.
6. **Alertas:** Configurações → Notificações → ativar push e receber um alerta de teste.
7. **Assinatura (sandbox):** Planos → Assinar com Pix → gera QR (sandbox). Cancelar em Configurações → Minha assinatura.
8. **Cache/atualização:** publicar de novo e conferir que o app instalado pega a versão nova (service worker atualiza sozinho).
9. DevTools → Network: `sw.js` e `manifest.webmanifest` com `cache-control: no-cache`; `assets/*.js` com `immutable`.

## 5) Só depois que você aprovar: ligar `app.hopefin.com.br`

1. Cloudflare → Worker `hopefin-app` → *Settings → Domains & Routes* → *Add → Custom domain* → `app.hopefin.com.br`.
   (O DNS de `hopefin.com.br` já está na Cloudflare: ele troca o CNAME antigo da Vercel `app → …vercel-dns…` sozinho; se reclamar
   de registro existente, apague o CNAME `app` apontando para a Vercel **na Cloudflare** e adicione o domínio de novo.)
2. Supabase → Authentication → URL Configuration: *Site URL* `https://app.hopefin.com.br` (já está) e *Redirect URLs* com
   `https://app.hopefin.com.br/**`, `http://localhost:5173/**`; **tire** `https://hopefin.vercel.app/**` só depois de desligar a Vercel.
3. Outros serviços que apontam para o endereço do app: **nenhum** depende da URL do app — webhooks (Asaas, WhatsApp/Meta) apontam
   para o Supabase; e-mails usam `app.hopefin.com.br`. Conferir só: PostHog (domínios autorizados, se configurado) e Sentry (nada).
4. Sessões e instalações: continuam valendo (mesmo domínio → mesmo localStorage e service worker); o PWA instalado atualiza sozinho.

## 6) Plano de volta

Deixe o projeto da Vercel **no ar por 1 semana**. Se algo der errado: Cloudflare → Worker → remover o Custom domain
`app.hopefin.com.br` e recriar o CNAME `app` → `058d1be13394a092.vercel-dns-017.com` (proxy desligado). Depois da semana sem
problemas: desligar o projeto na Vercel e remover `vercel.json`.

## Observação (não faz parte da migração)
`vite.config.js` tem `devOptions.enabled: true` no PWA: o service worker também roda no `localhost`, o que pode manter módulos
antigos em cache no navegador durante o desenvolvimento. Se aparecer comportamento "preso" no `localhost`, limpe os dados do
site ou desative essa opção.
