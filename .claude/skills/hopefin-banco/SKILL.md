---
name: hopefin-banco
description: Banco Supabase do HopeFin (projeto oapcjmkklzaodgpuwjsh). Use para criar migração (tabela, coluna, RLS, função/RPC, cron), rodar SQL pontual, ler dados reais ou conferir números do mês. Sempre via node scripts/db.mjs, nunca pelo conector MCP do Supabase (bloqueado neste projeto).
---

# Banco do HopeFin

## Ler, sem mudar nada

- `node scripts/db.mjs -e "select ..."` devolve JSON.
- Grupo do Raul: `(select grupo_id from usuarios where is_admin limit 1)`.
- Números do mês com o motor, dados reais e só leitura: `node scripts/conciliar.mjs --comp AAAA-MM`.

## Mudar o schema (migração)

1. **Backup antes**: `npm run backup`, e dizer ao Raul onde o dump foi salvo.
2. Criar `supabase/migrations/NNNN_descricao.sql` (próximo número: `ls supabase/migrations | tail -3`). Idempotente: `if not exists`, `create or replace`, `drop policy if exists` antes de `create policy`.
3. Aplicar: `node scripts/db.mjs supabase/migrations/NNNN_descricao.sql`.
4. **Smoke depois**: `npm run smoke`. Só concluir com `SMOKE OK`.
5. Tabela nova: atualizar `supabase/schema.sql` (espelho de leitura).
6. Conferir que a tela ainda lê o que precisa, com um `select` igual ao que o app faz.

## Regras que já custaram caro

- **NUNCA** FK extra entre `grupos` e `usuarios`: o PostgREST recusa com PGRST201 e o app fica em branco (caso de 07/11, migração 0028, corrigida na 0031).
- RLS por grupo: `using (grupo_id = meu_grupo_id())`. Tabelas de lançamento têm policy **restrictive** de insert `with check (grupo_pode_lancar())`; tabela nova de lançamento precisa dela também.
- Mexeu em valores de texto/enum? Conferir antes os CHECK da tabela: `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.<tabela>'::regclass`.
- Função `SECURITY DEFINER`: fixar `search_path` e checar `meu_grupo_id()` ou `is_admin` dentro dela.
- Datas: o app conta o mês pela data local (America/Sao_Paulo). Converter `timestamptz` antes de agrupar por dia.

## Dados reais de usuários

Mudar ou apagar lançamento de alguém, inclusive do Raul, **só com o ok explícito dele**, mostrando antes as linhas exatas (id, data, valor, descrição) e o que vai mudar. Fazer do jeito que o próprio app faria: mover parcela = mudar `data_vencimento`; mover compra de fatura = `fatura_ajuste`.
