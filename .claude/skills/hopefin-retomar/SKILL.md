---
name: hopefin-retomar
description: Começo de conversa no HopeFin. Use quando o Raul abrir uma conversa nova e disser "retomar", "bora", "próxima tarefa", "onde paramos", "continuar o HopeFin" ou digitar /hopefin-retomar. Lê o Estado atual no Obsidian, a fila da planilha e o git, e responde onde paramos + o plano da próxima tarefa, esperando o ok.
---

# Retomar o HopeFin (começo de conversa)

Objetivo: começar com o contexto certo lendo **uma nota curta**, em vez de reconstruir o histórico.

## Passos

1. Ler `C:\Users\TCORP\Desktop\Raul\Segundo Cérebro Raul\Segundo Cérebro Raul\Projetos\HopeFin\Estado atual.md`.
2. Ler a fila na planilha "HopeFin — Painel de Demandas" (id `1uiI0f9XSv3sxZUREtTqxpEaloFHPLSg9RhmZWLasXcs`):
   - aba `📊 Resumo`, faixa `A10:B13` (FOCO AGORA);
   - se a próxima tarefa cita IDs (ex.: A1.9), ler essas linhas na aba `🛠️ Ajustes do app` (colunas A:J), achando a linha pelo ID na coluna A. Nunca supor o número da linha.
   - Se o conector do Google Sheets não estiver carregado: ToolSearch "get_values".
3. Repositório: `git status -sb` e `git log --oneline -5`. Arquivo modificado que não é desta tarefa: **não mexer** (pode ser de outra conversa aberta), só avisar.
4. Mais histórico, só se precisar: a nota mais recente em `Projetos/HopeFin/Conversas/` e a memória `C:\Users\TCORP\.claude\projects\C--Users-TCORP\memory\project_hopefin_*.md`.
5. Responder ao Raul (PT-BR, curto, sem jargão):
   - **Onde paramos** (2 a 3 linhas);
   - **Próxima tarefa** e **plano** em passos (o que vou mexer e o que ele vai testar no fim);
   - **Pendências dele** que travam algo, se houver;
   - fechar com "Posso começar?". O Raul gosta de ver o plano antes.
6. Só começar a mexer depois do ok, a não ser que a mensagem do Raul já diga o que fazer.

## Se o Raul pedir outra coisa

Faça o que ele pediu; a nota é só o ponto de partida. No fim, registre com `/hopefin-fechar-sessao`.
