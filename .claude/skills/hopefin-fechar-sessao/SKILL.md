---
name: hopefin-fechar-sessao
description: Fim de conversa no HopeFin. Use quando a tarefa da conversa terminar, quando o Raul disser "fecha a sessão", "salva tudo", "registra", "vou parar por hoje", ou quando a conversa estiver ficando longa. Atualiza a planilha, o Estado atual e a nota da conversa no Obsidian, a memória, e diz ao Raul o que testar e como começar a próxima conversa.
---

# Fechar a conversa do HopeFin

Garante que a próxima conversa comece sabendo tudo, sem depender deste histórico.

## Passos

1. **Conferir o que foi feito de verdade**: commits desta conversa (`git log --oneline`), versão do deploy (o "Current Version ID" do wrangler), migrações rodadas, funções publicadas. Nada sem verificação entra como "feito".
2. **Planilha** (skill `hopefin-planilha`): status e observação de cada item mexido; na aba `📊 Resumo`, a data em A2 e, se a fila mudou, o FOCO AGORA (A11:B13) e a linha de números (B22).
3. **Obsidian**, pasta `%USERPROFILE%\Desktop\Raul\Segundo Cérebro Raul\Segundo Cérebro Raul\Projetos\HopeFin\` (no PC de casa, `%USERPROFILE%` = `C:\Users\TCORP`):
   1. `Conversas/AAAA-MM-DD - <assunto>.md` no modelo abaixo. Se já existir uma do mesmo dia e assunto, complementar.
   2. Decisão nova do Raul: `Decisões/AAAA-MM-DD - <decisão>.md` (o que, por quê, o que foi descartado).
   3. **Reescrever** `Estado atual.md` inteiro, curto (até ~60 linhas), com as seções: Onde estamos · Próxima tarefa (IDs da planilha + plano em passos) · Depois disso · Com o Raul · Cuidados que valem sempre · Como começar a próxima conversa. Atualizar `atualizado_em`.
   4. Mudou algo grande? Atualizar "Status atual" e `ultimo_commit_conhecido` em `HopeFin - Visão Geral.md`.
4. **Memória**, só fato que vale para sempre (regra nova, pegadinha técnica, decisão do Raul): atualizar o arquivo certo em `%USERPROFILE%\.claude\projects\C--Users-TCORP\memory\` (a pasta se chama `C--Users-TCORP` nos dois computadores; ex.: `project_hopefin_ajustes_uso.md`) e a linha dele no `MEMORY.md`. O histórico do dia vai para o Obsidian, não para a memória.
5. **Nada só neste computador** (o Raul alterna PC de casa `D85248-ESC-RF` e notebook): o que foi feito nesta conversa vai commitado e com **push** (branch de trabalho mergeada na `main` quando for o caso), e `git status -sb` termina sem nada pendente e sem "ahead". Vale para os 3 repos que a conversa tocou (`hopefin`, `hopefin-site`, `hopefin-social`). Arquivo modificado que não é desta conversa: avisar, não commitar.
6. **Mensagem final ao Raul** (PT-BR, detalhada onde importa):
   - o que ficou no ar e o que **não** ficou (com o motivo);
   - **o que testar, passo a passo**: tela → onde tocar → o que deve aparecer (com valores quando der);
   - o que depende dele;
   - **git**: confirmar "commit e push feitos" (com o hash) ou dizer o que ficou pendente e por quê. Se estiver no **notebook** (computador que não é o `D85248-ESC-RF`) e for a última conversa antes de voltar pra casa, lembrar do `SELAR-VOLTA.cmd` em `%USERPROFILE%\sandbox\kit-notebook\` (Obsidian e memória voltam por ele);
   - **como começar a próxima conversa**: "nova sessão na pasta `%USERPROFILE%\sandbox\hopefin` e digite `/hopefin-retomar`". Oferecer abrir a próxima conversa já com a tarefa (cartão de nova sessão).

## Modelo: nota de conversa

```markdown
---
data: AAAA-MM-DD
projeto: HopeFin
tipo: conversa
tags:
  - hopefin
  - <tema>
commits:
  - <hash>
---

# AAAA-MM-DD — <assunto>

> Sessão via Claude Code. Branch `<branch>`. <No ar / não publicado>.

## 🎯 Contexto
## ✅ O que foi feito
## 🧠 Decisões
## ⏭️ O que falta
## 🧪 O que o Raul precisa testar
```
