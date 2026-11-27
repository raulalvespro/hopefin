# Reembolsos — o que o Raul precisa saber

Atualizado em 27/11/2026 (Asaas em produção desde 12:30 desse dia).

## A regra (art. 49 do CDC)

- Quem assina pode **desistir em até 7 dias da PRIMEIRA cobrança** e receber **tudo de volta**. Renovação não reabre
  o prazo.
- No app: Configurações › Minha assinatura › **Cancelar e pedir reembolso**. O botão só aparece dentro dos 7 dias.
- Depois dos 7 dias, cancelar vale só pras próximas cobranças, sem reembolso, e o acesso segue até o fim do período pago.
- A lei manda devolver "de imediato". O app tenta estornar na hora e, se não conseguir, **promete ao cliente um prazo
  de 2 dias úteis**.

## O que acontece quando o cliente pede

1. **O app tenta estornar no Asaas na hora.**
   - Pedido aceito: a assinatura é cancelada, o acesso é encerrado e o cliente recebe o e-mail de cancelamento com
     o prazo. O reembolso fica no painel até o Asaas confirmar que o dinheiro saiu (normalmente depois da **sua
     autorização**, veja abaixo).
   - **Recusou por falta de saldo:** veja abaixo.
   - Recusou por outro motivo: nada muda, a tela mostra erro e a pessoa tenta de novo ou escreve pra contato@.
2. **Sem saldo no Asaas** (o caso do 1º Pix real, 27/11):
   - A assinatura é cancelada **na hora**: nenhuma cobrança nova e o acesso encerrado.
   - O reembolso fica registrado em **Painel › Financeiro › Reembolsos**, com **prazo de 2 dias úteis** (até 23:59 de
     Brasília).
   - **O cliente** vê na tela e recebe por e-mail: "seu reembolso integral de R$ X será feito até DD/MM".
   - **Você** recebe um e-mail na hora ("Reembolso para fazer"), um lembrete a cada ~20 h enquanto não resolver e um
     **"⚠️ Reembolso ATRASADO"** se o prazo passar.
   - O app tenta estornar sozinho **de hora em hora** (cron `hopefin-reembolsos`, aos 20 min).
3. **Quando o estorno passa**, seja pelo app, pelo botão do painel ou feito por você direto no painel do Asaas:
   - o reembolso fica "Devolvido";
   - o cliente recebe **"Seu reembolso do HopeFin foi feito"**, uma vez só.

## ⚠️ Todo estorno precisa da SUA autorização no Asaas

Descoberto no 1º estorno real (27/11). O Asaas **aceita** o pedido de estorno feito pelo app, mas **segura** o
estorno com o status "aguardando autorização de ação crítica" até o dono confirmar com o código (app ou SMS do Asaas).
O dinheiro só sai depois disso.

- O app **não** marca "Devolvido" antes da hora. Desde a migração 0130, todo pedido de reembolso vira uma linha no
  painel com a fase:
  - **Sem saldo**
  - **Autorize no Asaas**
  - **Processando**
  - **Estorno cancelado**
  - **Devolvido**, só quando o Asaas confirma.
- Você recebe o e-mail "**Autorize o reembolso no Asaas**". Abra o Asaas, vá nas ações pendentes de autorização e
  confirme.
- Dá pra tirar essa exigência no Asaas, mas por segurança **é melhor manter**: é ela que impede alguém com a chave
  de devolver dinheiro sem você saber.

## Por que falta saldo

- O Asaas desconta a taxa **na entrada**, mas o estorno devolve o **valor cheio**. Exemplo: Pix de R$ 24,90 entra como
  R$ 23,91. Pra devolver os R$ 24,90, a conta precisa ter R$ 24,90 de saldo.
- **A taxa não volta** no estorno. Cada reembolso custa a taxa daquela venda.
- **Cartão:** o dinheiro só cai 32 dias depois de cada parcela. Ainda não testamos se o estorno de cartão nos 7 dias
  precisa de saldo. O teste do cartão (L4) vai mostrar.

**Recomendado:** deixar uma **reserva no Asaas** (comece com R$ 50 a R$ 200) e não sacar tudo. Se o app avisar falta
de saldo, mande um Pix seu pra chave da conta Asaas e use **Tentar agora** no painel.

## Taxas da conta (consultadas pela API em 27/11/2026)

Com desconto até **04/02/2027**; depois, o valor entre parênteses.

| Forma | Taxa | Quando cai |
|---|---|---|
| Pix | R$ 0,99 (R$ 1,99) | na hora |
| Cartão à vista | 1,99% + R$ 0,49 (2,99% + R$ 0,49) | 32 dias |
| Cartão 2 a 6x | 2,49% + R$ 0,49 (3,49% + R$ 0,49) | 32 dias por parcela |
| Cartão 7 a 12x | 2,99% + R$ 0,49 (3,99% + R$ 0,49) | 32 dias por parcela |

A conta mostra "100 recebimentos Pix sem taxa por mês", mas o 1º Pix pagou R$ 0,99. Vale perguntar ao Asaas.

## Cuidados

- **Feriado conta como dia útil** no prazo (o cálculo só pula sábado e domingo). Perto de feriado, resolva antes.
- **"Já devolvi por fora"** (no painel) é só pra quando você devolveu de outro jeito, por exemplo um Pix manual.
  O cliente recebe o e-mail de "reembolso feito" na hora, então só use depois de devolver de verdade.
- Estornou direto no painel do Asaas? Não precisa fazer nada no HopeFin: o aviso do Asaas fecha o reembolso sozinho.
- Peças: tabela `reembolsos_pendentes` (0129), funções `asaas-cancelar` (cria), `reembolsos` (cron e painel) e
  `asaas-webhook` (`PAYMENT_REFUNDED` fecha), e `_shared/reembolso.ts` (prazo, avisos e e-mails).
