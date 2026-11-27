# Banco do app em São Paulo (A8.28) — plano para decidir

Escrito em 27/11/2026. **Nada foi executado.** Este documento serve para o Raul decidir se, quando e como mudar.

## O que muda pra quem usa

- Hoje o Supabase do HopeFin fica em **Oregon (EUA)**: cada ida e volta leva ~0,2 s. Em **São Paulo**
  (`sa-east-1`) leva ~0,02–0,04 s, de 5 a 8 vezes mais rápido. Fica mais rápido abrir aba pela 1ª vez, salvar, entrar
  e o Joca responder.
- O Supabase **não muda a região** de um projeto. Precisa criar um projeto novo em São Paulo e levar tudo pra lá.
- **Todo mundo vai precisar entrar de novo uma vez**, porque as chaves de sessão do projeto novo são outras. A
  **senha continua a mesma**: as senhas, guardadas embaralhadas, vão junto com as contas. O código do celular do
  painel (2 etapas) também vai junto.
- Notificações no celular continuam funcionando: as chaves do push (VAPID) são nossas, não do Supabase.

## Tamanho da mudança (levantado em 27/11)

| O quê | Quanto | Como vai |
|---|---|---|
| Banco | 28 MB · 9 grupos · 11 contas | dump completo, incluindo as contas (`auth`) |
| Estrutura | migrações 0001–0130 + `schema.sql` | já está no git |
| Arquivos (Storage) | 2 pastas (`publico`, `mkt-midia`) · ~26 MB | cópia pela API |
| Funções | 28 Edge Functions | `supabase functions deploy` (já está no git) |
| Segredos | ~20 (VAPID, CRON, Asaas, Resend, IA, WhatsApp, Meta) | `set-secrets.mjs` + `asaas-ambiente.mjs` |
| Crons | 11 (`hopefin-*`) | recriar: os comandos guardam a URL do projeto |
| Extensões | pg_cron, pg_net, vault, pgcrypto, uuid-ossp | ligar no projeto novo |
| Configuração do Auth | SMTP Resend, modelos de e-mail, confirmação, senha 8, captcha, URLs | `config-auth-email.mjs` + `config-auth-seguranca.mjs` + painel |

**O que aponta pro projeto atual e precisa ser trocado:**
- `.env` do app: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, depois `npm run cf:deploy`.
- `supabase/.env.local`: `SUPABASE_PROJECT_REF` e o token.
- **Webhook do Asaas** (`asaas-webhook`). **Precisa entrar no Asaas**, então depende do celular do Raul.
- **Webhook da Meta/WhatsApp** (`whatsapp-webhook`), no painel da Meta.
- **Webhook do Resend** (`resend-webhook`).
- O endereço do projeto aparece escrito em 2 arquivos: o `LOGO_URL` em `_shared/email.ts` e um comentário no
  `saude-alerta`. **Cuidado:** os e-mails que já foram enviados mostram o logo do projeto antigo. Por isso, não apagar
  a pasta `publico` antiga, ou antes mover o logo pra `app.hopefin.com.br`.
- O painel da agência (`hopefin-social/scripts/painel.mjs`) lê o `supabase/.env.local` e acompanha a troca sozinho.

## Passo a passo proposto

**Fase 0 — Decidir (Raul)**
- Projeto novo já no **plano Pro** (US$ 25/mês)? O Pro traz backup diário, o projeto não pausa por inatividade e tem
  o bloqueio de senha vazada (L39), o que fecha também o R17. Recomendo sim, se for mudar.
- Data: **antes de abrir a venda (~20/12)**, com poucos clientes. Melhor fazer junto com a troca para o número oficial
  do WhatsApp, porque o webhook da Meta muda de qualquer jeito nessa hora.
- Precisa do Raul com o **celular funcionando** (Asaas, e a 2FA do Supabase quando ele ligar).

**Fase 1 — Montar o projeto novo, sem ninguém usar (1 dia de trabalho meu, o app antigo segue no ar)**
1. Criar o projeto em São Paulo. Quem cria é o Raul, no painel do Supabase, e me passa o novo ref no `.env.local`.
2. Rodar as migrações 0001–0130 e conferir com o `schema.sql`.
3. Publicar as 28 funções, mandar os segredos e configurar o Auth com os scripts.
4. Criar os crons **desligados**.
5. Ensaio: copiar os dados de hoje, abrir a **prévia** (`admin-preview`) apontando pro projeto novo, rodar o
   `npm run smoke` e o agente testador. Comparar contagens tabela por tabela com o antigo.

**Fase 2 — A virada (uma janela de ~1 h, à noite, com o Raul)**
1. Aviso aos clientes (comunicado no app/e-mail, um dia antes): "Hoje às 23h o app fica 30 min em manutenção e
   depois pede pra entrar de novo".
2. Desligar os crons do antigo e tirar o backup final (`npm run backup` + dump completo).
3. Copiar os dados finais pro novo, conferir as contagens e rodar o `npm run smoke`.
4. Trocar o `.env` e fazer `npm run cf:deploy`. O app instalado se atualiza sozinho (`atualizarPwa.js`).
5. Trocar os webhooks: Asaas (Raul), Meta e Resend. Ligar os crons do novo.
6. Testar: entrar, lançar um gasto, Joca no WhatsApp, painel com código. Pagamento só com conta nova `+alias` e com
   reembolso.

**Fase 3 — Plano de volta (7 dias)**
- O projeto antigo fica **intacto** por 7 dias, com os crons desligados.
- Para voltar: `.env` antigo + `cf:deploy` + webhooks antigos. **Atenção:** o que foi lançado no projeto novo depois
  da virada precisa ser copiado de volta. Isso é fácil com poucos clientes, mais um motivo pra fazer antes da venda.
- Depois de 7 dias sem problema: pausar o antigo e guardar o último dump.

## Riscos e como fica cada um

| Risco | Cuidado |
|---|---|
| Cliente fica sem entrar | Aviso antes; a senha é a mesma; o "esqueci a senha" funciona no novo (SMTP configurado) |
| Pagamento chega no projeto antigo durante a janela | Trocar o webhook do Asaas logo depois dos dados; o `webhook_log` do antigo mostra o que entrou e dá pra reprocessar |
| Cron rodando nos dois projetos (e-mail duplicado) | Desligar no antigo **antes** de ligar no novo |
| Esquecer algo que aponta pro projeto antigo | Lista acima + busca por `oapcjmkklzaodgpuwjsh` no código antes da virada |
| Reembolso aberto no meio | Fazer a virada sem reembolso pendente (Painel › Reembolsos vazio) |

## Recomendação

Vale fazer **uma vez, antes de abrir a venda**, junto com o plano Pro e o número oficial do WhatsApp. Depois de
vender fica mais caro, porque cada cliente a mais é alguém a avisar e mais dados pra copiar de volta se precisar voltar.
Se a venda abrir antes disso, dá pra deixar pra depois sem problema: com a memória das leituras (A8.27) o dia a dia
já ficou rápido.
