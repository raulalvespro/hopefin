---
name: hopefin-publicar
description: Publicar o app HopeFin (front) em produção, app.hopefin.com.br e admin.hopefin.com.br. Use quando terminar um ajuste e for subir. Roda testes e build, commita só os arquivos da tarefa, junta na main, faz push, roda npm run cf:deploy e confere o que está no ar.
---

# Publicar o HopeFin

Regra do Raul (15/11/2026): **ajuste de app (melhoria, correção, visual) vai direto pra geral**. Commit, push e deploy já estão autorizados. Exceções:
- coisa grande ou arriscada: avisar o Raul antes;
- funcionalidade nova que ele marcou "testar primeiro": atrás de feature flag com audiência `dono` (ver "Publicar & aprovar" no `CLAUDE.md`);
- redesenho grande de tela existente: prévia (`npx wrangler deploy -c wrangler.preview.jsonc`, admin-preview.hopefin.com.br), não o oficial.

## Ordem quando a tarefa mexe em mais de uma camada

Banco primeiro (skill `hopefin-banco`), depois Edge Functions (skill `hopefin-edge`), front por último. O front novo não pode chegar antes do que ele usa.

## Passos

1. `git status --short`: saber exatamente o que mudou. **Nunca `git add -A` nem `git add .`**, porque outra conversa pode estar mexendo no mesmo checkout.
2. `npm test` (vitest) tem que passar. Mudou regra de cálculo? Acrescentar caso em `tests/motor.test.js`.
3. `npm run build` tem que passar.
4. Branch da tarefa (`git checkout -b <tarefa>` a partir da `main`) e commit só dos arquivos da tarefa (`git add <arquivos>`). Mensagem em PT-BR no padrão do log (`Onda N (Ax.y): o que mudou`), terminando com:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
5. Juntar e subir: `git checkout main && git merge --ff-only <tarefa> && git push origin main`. Se não der fast-forward, parar e entender. Nunca forçar.
6. `npm run cf:deploy` (faz o build e publica o worker `hopefin-app`). Guardar o "Current Version ID" para a planilha e o Obsidian. Se pedir login, o Raul roda `npx wrangler login`.
7. Conferir no ar: `curl -s https://app.hopefin.com.br/ | grep -o 'assets/index-[^"]*\.js'` tem que bater com o que está em `dist/index.html`. Se a tarefa mexeu em tela, abrir no navegador e olhar o console.
8. Registrar (skill `hopefin-planilha`) e dizer ao Raul **o que testar**, passo a passo.

## Lembretes

- O app instalado (PWA) se atualiza sozinho quando volta pra frente. Quem estiver com versão velha: fechar e abrir 1 ou 2 vezes.
- Chave nunca no código nem no chat. `.env` e `supabase/.env.local` ficam fora do git.
