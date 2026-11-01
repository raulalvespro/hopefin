# Backend (Supabase) — HopeFin

Projeto Supabase **próprio** do HopeFin: `oapcjmkklzaodgpuwjsh` (conta separada do SGQ).

## Como o Claude roda SQL/migrations sozinho

1. Preencha `supabase/.env.local` (gitignored) com um **Personal Access Token** do Supabase
   (Dashboard → Account → Access Tokens) e o `SUPABASE_PROJECT_REF`.
2. A partir daí:

```bash
# roda todas as migrations (idempotentes)
node scripts/db.mjs --migrate

# roda um arquivo específico
node scripts/db.mjs supabase/migrations/0002_xxx.sql

# roda SQL pontual
node scripts/db.mjs -e "select count(*) from gastos"
```

## Convenção de migrations

- `supabase/migrations/NNNN_descricao.sql` — ordem numérica.
- `0001_initial_schema.sql` = schema base (tabelas, trigger `gerar_parcelas`, RLS por grupo).
- Mudanças novas = novo arquivo `0002_...`, `0003_...` (sempre idempotente quando possível).
- `schema.sql` é um espelho do estado consolidado para leitura rápida.

## Segurança

- O token e qualquer connection string ficam **só** em `supabase/.env.local` (gitignored).
- A chave do front (`VITE_SUPABASE_ANON_KEY`) é pública por design, protegida por RLS.
- `service_role` / token **nunca** entram no código do front nem no git.
