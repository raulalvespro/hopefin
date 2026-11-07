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

## ✅ Prompt 17 — Planos  `branch: feat/planos-visual`

Redesenho de `src/pages/Planos.jsx` (textos em `copy.planos`; brilho `hf-shine` em `index.css`).
Ignorei `banner-fundador.html` (oferta velha). Preços **só** via `planos_publicos()` / `src/lib/precos.js`
— nenhum valor escrito no componente. Validado só por build + console limpo (rota exige login).

- [ ] **Selo no topo:** "Seu teste termina em N dias" (âmbar) durante o trial; "Seu período de teste
      terminou" (vermelho) se vencido; nada se já for assinante. Conferir nos 3 estados.
- [ ] **Cards de plano (radio):** Família anual (selecionado por padrão, brilho suave, selo escuro
      "Preço de lançamento até 31/12/2026" + preço riscado, "menos de R$ X por mês", economia %) e Família
      mensal (R$ 24,90). Os valores batem com `planos_config`? Depois de 31/12/2026 o selo e o preço
      riscado devem sumir sozinhos.
- [ ] **Benefícios:** as 6 linhas de antes continuam (com ícones).
- [ ] **Botões mudam com o plano:** anual → "Assinar com Pix" + "Pagar com cartão — 12x de R$ …" +
      nota do total no cartão; mensal → "Assinar mensal" + "Pagar com cartão". Todos levam ao
      `/checkout` com `ciclo`/`metodo` corretos.
- [ ] **Cupom:** resgatar (ex.: `IGREJA2026`) e mensagens de erro (já resgatou / inválido) como antes.
- [ ] **Card "7 dias grátis, sem cartão"** e rodapé (CDC) mantidos.
- [ ] 390px/1280px, claro/escuro (o brilho do card selecionado fica discreto no escuro?).

**Decisões / sugestões:**
- **Mantive o título "HopeFin Família"** (app atual manda) em vez de "Continue com a casa organizada".
- **Sugestão:** a frase da referência "Em 12 dias a família lançou 84 gastos e pagou 8 contas no prazo"
  precisa de consultas novas (contagem de gastos e contas pagas desde o início do trial). Não criei —
  me diga se quer.
- **Sugestão:** "Lançamento por voz sem limite" e "Preço travado enquanto assinar" da referência — o 2º é
  verdade pela regra comercial (preço travado nas renovações) e podia entrar como 7º benefício; o 1º
  **não** é verdade (há limite de IA, 200/mês) — não incluí.
- Texto do selo agora é "Preço de lançamento" (no lugar de "Preço de fundador" da referência).

## ✅ Prompt 18 — Convite  `branch: feat/convite-visual`

Não existe tela de convite no app: o convite era um **cartão em Configurações** ("Convidar para o
grupo"). Mantive no mesmo lugar e redesenhei como componente `src/components/ConviteGrupo.jsx`
(textos em `copy.convite`; animação `hf-pop` em `index.css`). O fluxo de entrada **não mudou**
(convidado escolhe "Entrar em um grupo" e cola o código). Validado só por build (exige login).

- [ ] Em **Configurações → topo**: avatares dos membros do grupo (com foto, se houver) + círculo
      tracejado "+" (some se o grupo já tem 6), nome do grupo, "N membros · até 6 pessoas".
- [ ] **Código do grupo** em destaque (Syne). Se for um código longo (UUID), a fonte diminui e quebra
      linha em vez de estourar o cartão — conferir como aparece o seu.
- [ ] **Copiar código** copia de fato (testar colar em outro lugar), mostra "Código copiado" no botão e
      no toast.
- [ ] Texto explicativo agora é neutro ("quem divide as contas com você") — tirei "sua esposa", conforme
      a regra de produto do CLAUDE.md.
- [ ] Atalho "Convidar alguém da família" da tela de Boas-vindas continua levando a Configurações.

**Sugestões (NÃO criei — regra 3, preciso do seu ok):**
- **QR code** do convite e **código curto** tipo `CASA-7K2P` (hoje o código é o do banco, sem formato amigável).
- **"Enviar pelo WhatsApp"** (abre `wa.me` com texto pronto) e **"Copiar link do convite"** (precisa de rota
  de entrada por link, ex. `/entrar?codigo=…`, que hoje não existe).
- **Remover membro** ("você pode remover alguém a qualquer momento" da referência) — não existe no app,
  e mexe em dados/regras; por isso não coloquei esse texto.
- "plano Família" no subtítulo: omitido por ora (poderia vir de `subscriptions`).

## ✅ Prompt 19 — Resumo do mês  `branch: feat/resumo-mes-visual`

No app, o "resumo do mês" já existe como a tela **Fechamento** (menu → Fechamento). Apliquei o visual
da referência `resumo-mes.html` ali (cartão escuro "noite"), **sem remover** nenhum bloco antigo
(Entrou × Saiu, Para onde foi, Maiores categorias, Contas fixas previsto × realizado, Quanto você
guardou). Textos em `copy.resumoMes`; animações `hf-count`/`hf-arc` em `index.css`. Validado só por
build + console limpo (exige login).

- [ ] **Cartão escuro no topo:** "Sobrou no mês" (verde) ou "Faltou no mês" (vermelho claro), valor grande,
      linha "R$ X a mais/menos que {mês anterior}" (+ o "% vs mês anterior" de antes logo abaixo). O
      valor bate com o que a tela mostrava antes?
- [ ] **Meta:** anel roxo com % + "Meta: {cofre}" e "R$ saldo de R$ meta" — usa o **cofrinho com meta mais
      adiantado** (os já completos vão pro fim). Some se nenhum cofre tem meta. Saldo = soma das
      transferências (igual à tela de Cofrinhos).
- [ ] **Dois indicadores:** "Contas fixas pagas X de Y" (fixas ativas × lançamentos marcados como pagos
      no mês) e "Lançado por voz N%" (gastos do mês com `origem = 'voz'`). Cada um some se não tem dado.
- [ ] Barrinhas decorativas e rodapé "Organizado com o HopeFin · hopefin.com.br".
- [ ] Setas de mês, e todos os blocos abaixo do cartão continuam iguais. 390px/1280px, claro/escuro (o
      cartão é escuro nos dois temas).

**Decisões / sugestões:**
- **"Contas no prazo" da referência** → troquei por "Contas fixas pagas": o banco não guarda se a conta foi
  paga **antes** do vencimento (só a data de pagamento), então "no prazo" seria chute.
- **Mascote: placeholder.** Não usei o desenho vetorial (README: versão final é 3D, ainda não chegou).
  Nenhum espaço reservado visível; quando as imagens entrarem em `docs/design/mascote/` (prompt 22),
  o lugar natural é o canto superior direito do cartão (hoje ocupado pelas barrinhas decorativas).
- **Sugestão (não criei):** a referência é um cartão **compartilhável** (360×640, vira imagem pra postar).
  Falta um botão "Compartilhar resumo" que gere a imagem (html→canvas) — é feature nova, preciso do ok.
- A frase "Novembro na Casa Oliveira" virou "{mês} · {nome do grupo}" com dados reais.

## ➕ Voz ao vivo  `branch: feat/voz-ao-vivo`  (sobre `feat/resumo-mes-visual`)

`useVoz` agora usa resultados parciais: enquanto a pessoa fala, a frase aparece na tela do
"Ouvindo…" e só vai pra IA quando a fala termina (uma única interpretação, como antes).

- [ ] No **Chrome do Android** (e desktop): tocar no microfone, falar uma frase longa — o texto vai
      aparecendo ao vivo; ao terminar, abre o card "Entendi assim" com a frase completa.
- [ ] Silêncio: mostra "Pode falar, estou ouvindo…".
- [ ] Parar manualmente no meio (tocar no microfone) não deve interpretar frase cortada
      (comportamento do navegador: pode ou não entregar resultado final — conferir).
- [ ] Safari/iOS: sem suporte a voz, segue só o campo de texto (como antes).
- Observação: não consigo testar microfone aqui; validado por build.
- Removido da lista: **"débito automático"** (você explicou que o app é só controle) — não será criado.

## ➕ Planos: mais vantagens + frase do teste  `branch: feat/planos-extras`  (sobre `feat/voz-ao-vivo`)

Fiz um levantamento do que o app **realmente** faz e que não estava na lista de benefícios dos Planos.
Só entrou o que existe no código (por isso **WhatsApp ficou de fora** — não há função dele ainda).

- [ ] **Benefícios:** 6 direto (família, voz/texto com IA, planejado × praticado, contas do mês, lembretes,
      ilimitado) + "**Ver tudo o que está incluso**" com mais 7: cofrinhos/orçamento, fechamento + resumo por
      e-mail, importar CSV, PWA, modo claro/escuro, dados seus, sem fidelidade — e, **só durante o
      lançamento**, "preço de lançamento travado nas renovações".
- [ ] **Frase do teste (real):** no lugar do subtítulo, "Em N dias a família lançou X gastos e marcou Y
      contas como pagas." Aparece para quem está em teste/venceu e já lançou algo; some se X = 0 e para quem
      já é assinante. (Troquei "no prazo" por "marcou como pagas" — o banco não sabe se foi no prazo.)
- [ ] **Rodapé:** "Configurações" virou link clicável.
- Perguntas: (1) a lista de lembretes (push/e-mail) depende do usuário ativar notificações — o texto está ok
  pra você? (2) quer que eu inclua o WhatsApp assim que a função existir?
