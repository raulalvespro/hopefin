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

## Dá pra autorizar estorno sem entrar no Asaas? (pesquisado em 27/11)

- **Estorno de Pix:** sim, provavelmente. É o "**Mecanismo para validação de saque via webhooks**" (Integrações ›
  Mecanismos de segurança, opção "Ativar autorização de saque para estornos Pix"): o Asaas chama uma URL nossa e a
  gente responde `APPROVED` ou `REFUSED`. Nós só aprovaríamos estorno que estivesse em `reembolsos_pendentes`, com o
  mesmo valor e a mesma cobrança. **Falta confirmar com o suporte** se, com isso ligado, a autorização manual some.
- **Estorno de cartão:** o webhook e a lista de IPs **não cobrem**. Segue manual até o suporte dizer outra coisa.
- **Lista de IPs:** não serve, porque as funções do Supabase não têm IP fixo.
- **Por enquanto:** autorização manual no Asaas (é um toque, e protege a conta).

### Webhook de validação do estorno Pix — PRONTO, DESLIGADO (27/11)

A função `asaas-validar-saque` já está publicada, mas não faz nada até ser cadastrada no Asaas.

- **Regra:** aprova (`APPROVED`) só estorno Pix (`PIX_REFUND`) de uma cobrança que tem reembolso **aberto** em
  Painel › Reembolsos, com o **mesmo valor** em centavos, e um estorno por cobrança. Todo o resto é recusado
  (`REFUSED`), incluindo saque, boleto, QR Code, recarga e split. Erro nosso também vira recusa: o estorno é
  cancelado e o cron `reembolsos` pede de novo na hora seguinte.
- Cada decisão vai pro `webhook_log` (origem `asaas-saque`), **sem** conta, CPF nem chave Pix de ninguém.
- Código: `supabase/functions/asaas-validar-saque/` (regra em `decidir.js`, testes em `tests/validar-saque.test.js`).
- Testado em 27/11 com pedidos falsos: sem token = 401; saque = recusado; cobrança sem reembolso = recusado; valor
  diferente = recusado.

**Para ligar** (só depois que o suporte confirmar que, com isso, a autorização por SMS some para estorno Pix):
1. No Asaas: Menu do usuário › Integrações › **Mecanismos de segurança** › validação de saque via webhook.
2. URL: `https://oapcjmkklzaodgpuwjsh.supabase.co/functions/v1/asaas-validar-saque`
3. Token: o valor de `ASAAS_SAQUE_TOKEN` em `supabase/.env.local` (já está nos segredos das funções).
4. E-mail de erro: `contato@hopefin.com.br`.
5. Marcar **"Ativar autorização de saque para estornos Pix"**. **NÃO** marcar "incluir operações feitas pela
   interface web": se marcar, os seus saques pelo site do Asaas também chegam aqui e são recusados.
6. Teste: pedir um reembolso com conta nova `+alias` e conferir em Painel › Reembolsos e no `webhook_log`.

**Cuidados com isso ligado:**
- O Asaas pode mandar **saques feitos pela API** pra cá, e eles são recusados. O app nunca saca, então está certo.
- Um estorno Pix que você fizer **à mão no Asaas**, sem pedido no app, é recusado. Nesse caso, desligue o mecanismo
  na hora ou peça ao Claude pra registrar o reembolso antes.
- Para desligar: desmarcar no Asaas. Sem o token, a função responde 401 e o Asaas cancela o estorno, então desligue
  sempre pelo Asaas.

## Cartão parcelado: caixa e antecipação

- Sem antecipação, cada parcela cai **32 dias** depois de cobrada, ao longo de 12 meses.
- **Antecipação:** custa cerca de 1,25% a 1,70% ao mês por parcela (confirmar no simulador do Asaas) e passa por
  análise de crédito. Nos 12x de R$ 178,80, antecipar tudo custa uns R$ 14,50 a R$ 19,80. Sobram uns R$ 153 a R$ 158
  de uma vez, mais que o anual no Pix (R$ 148,91).
- **Plano:** antecipar **só depois dos 7 dias** de arrependimento. No 8º dia, o app pede a antecipação pela API.
  Assim, quem desiste não gera antecipação pra desfazer e o estorno só cancela a compra no cartão.
  **Depende de:** (1) o teste do cartão (L4), que mostra se o estorno nos 7 dias precisa de saldo; (2) a conta estar
  liberada pra antecipação e a taxa real.
- Estorno de parcelamento, pela documentação: "o saldo correspondente é debitado da sua conta" e aparece na fatura do
  cliente em até 10 dias úteis. As taxas não voltam.
