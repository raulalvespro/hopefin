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
- O **resumo do mês está PAUSADO** (A1.9): os de 01/12 ficam retidos e o Raul envia pelo /admin. Não despausar sem ok explícito.
