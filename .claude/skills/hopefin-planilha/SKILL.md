---
name: hopefin-planilha
description: Atualizar a planilha "HopeFin — Painel de Demandas" no Google Sheets (status e observações dos itens, foco e números do Resumo). Use sempre que um item da fila andar (feito, parcial, cancelado, decisão do Raul) e no fim da conversa.
---

# Planilha do HopeFin

- Planilha "HopeFin — Painel de Demandas", id `1uiI0f9XSv3sxZUREtTqxpEaloFHPLSg9RhmZWLasXcs`.
- Ferramentas: `get_values` e `update_values` do conector Google Sheets. Se não estiverem carregadas: ToolSearch "get_values update_values".
- **A planilha da família "Financeiro 2026" (dona: Larissa) é SÓ LEITURA. Nunca escrever nela.**

## Abas

- `🛠️ Ajustes do app`: colunas A ID · B Onda · C Demanda · D Detalhe · E Tipo · F Dono · G Crítico p/ lançar · H Prioridade · **I Status** · **J Observações**. As linhas de título começam com "— ONDA".
- `📊 Resumo`: A2 "Atualizado em dd/mm/aaaa"; FOCO AGORA em A11:B13; números em A15:B22 (B22 é a linha da aba de ajustes).
- Outras abas (lançamento, painel do dono, depois/concluído): ler o cabeçalho antes de escrever.

## Como atualizar sem estragar

1. **Ler antes**: buscar a coluna A (ex.: `🛠️ Ajustes do app!A1:A120`) e achar a linha pelo ID. Nunca supor o número da linha.
2. Ler o I:J atual da linha e **complementar** a observação, sem apagar informação útil.
3. Escrever só I:J daquela linha. Uma escrita por vez na mesma faixa: escritas em paralelo já sobrescreveram linha.
4. Status no padrão já usado: `⬜ A fazer` · `🟡 Parcial` · `✅ Feito` · `⛔ Cancelado`. Observação começa com a data ("no ar 18/11 — ..."), marca o que falta com "FALTA:" e o que depende do Raul com "com você —". Linguagem do Raul, sem jargão.
5. Depois: data de hoje em `📊 Resumo!A2`; FOCO e números se mudaram.
6. Conferir lendo de novo a faixa escrita.
