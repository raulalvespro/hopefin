# Testes pendentes — redesenho (para o Raul revisar)

Lista do que validar quando voltar. Tudo em **branches locais, sem push** — nada foi pro ar.
Para cada tela: abrir logado, conferir **390px e 1280px**, **tema claro e escuro**, e confirmar
que nada que existia sumiu (regra 2 do redesenho).

> Como revisar uma branch: `git checkout <branch>` → `npm run dev` → testar → se aprovar,
> `git checkout main && git merge <branch>` (e só então `git push` quando você decidir).

---

## ✅ Prompt 16 · Etapa 1 — Início  `branch: feat/inicio-visual`  `commit f63de99`

Redesenho da tela de Início (Dashboard). O que conferir:

- [ ] **Card escuro (herói):** "Saldo em caixa" é o número grande; "projeção fim do mês"
      aparece como sublinha. O valor bate com o que você espera (o que já entrou − o que já saiu)?
- [ ] **Balão "?"**: tocar no "?" do "Saldo em caixa" e no da "projeção" abre a explicação;
      tocar fora ou apertar Esc fecha. Testar no **celular** (toque), não só no desktop.
- [ ] **Mini-barras** do card escuro aparecem e animam (e ficam paradas com "reduzir movimento" ligado).
- [ ] **Bloco "O mês até agora":** duas barras (Entrou verde / Saiu vermelho), cada uma com
      "de X previsto" e "a receber/a pagar" ao lado. A barra de Saídas tende a ficar baixa no
      começo do mês — é esperado (leitura "já saiu").
- [ ] **Atalho único "Contas a vencer":** mostra o total de **contas + parcelas + faturas**
      juntos, e o contador (ex.: "14 contas a vencer"). Esse total bate com a soma real?
      Tocar leva pra **Contas do mês**.
- [ ] **"Quanto posso gastar":** texto agora diz "cerca de R$ X por dia" (sem o "~" que parecia negativo).
- [ ] Resto da tela (orçamento, pizza "para onde vai a renda", tendência 6 meses, composição
      das saídas, gastos por pessoa, comparativo com mês anterior) continua **tudo** lá e funcionando.
- [ ] **Lançamento por voz:** o botão redondo verde (MicButton) aparece flutuando acima da barra
      de abas; abre o lançamento por voz/texto normalmente e salva.

**Observações:**
- A coluna `origem` em `gastos` (migração 0026, já aplicada no banco) grava se o lançamento veio
  por voz/texto/app. Hoje não é exibida em lugar nenhum — fica pro histórico/futuro.
- O selo "por voz" que existia na lista "Últimos lançamentos" saiu junto com a lista (você pediu
  pra remover). Se quiser ele em algum canto, a gente reativa.

---

<!-- As próximas seções são preenchidas pela sessão autônoma conforme cada prompt é feito. -->
