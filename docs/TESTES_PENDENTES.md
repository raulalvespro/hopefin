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

## ✅ Prompt 16 · Etapa 2 — Contas do mês  `branch: feat/contas-mes-visual`

Redesenho de `src/pages/ContasDoMes.jsx` (textos em `copy.contasMes`). Validado só por build +
console limpo (a tela é autenticada; não criei conta de teste). O que conferir logado:

- [ ] **Resumo com medidor:** "Pago até agora · X de Y contas", valor pago grande, "de R$ total"
      e barra de progresso (anima do zero). "Falta pagar" continua embaixo. Os números batem?
- [ ] **Duas listas:** "A pagar" (por vencimento) e "Pagas" (embaixo, esmaecidas). Se uma das
      duas ficar vazia, o cabeçalho some.
- [ ] **Tags:** "Vencida" (vermelho, ícone avermelhado + "venceu dia DD/MM"), "Vence hoje" e
      "Em N dias" (âmbar, até 7 dias), "Pago" (verde). Contas com vencimento a mais de 7 dias
      ficam sem tag, só "vence DD/MM". Conferir também em mês passado (tudo aberto = Vencida)
      e mês futuro (sem tags).
- [ ] **Toggle de pago** (bolinha à esquerda) marca/desmarca em fixas, faturas, parcelas e
      assinaturas, e persiste ao recarregar.
- [ ] **Toast com "Desfazer"** ao marcar como paga (6 s); tocar em Desfazer reverte. Ao
      desmarcar, o toast é o simples "Pagamento desfeito".
- [ ] **Contas fixas:** campo "Valor real que veio" + diferença (+/−) continuam funcionando.
- [ ] Setas de mês mantidas. 390px e 1280px, claro e escuro.

**Decisões / observações:**
- "Quem pagou": o banco só guarda a **data** → mostra "Pago em DD/MM" sem nome. Parcelas (sem
  cartão) não guardam data de pagamento (só `paga`), então mostram só "Pago".
- **Sugestão (não migrei):** coluna `pago_por` (uuid do usuário) em `fixas_lancamentos` e
  `contas_pagas` pra mostrar "Pago 01/11 por Pedro". Também `debito_automatico` (bool) em
  `contas_fixas` pra exibir "· débito automático" como na referência.
- Ícones: categorias conhecidas usam Lucide (via `IconeCategoria`), fatura = cartão,
  assinatura = repetir; categoria custom cai no emoji.
- Medidor usa o componente `Meter` (mesma animação `hf-meter` da referência).
- Limite de 7 dias pra "Em N dias" foi escolha minha (conservadora); fácil de mudar em `statusDe`.
- Desfazer em outro mês: se você trocar de mês antes de tocar em Desfazer, mostra aviso em vez de
  desfazer (evita gravar na competência errada).

## ✅ Prompt 16 · Etapa 3 — Tela de voz  `branch: feat/voz-visual`

Redesenho de `src/components/BotaoVoz.jsx` (textos em `copy.voz`; animações `hf-wave`/`hf-slide`
em `index.css`). **Toda a lógica** (interpretação pela Edge Function, limite de IA, log de acerto,
salvar gasto/entrada/parcelado) ficou intacta. Validado só por build + console limpo (tela exige login).

- [ ] **Bottom sheet** abre ao tocar no microfone verde; barrinha de arraste no topo; fecha no X
      e tocando fora. No desktop vira modal centralizado.
- [ ] **"Ouvindo…":** microfone grande (80px) com dois anéis pulsando e barrinhas de onda enquanto
      grava; toque no microfone para parar. Em navegador sem voz, o botão fica desabilitado e o
      campo de texto continua funcionando.
- [ ] **Texto digitado** ("mercado 87 no Nubank") + enviar continua interpretando.
- [ ] **Card "Entendi assim":** tag Gasto/Entrada, valor grande e três colunas (Categoria · Pagamento ·
      Data; para entrada: Descrição · Tipo · Data). "Pagamento" mostra cartão + "· 3x" se parcelado.
- [ ] **Corrigir** abre o formulário completo (tipo, descrição, valor, data, categoria, pagamento,
      parcelas / tipo de entrada) — todos os campos de antes. **Refazer** volta pro começo.
- [ ] **Salvar gasto / Salvar entrada** grava normalmente (gasto à vista, parcelado no cartão, entrada)
      e o Início atualiza.
- [ ] Se a IA não entender o valor, o card já abre direto no formulário de correção.
- [ ] Aviso "Restam N lançamentos por IA" (≥80% do limite) aparece no card.

**Observações:**
- Voz do navegador (`useVoz`) só devolve o texto **no fim** da fala (`interimResults=false`), então
  a transcrição não "digita ao vivo" como na referência — aparece quando termina. Ligar resultados
  parciais exigiria mexer no `useVoz` (fora do escopo visual); deixo como sugestão.
- Não mexi nos estados vazio/erro/sucesso de `estados.html`/`feedback.html` além do que já existe
  (erros em texto vermelho, "Salvo!" no botão).
