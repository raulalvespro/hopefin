---
name: hopefin-edge
description: Edge Functions do HopeFin (Supabase, Deno). Use para publicar função, ler logs, mexer em secrets e crons, ou investigar erro de função (e-mails, push, lembretes, resumo do mês, Asaas, WhatsApp, motor compartilhado em supabase/functions/_shared).
---

# Edge Functions do HopeFin

## Publicar

```bash
export SUPABASE_ACCESS_TOKEN=$(grep -E '^SUPABASE_ACCESS_TOKEN=' supabase/.env.local | cut -d= -f2- | tr -d '"\r')
npx supabase functions deploy <funcao> --project-ref oapcjmkklzaodgpuwjsh --no-verify-jwt --yes
```

- Nunca imprimir o token (nada de `echo` ou `cat` no `.env.local`).
- `--no-verify-jwt` é o padrão usado no projeto.
- Mexeu em `supabase/functions/_shared/` (ex.: `motor.js`, `motor-dados.js`, `email.ts`)? Republicar **todas** as funções que importam o arquivo: `grep -rl "_shared/<arquivo>" supabase/functions`. O front também usa o motor (alias `@motor`), então rodar `npm test` e publicar o front (skill `hopefin-publicar`).

## Logs (só leitura)

- `node scripts/edge-logs.mjs chamadas --horas 6`: chamadas das funções (status, função, tempo).
- `node scripts/edge-logs.mjs console --horas 6 --busca resumo`: console.log e erros de dentro das funções.
- `node scripts/edge-logs.mjs api --horas 2`: erros 400+ na API.
- `node scripts/edge-logs.mjs --sql "select ..." --horas 1`: consulta livre.

O endpoint antigo `logs.all` responde 410; o script já usa o novo. Janela máxima: 24 h por consulta.

## Secrets

Nomes e onde ficam: `CLAUDE.md`, seção "Chaves e segredos". Valor **nunca** no chat: dizer ao Raul o NOME e onde colar (`supabase/.env.local`); depois `node scripts/set-secrets.mjs`.

## Cron

- Ver os jobs: `node scripts/db.mjs -e "select jobname, schedule, active from cron.job order by 1"`.
- Criar ou alterar: `scripts/setup-cron.mjs` ou migração (skill `hopefin-banco`).

## E-mail e push em teste

- Nunca disparar e-mail ou push real para usuários só para testar. Testar no e-mail e nos aparelhos do Raul, ou com modo de prévia da função.
- **WhatsApp (Joca) sem mandar mensagem** (desde 20/11/2026): o `whatsapp-webhook` tem modo simulação — POST com headers `x-joca-simulacao: 1` e `x-cron-secret: <CRON_SECRET>`, corpo `{ from: '5500...', texto }` (áudio: `tipo: 'audio', transcricao`). Só aceita número falso `5500...` (DDD 00 não existe), nunca chama a API da Meta e devolve as respostas no JSON; IA, banco e custo são de verdade. Pra conversar como alguém, ligar a conta de TESTE ao número falso (`usuarios.telefone` + `whatsapp_verificado`) e devolver como estava no fim, apagando o que a conversa lançou. Textos do Joca: `supabase/functions/whatsapp-webhook/joca.js` (+ `tests/joca.test.js`).
- O **resumo do mês foi LIBERADO em 19/11/2026** (pedido do Raul, depois do teste): e-mail + push do dia 1º saem sozinhos (cron hopefin-resumo-mensal, 09:30). A pausa continua no /admin (resumo_mensal_pausado) — pausar de novo só com o Raul. Pra testar sem mandar pra cliente: resumo-mensal { acao: 'teste', so_grupo, usuario } (só o e-mail e os aparelhos dessa pessoa, sem gravar no email_log) ou { acao: 'previa' }.
