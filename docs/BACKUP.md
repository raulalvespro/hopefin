# HopeFin — backup e restauração do banco

> Por que isso importa: o Supabase do HopeFin está no plano **Free — sem backup automático**
> e com **pausa por inatividade**. Com famílias reais usando o app, perder o banco é perder
> dados que não dá pra recuperar. Este guia é a rede de segurança enquanto não migramos pro Pro.

## O que é o nosso backup

São **duas metades** que, juntas, reconstroem o banco inteiro:

1. **Estrutura (schema, funções, triggers, RLS)** → já está **versionada no git**:
   `supabase/schema.sql` + `supabase/migrations/0001…00NN`. Nada a fazer além de manter no git.
2. **Dados (as linhas das tabelas)** → **não** ficam no git (têm dados pessoais). É o que o
   dump JSON salva, em `backups/` (pasta **gitignored** — nunca vai pro GitHub).

## Tirar um backup (dados)

```bash
npm run backup            # salva backups/dump_manual_<timestamp>.json
npm run backup -- pre_x   # com rótulo (ex.: antes de uma migração)
```

Mostra quantas tabelas e linhas salvou. Faça isso **antes de toda migração** (já é o combinado)
e de tempos em tempos durante o beta.

## Restaurar (recuperação de desastre)

Cenário: o projeto Supabase foi perdido/corrompido. Você cria um projeto novo (ou limpa o
atual), recria a **estrutura** pelas migrações e repõe os **dados** pelo dump:

```bash
# 1) recriar a estrutura no projeto (ver supabase/.env.local apontando pro projeto certo)
node scripts/db.mjs --migrate

# 2) repor as linhas a partir do backup
npm run restore -- backups/dump_manual_XXXX.json            # DRY-RUN (não grava nada)
npm run restore -- backups/dump_manual_XXXX.json --check    # roda e dá ROLLBACK (valida sem gravar)
npm run restore -- backups/dump_manual_XXXX.json --yes      # grava de verdade
npm run restore -- backups/dump_manual_XXXX.json --yes --truncate   # limpa antes (destrutivo)
```

Detalhes do restore:
- **Por padrão é DRY-RUN**: só mostra o que faria. Só grava com `--yes`.
- `--check` executa o restore inteiro dentro de uma transação e dá **ROLLBACK** — serve pra
  **testar o backup** sem mudar nada. Rode de vez em quando: um backup que não restaura não vale.
- Durante a carga usa `session_replication_role = replica` (desliga FK e triggers), então a
  ordem entre tabelas não importa e gatilhos como `gerar_parcelas` não disparam de novo.
- Insere com `on conflict do nothing` (não sobrescreve linha existente). Use `--truncate` só
  quando quiser mesmo zerar e repor tudo.

## Automatizar (escolha do Raul)

**Recomendação:** para durabilidade de verdade (com dados pessoais reais), o certo é o
**Supabase Pro** — backup diário automático, PITR e sem pausa por inatividade. É a única opção
que não depende do seu PC ligado e guarda os dados criptografados no próprio Supabase.

Enquanto isso (grátis, interino) — **agendar o dump local**. No Windows, cole no PowerShell
(ajuste o caminho do Node se precisar) para rodar todo dia às 21h:

```powershell
$acao = New-ScheduledTaskAction -Execute "npm" -Argument "run backup -- auto" -WorkingDirectory "C:\Users\TCORP\sandbox\hopefin"
$gatilho = New-ScheduledTaskTrigger -Daily -At 21:00
Register-ScheduledTask -TaskName "HopeFin Backup" -Action $acao -Trigger $gatilho -Description "Dump diário do banco do HopeFin"
```

> Não ligamos backup via **GitHub Actions** de propósito: o dump tem **dados pessoais** das
> famílias, e mandar isso pro GitHub (mesmo repo privado) é risco de vazamento/LGPD. Backup
> de dados fica **local** (interino) ou **no Supabase Pro** (definitivo).

## Limpeza

Os dumps vão se acumulando em `backups/`. Pode apagar os antigos à vontade (guarde os 2–3
mais recentes e um "pré-migração" de referência). Eles nunca vão pro git.
