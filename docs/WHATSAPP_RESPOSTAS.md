# WhatsApp — padronização das respostas do bot (proposta)

> Rascunho para revisão do Raul (15/11/2026). As respostas atuais do webhook
> (`supabase/functions/whatsapp-webhook/index.ts`) nasceram ao longo dos testes e
> estão inconsistentes. Abaixo, o padrão proposto + cada mensagem (antes → depois).
> **Nada aqui foi aplicado ainda** — a ideia é a gente fechar o texto junto e eu
> trocar tudo de uma vez.

## Princípios

- **Tom:** próximo, direto, PT-BR, como o HopeFin fala no app. Pouco emoji (1 por
  mensagem, com propósito), sem exclamação em excesso.
- **Confirmação sempre mostra o que foi entendido** (valor, descrição, categoria,
  **cartão/conta**, data, parcelas) pra pessoa conferir num olhar — hoje o cartão
  é salvo mas **não aparece** na confirmação (foi o que faltou no teste).
- **Erros sempre dão a saída:** o que fazer agora (mandar de novo, por texto, pelo app).
- **Nunca** expõe dado de terceiro nem valor de outro grupo.

## 1) Confirmação de lançamento  ← principal ajuste

**Hoje:**
```
✅ Gasto de R$ 100,00 — "Janta" (Alimentação) lançado!
```

**Proposto** (mostra cartão, parcelas e data quando existirem):
```
✅ Gasto lançado
R$ 100,00 · Janta
🏷️ Alimentação
💳 Itaú azul
```
Regras de montagem (só inclui a linha quando o campo existe):
- Linha 1: `✅ {Gasto|Entrada} lançado{ em Nx}` (parcelas > 1 → "lançado em 3x").
- Linha 2: `R$ {valor} · {descrição}`.
- Linha 3: `🏷️ {categoria}` (sempre).
- Linha 4: `💳 {cartão}` **ou** `🏦 {conta}` (quando houver; senão omite).
- Linha 5: `📅 {dd/mm}` **só se a data não for hoje**.

## 2) Boas-vindas / conexão

**Hoje** (já reescrita com instruções — manter, só revisar o texto):
```
Prontinho, {Nome}! ✅ Seu WhatsApp agora está conectado ao HopeFin.

Daqui pra frente, é só me mandar seus gastos e entradas em português normal
que eu lanço no app na hora. Veja como:

💸 Gastos
• "mercado 120"
• "uber 23,50 ontem"
• "farmácia 48,90 no crédito"
• "almoço 35 parcelado em 3x"

💰 Entradas
• "recebi 2000 de salário"
• "entrou 150 de freela sexta"

Eu entendo sozinho o valor, a data ("ontem", "sexta", "dia 3"), a categoria,
o cartão e as parcelas. Manda um lançamento de cada vez. 💙
```
Decisão pendente: manter o sticker do Joca na conexão? (hoje é opcional, só se
`WHATSAPP_STICKER_JOCA_ID` estiver setado — não está.)

## 3) Demais mensagens (antes → proposto)

| Situação | Hoje | Proposto |
|---|---|---|
| Não conectado | "Oi! Para lançar seus gastos por aqui, abra o HopeFin…" | "Oi! Pra lançar por aqui, abra o HopeFin → Configurações → *Conectar meu WhatsApp* e me mande o código que aparecer. 😊" |
| Áudio não transcrito | "Não consegui ouvir seu áudio agora 😅. Pode mandar por texto, por favor?" | "Não consegui entender seu áudio 😅. Pode repetir falando devagar, ou mandar por texto?" |
| Áudio/texto vazio | "Seu áudio chegou sem fala…" / "Não entendi 🤔…" | "Não peguei nenhum lançamento aí 🤔. Ex.: *mercado 120* ou *recebi 2000 de salário*." |
| IA não entendeu | "Não consegui entender agora 😅. Tente algo como…" | "Não entendi esse 😅. Tenta assim: *farmácia 48,90* ou *uber 23,50 ontem*." |
| Sem valor | "Não achei o valor 🤔…" | "Faltou o valor 🤔. Ex.: *farmácia 48,90*." |
| Limite do mês | "Você atingiu o limite de mensagens do seu plano neste mês…" | "Você bateu o limite de lançamentos por WhatsApp deste mês. Ele renova no dia 1º. Pelo app segue normal. 🗓️" |
| Assinatura inativa | "Sua assinatura do HopeFin está inativa…" | "Sua assinatura está inativa — reative no app pra voltar a lançar por aqui. 💙" |
| Pausado (/admin) | "O lançamento por WhatsApp está temporariamente pausado…" | "O lançamento por WhatsApp está pausado no momento. Tenta de novo mais tarde 🙏" |
| Falha ao salvar | "Não consegui salvar agora. Tente pelo app…" | "Não consegui salvar agora 😕. Tenta de novo ou lança pelo app, por favor." |

## 4) Ideias a decidir com o Raul (não implementar sem ok)

- **Comandos úteis:** responder a "ajuda"/"?" com um mini-guia; "saldo"/"resumo"
  do mês; "apagar último" pra desfazer o último lançamento.
- **Confirmação de baixa confiança:** quando a IA tiver `confianca < 0,5`, mandar
  "Entendi *X* — tá certo? (responda *sim* ou corrija)" antes de salvar.
- **Custo da transcrição no /admin:** hoje o `consumo_ia` registra 1 por
  lançamento (interpretação). O Whisper é um custo extra não contabilizado —
  decidir se soma como consumo separado pra o /admin ficar exato.

---

# Ideias de uso da ferramenta de WhatsApp — custos e encaixe no preço

> Mapa para quando a gente for **evoluir** o WhatsApp (não implementar sem ok).
> Cada ideia tem uma estimativa de custo e se cabe no nosso preço. **Os números
> são ordem de grandeza** (câmbio ~R$ 6/US$; conferir sempre a tarifa real no
> painel da Meta, no faturamento da Anthropic e da OpenAI antes de decidir).

## Como o custo funciona (a base de tudo)

Três fontes de custo, e a diferença entre elas é o que decide se uma ideia é barata ou cara:

1. **WhatsApp Cloud API (Meta).** Resposta **dentro da janela de 24h** depois que a
   pessoa te manda mensagem = **conversa de serviço = grátis**. É o nosso caso hoje
   (a pessoa manda o lançamento, a gente responde na hora). **Mensagem proativa**
   (a gente inicia, fora da janela: lembrete, resumo, alerta) usa **template pago** —
   no Brasil, ordem de **~R$ 0,05 (utility)** a **~R$ 0,35 (marketing)** por mensagem.
   **Essa é a divisa principal:** reagir é grátis, "cutucar" custa.
2. **Interpretação (Claude Haiku).** ~**fração de centavo a ~R$ 0,01** por lançamento
   de texto (o `consumo_ia` já conta isso; a planilha usa ~R$ 0,001/msg).
3. **Transcrição de áudio (OpenAI Whisper).** US$ 0,006/min → com o teto de 60s,
   **no máximo ~R$ 0,035 por áudio**. É o **maior custo por lançamento** hoje (~3–4×
   um texto) e **ainda não entra no `consumo_ia`**.

**Custo por interação, hoje:**

| Interação | IA | WhatsApp | Total aprox. |
|---|---|---|---|
| Lançar por **texto** | ~R$ 0,005–0,01 | grátis (janela) | **~1 centavo** |
| Lançar por **áudio** | + Whisper ~R$ 0,035 | grátis (janela) | **~4 centavos** |
| Mensagem **proativa** (resumo/lembrete) | 0 a ~R$ 0,01 | template ~R$ 0,05 | **~5–6 centavos** |

**Encaixe no preço (Família R$ 24,90/mês), com os tetos atuais (50 trial / 100 cortesia / 200 assinante):**
- Assinante, **pior caso 200 lançamentos/mês todos em áudio**: 200 × R$ 0,04 ≈ **R$ 8/mês**.
  Ainda cabe nos R$ 24,90 (e o real é bem menos — mistura texto/áudio fica ~R$ 2–4).
- Trial (50) no pior caso ≈ **R$ 2/mês**; cortesia (100) ≈ **R$ 4/mês** (a gente absorve).
- **Conclusão:** enquanto for **reativo** (a pessoa manda, a gente responde) + teto
  mensal, **cabe folgado**. O que precisa de cuidado é **mensagem proativa em escala**.

## Ideias — reativas (a pessoa manda primeiro → WhatsApp grátis)

| # | Ideia | O que é | Custo extra | Cabe no preço? |
|---|---|---|---|---|
| R1 | **Lançar por texto** ✅ feito | "mercado 120" → salva | ~1¢ | Sim, folgado |
| R2 | **Lançar por áudio** ✅ feito | manda áudio → Whisper → salva | ~4¢ | Sim; vigiar teto |
| R3 | **Comando `ajuda`/`?`** | devolve mini-guia de uso | ~0 (texto fixo) | Sim |
| R4 | **Comando `saldo`/`resumo`** | total do mês, por categoria, quanto falta do orçamento | ~1¢ (1 consulta, IA curta) | Sim |
| R5 | **`apagar último`/`corrigir`** | desfaz ou edita o último lançamento | ~0–1¢ | Sim |
| R6 | **Confirmar baixa confiança** | IA incerta → "entendi X, tá certo?" antes de salvar | +1¢ (fica na janela) | Sim |
| R7 | **Foto de cupom/nota (visão)** | manda foto → IA lê valor/estabelecimento → salva | ~R$ 0,02–0,05/imagem (Claude visão) | Sim, mas limitar; **alto valor percebido** |
| R8 | **Pergunta em linguagem natural** | "quanto gastei com uber esse mês?" | ~1–2¢/pergunta | Sim; candidato a **gancho premium** (custo cresce com uso → proteger com teto) |
| R9 | **Fechamento/PNG do mês sob demanda** | pede "resumo" → manda imagem do fechamento | grátis (mídia na janela) | Sim |

## Ideias — proativas (a gente inicia → template pago ~R$ 0,05/msg)

| # | Ideia | O que é | Custo | Encaixe |
|---|---|---|---|---|
| P1 | **Lembrete de conta a vencer** | "sua fatura vence amanhã" | ~R$ 0,05 × envios | Alto valor. Limitar a 1–2/semana por pessoa; cabe se controlado |
| P2 | **Resumo semanal** | toda sexta: "gastou X essa semana" | ~R$ 0,05 × 4/mês/pessoa | Cabe por pessoa (~R$ 0,20/mês); **cuidado em escala** (1.000 pessoas ≈ R$ 200/mês) |
| P3 | **Alerta de orçamento estourado** | "passou do orçamento de Alimentação" | ~R$ 0,05 cada | Alto valor; limitar por categoria/mês |
| P4 | **Fim de trial / cobrança** | avisos de conversão | ~R$ 0,05 cada | Baixo volume, alto retorno — vale |

**Regra de ouro das proativas:** cada uma é dinheiro saindo toda vez. Antes de ligar,
definir **frequência máxima por pessoa** e, idealmente, deixar a pessoa **optar**
(on/off nas Configurações). Boa candidata a **recurso premium** ou a só-cortesia.

## Guardrails que já temos (e o que falta)

- **Já protege:** teto mensal por grupo (`wa_pode_grupo`: 50/100/200), áudio limitado
  a 60s, interpretação barata (Haiku). O paywall por status também vale no WhatsApp.
- **Falta pra ficar exato:** somar o **Whisper** ao `consumo_ia` (hoje conta só a
  interpretação) — senão o /admin subestima o custo de quem usa muito áudio.

## Ordem sugerida pra atacar depois (quick wins primeiro)

1. **R3 `ajuda` + R4 `saldo` + R5 `apagar último`** — quase sem custo, muito úteis, fáceis.
2. **R6 confirmação de baixa confiança** — melhora precisão, custo ~zero.
3. **R7 foto de cupom** — "uau" grande; custo baixo e controlável.
4. **Contabilizar Whisper no /admin** — pra enxergar o custo real antes de escalar.
5. **P1/P3 lembretes e alertas (opt-in)** — só depois de definir frequência e custo em escala.
6. **R8 perguntas em linguagem natural** — potencial gancho premium; exige teto firme.

---

# Joca inteligente (A8.23, 19/11/2026) — custo e se vale a pena

> Pedido do Raul: o WhatsApp tão esperto quanto o do concorrente que usa muito o WhatsApp (o
> Meu Assessor, do Felipe Titto: ~300 mil usuários e mais de R$ 60 milhões de faturamento em 2025,
> segundo a imprensa) — entender "paguei a fatura", responder perguntas e até dar orientação
> financeira — sem pesar no preço (Plano Família R$ 24,90/mês).

**Preço da IA (tabela oficial de 03/11/2026, por milhão de tokens):** Haiku 5.5 (o que o Joca já usa)
US$ 0,10 entrada / US$ 0,50 saída · Sonnet 5.5 (mais caprichado) US$ 2 / US$ 10 · leitura de cache
custa ~1/10 da entrada. Conta abaixo com US$ 1 ≈ R$ 5,80 (ordem de grandeza).

| O que o Joca faz | Modelo | Custo por vez |
|---|---|---|
| Lançar por texto ("mercado 120") | Haiku | ~R$ 0,001 |
| Pergunta com os números do app ("quanto gastei com comida fora?") | Haiku + resumo do mês | ~R$ 0,003 |
| "Paguei a fatura do Nubank" (confirma e marca paga) | Haiku | ~R$ 0,002 |
| Orientação financeira (resposta mais longa, com os dados do mês) | Sonnet | ~R$ 0,09 (Haiku: ~R$ 0,005) |
| Áudio de até 60 s (transcrição Whisper) | — | ~R$ 0,035 (o mais caro hoje) |
| Fatura em PDF lida pela IA (A4.2, ~3 páginas) | Sonnet | ~R$ 0,30 por fatura |
| Mensagem que o Joca INICIA (resumo semanal, lembrete) | template da Meta | ~R$ 0,04–0,35 cada |

**Pior caso por grupo assinante (teto de 200 mensagens/mês):** 150 lançamentos + 30 áudios + 20
orientações no Sonnet ≈ **R$ 3/mês** (12% do preço). Uso típico fica bem abaixo (~R$ 0,50). Com as
orientações no Haiku, o pior caso cai pra ~R$ 1,30.

**Vale a pena?** Sim, com 4 travas: (1) Haiku pra lançar e perguntar; Sonnet só quando a pessoa
pede orientação; (2) teto de orientações por mês (ex.: 30) dentro do teto de 200; (3) instruções do
Joca em cache (barateia ~90% da parte fixa); (4) mensagem que o Joca inicia só com opt-in e
frequência máxima — é o único custo que cresce sozinho com o número de clientes.

**Cuidado legal (não é parecer jurídico):** orientação de **organização financeira** (gastar menos
que ganha, reserva de emergência, quitar a dívida mais cara primeiro, como usar o cartão) pode. O que
NÃO pode sem registro na CVM é **recomendar investimento específico** ("compre a ação X", "aplique
no fundo Y") — isso é consultoria de valores mobiliários. O Joca precisa ter essa regra escrita nas
instruções e responder "isso é com um assessor de investimentos registrado". Vale uma olhada de um
advogado antes de anunciar "orientação financeira".

**Ordem sugerida (A8.23):** "paguei a fatura do X" e "apaga o último / o valor era 50" → perguntas
com os números do app → orientação (Sonnet, com teto) → fatura em PDF (A4.2). Tudo testado sem
mandar WhatsApp de verdade (prévia), e o custo de cada coisa aparecendo no /admin (consumo_ia).
