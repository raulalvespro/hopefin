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
