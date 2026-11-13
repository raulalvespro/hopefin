# HopeFin — checklist de verificação (sessão 13/11/2026)

> Trabalhei no backlog de ajustes de uso enquanto você estava no trabalho.
> **Nada foi enviado pro GitHub (push) nem publicado em produção (`cf:deploy`).** Tudo está
> em **4 branches locais** pra você revisar, testar e só então mandar subir.
> A **única coisa que tocou o banco** foi uma migração **aditiva** (coluna nova), com **backup antes**.

---

## 1. O que foi feito (4 branches locais, sem push)

| Branch | O que entrega |
|---|---|
| `ux-lancamentos-nov` | Observação no gasto · Assinatura por categoria + agregador · "É assinatura (repete todo mês)" no lançamento · Swipe pra editar/excluir · Editar parcelamento · Ícones do PWA nítidos |
| `conta-alterar-senha` | Card "Alterar senha" em Configurações |
| `faturas-cartoes` | Pagar fatura (conclui parcelas do mês) · Histórico de faturas em barras · Limite com parcelas futuras · "Você paga este mês" · Jogar parcela pra próxima fatura |
| `infra-deploy-auto` | Deploy automático no push pra `main` (GitHub Actions) |

Já testei no navegador logado na conta de teste: **todas as telas renderizam, sem erro no console**.
Não executei ações destrutivas (não troquei senha de teste, não marquei faturas como pagas de verdade).

---

## 2. Como revisar e testar (passo a passo no app)

Pra cada branch: `git checkout <branch>` → `npm run dev` → testar → se gostar, me avisa pra fazer o merge/deploy.

### 2.1 `ux-lancamentos-nov`
- [ ] **Gastos → Novo gasto**: tem campo **Observação (opcional)** no fim? Salva e aparece a observação embaixo da linha do gasto?
- [ ] **Gastos → Novo gasto → marcar "É uma assinatura (repete todo mês)"**: some o "parcelado" e o "de outra pessoa", aparece a dica, e ao salvar **cria em Assinaturas** (não vira um gasto único)?
- [ ] **Gastos → arrastar uma linha de gasto pra esquerda** (no **celular**): aparece **lápis amarelo** (editar) e **lixeira vermelha** (excluir)? ⚠️ *o swipe precisa ser testado no celular de verdade — no PC dá pra arrastar com o mouse, mas o alvo é o toque.*
- [ ] **Assinaturas**: o total agora mostra **quebra por categoria** (%+valor)? Tem seletor de **Categoria** no form? (as assinaturas antigas aparecem como "Outros" até você editar e escolher a categoria)
- [ ] **Parcelamentos → lápis**: abre modal de edição (descrição/categoria/cartão)? Salva sem bagunçar as parcelas já marcadas?
- [ ] **Ícone do PWA**: reinstalar o app e ver se o ícone ficou mais nítido. *(Se quiser regerar: `node scripts/gen-icons.mjs`.)*

### 2.2 `conta-alterar-senha`
- [ ] **Configurações → Segurança → Alterar senha**: digita nova senha (6+) + repete → "Senha alterada"? Depois **sair e entrar com a senha nova** funciona?

### 2.3 `faturas-cartoes` (o mais delicado — testar com calma)
- [ ] **Cartões**: cada cartão mostra **"você paga este mês"** na fatura que vence no mês atual?
- [ ] **Marcar fatura como paga**: o botão registra o pagamento e **marca como pagas as parcelas que vencem naquele mês** (confere em Parcelamentos)?
- [ ] **Histórico de faturas** (6 barras): verde = paga, amarelo = aberta (vence este mês), vermelho = vencida não paga. Clicar numa barra abre valor/data e o **"desfazer pagamento"**?
- [ ] **Limite**: o % do limite agora considera as **parcelas futuras** (mostra "R$ X comprometido com parcelas futuras")?
- [ ] **Jogar parcela pra próxima fatura**: na composição da fatura (clicar na fatura), a **seta →** numa parcela joga ela pro mês seguinte?
- [ ] ⚠️ Confere se a conta do que compõe a fatura continua batendo depois de mexer (pagar/mover).

### 2.4 `infra-deploy-auto`
- Não tem o que "testar" no app — ver seção 3 (precisa dos secrets no GitHub). Depois que estiver ativo, **todo push pra `main` publica sozinho** — aí o `npm run cf:deploy` manual vira opcional.

---

## 3. O que PRECISA de você (ações suas)

- [ ] **Secrets do GitHub Actions** (pra `infra-deploy-auto` funcionar) — em *Settings → Secrets and variables → Actions*, criar:
  - `CLOUDFLARE_API_TOKEN` — token com permissão de editar Workers (conta do HopeFin)
  - `CLOUDFLARE_ACCOUNT_ID` = `a6d810ffa8649cd2cd2ad45ab3cf45ca`
  - `VITE_SUPABASE_URL` = `https://oapcjmkklzaodgpuwjsh.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = a anon key do HopeFin (pública)
  - *(opcionais)* `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`
  - ⚠️ **Decida se quer mesmo o auto-deploy** antes de mandar `infra-deploy-auto` pra `main`: a partir daí, qualquer push na `main` publica em produção.
- [ ] **Categorizar as assinaturas** existentes (abrir cada uma e escolher a categoria) pra o agregador por categoria ganhar sentido.
- [ ] **Testar o swipe no celular** (é gesto de toque; no PC é só aproximação).
- [ ] **Alterar senha**: testar o fluxo completo (trocar → sair → entrar com a nova).

---

## 4. Pendências que ficaram de fora (precisam de decisão ou são grandes)

Não fiz essas porque dependem de uma decisão sua ou são features grandes que merecem sessão própria:

- [ ] **"Esqueci a senha" (e-mail não chega)** — o **código** está certo; o problema é a **entrega do e-mail pelo Resend**. É teste/infra, não código: peça pra Larissa tentar "Esqueci minha senha" e veja se chega (olhar logs do Resend). Me avise o que achar.
- [ ] **Painel admin virar subdomínio `admin.hopefin.com.br`** — hoje é a rota `/admin` dentro do app. Virar subdomínio é **infra** (Worker/build separado na Cloudflare + DNS) e precisa da sua decisão de como separar. É uma tarefa própria.
- [ ] **Financiamentos / empréstimos** — é um **módulo novo** (tabela, telas, regras de juros/parcelas). Precisa a gente desenhar o escopo antes. Sessão separada.
- [ ] **Criar cartão já com histórico de faturas (importação)** — depende de definir o formato de importação (extrato/planilha). Grande; casa com o item de histórico de faturas. Sessão separada.
- [ ] **"Fechamento/vencimento errado em gasto retroativo"** — não consegui reproduzir o bug exato sem um caso concreto. Quando puder, me diga: um gasto com **qual data**, no cartão com **fechamento/vencimento quais**, caiu em **qual fatura** e deveria cair em **qual**. Aí conserto certeiro.

---

## 5. Quando aprovar — como subir

1. Me avisa quais branches aprovou.
2. Eu faço o merge na `main` (uma de cada vez) **com seu ok**.
3. Publicar: `npm run cf:deploy` (ou automático, se você ativar o `infra-deploy-auto`).
4. Depois de qualquer merge que mexa em banco: `npm run smoke`.

---

## 6. Banco e backup (o que mudou de verdade)

- **Migração aplicada:** `0038_observacao_assinatura_categoria.sql` — adiciona `gastos.observacao` e `assinaturas.categoria` (colunas novas, nada apagado). `schema.sql` atualizado. `SMOKE OK`.
- **Backup feito antes:** `backups/dump_manual_20261113_154701..json` (32 tabelas, 2027 linhas).
- As branches `conta-alterar-senha`, `faturas-cartoes` e `infra-deploy-auto` **não mexem no banco**.
