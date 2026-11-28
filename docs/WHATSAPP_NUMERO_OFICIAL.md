# WhatsApp — número oficial do Joca

Ligado em 28/11/2026. Antes disso o Joca respondia pelo número de teste da Meta (+1 555-166-1833).

## O que está no ar

| O quê | Valor |
|---|---|
| Número | **+55 84 8114-7451** (chip do Raul, sem WhatsApp no celular) |
| Nome de exibição | **Joca do HopeFin** (liberado sem análise em 28/11) |
| Perfil | foto do Joca, recado "Joca do HopeFin 🐦", descrição, `contato@`, site, categoria Finanças |
| Conta do WhatsApp (WABA) | "HopeFin" `2924402127942769`, aprovada |
| ID do número | `1421765974357670` (em `WHATSAPP_PHONE_NUMBER_ID`) |
| App da Meta | `hopefin` `1693901255635877`, **Publicado** em 28/11 (Política, Termos e exclusão de dados = `/privacidade` e `/termos`) |
| Token | o mesmo `WHATSAPP_TOKEN` (usuário do sistema, permanente) |
| PIN de 2 etapas | `WHATSAPP_PIN` em `supabase/.env.local` (só lá) |
| App | `VITE_WHATSAPP_NUMERO=558481147451` no `.env` (card "Conectar meu WhatsApp") |

Testado em 28/11: conexão pelo card + "Teste 100 reais para padaria" lançado em 3 s (gasto apagado depois).

## Como foi feito (para refazer, por exemplo na troca de banco para São Paulo)

1. Raul adicionou o número no painel da Meta (Conectar no WhatsApp › Etapa 2) e confirmou por SMS.
2. `POST /{phone_id}/register` com `messaging_product=whatsapp` e o PIN.
3. `POST /{waba_id}/subscribed_apps`: sem isso a Meta **não manda** as mensagens pro webhook.
4. `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_WABA_ID` no `.env.local` + `node scripts/set-secrets.mjs`.
5. `.env` com o número novo + `npm run cf:deploy`.
6. Perfil: `POST /{phone_id}/whatsapp_business_profile`. A foto vai por upload retomável (`POST /{app_id}/uploads` → handle → `profile_picture_handle`).
7. Nome: Gerenciador do WhatsApp › Telefones › engrenagem › Perfil › Nome de exibição › Editar. Depois, `register` de novo com o mesmo PIN para aplicar.

## Pegadinhas

- O token não lista a WABA (`assigned_whatsapp_business_accounts` volta vazio, falta `business_management`), mas lê e escreve nela normalmente. O ID da WABA saiu do seletor de contas no Gerenciador.
- **Nome que aparece pra quem não salvou o contato:** sem a empresa verificada (selo/Meta Verified), o WhatsApp mostra o **número** no topo da conversa, e o nome só aparece no perfil ou em letra pequena. Para o nome aparecer no lugar do número, é preciso a **verificação da empresa** (Etapa 3, pede documento da empresa, ou seja, depende do CNPJ) e depois pedir a conta oficial ou o Meta Verified.
- Emoji não é aceito no nome de exibição, só no recado.
- Figurinha do Joca (`WHATSAPP_STICKER_JOCA_ID`): media_id vale por número. Se um dia for usada, subir de novo pelo número oficial.
- O número nunca manda mensagem primeiro (o Joca só responde), então não precisa de modelo aprovado nem de forma de pagamento na Meta por enquanto.
