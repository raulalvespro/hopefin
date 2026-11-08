# HopeFin — plano para o lançamento (atualizado em 08/11/2026)

> **O WhatsApp entra NO lançamento** (decisão do Raul em 08/11/2026) — não é "depois". Ele fica por último na fila de
> *construção*, mas o app só abre para o público com ele funcionando.

## Estado hoje
- App no ar em `app.hopefin.com.br` (Cloudflare Workers). Cobrança **só no sandbox** do Asaas.
- Prontos: redesenho (prompts 14–19), convite da família, assinatura/cancelamento/reembolso, tour, Joca (prompt 22),
  voz por IA, e-mails de vencimento/resumo/fim de trial, /admin, PWA.
- Crons ativos: digest diário, vencimentos, fim de trial, renovação do cartão, resumo mensal.

## Fila (ordem sugerida)

### A. Amanhã de manhã (rápido, sem depender de ninguém)
1. **Conferir o e-mail de acesso** (feito em 08/11: SMTP do Supabase Auth → Resend + modelos em português). Pedir à Larissa
   para tentar "Esqueci minha senha" e ver se chega. **Decidido 08/11: manter `mailer_autoconfirm` LIGADO durante o beta**
   (menos atrito; se o Resend engasgar ninguém fica preso na porta) — revisitar antes do lançamento público.
2. ~~**E-mail de boas-vindas** ao criar a conta (e aviso ao dono do grupo quando alguém entra pelo convite).~~ **FEITO 08/11** — função `boas-vindas` no ar, e2e OK.
3. **Voz no iPhone**: confirmar se há fallback de transcrição no servidor (Web Speech não funciona bem no app instalado do iPhone).
4. **Testar no celular real** tudo de `docs/TESTES_PENDENTES.md` (instalar, notificações, mic sem teclado, Joca, avião, /admin).
5. Ajustes de uso que o Raul for anotando ao usar o app.

### B. Dinheiro de verdade (bloqueia a 1ª cobrança)
1. **Asaas produção**: criar a chave de API de produção, cadastrar o webhook de produção (URL + token), nome comercial "HopeFin".
2. **Teste real com valor pequeno**: Pix, cartão mensal, cartão anual 12x e reembolso nos 7 dias (Pix reembolso nunca foi testado).
3. **Backup do banco**: Supabase está no Free (sem backup, pausa por inatividade). **FEITO 08/11** a rede de segurança —
   `npm run backup` (dump JSON dos dados; estrutura já no git) + `npm run restore` (com DRY-RUN/`--check`/`--yes`/`--truncate`),
   guia em `docs/BACKUP.md`, restore validado com rollback. **Decidido 08/11: Pro só quando começar a vender (~5 clientes)**;
   até lá, rede de segurança é o dump local (comando de agendamento pronto no `docs/BACKUP.md`).
4. **Termos e Privacidade**: revisão de advogado. Contador: quando abrir CNPJ.

### C. WhatsApp (entra no lançamento)
1. Config da Meta (Cloud API, número, templates *utility*), webhook, Edge Function que interpreta a mensagem (mesmo motor da voz).
2. Lançar gasto por mensagem/áudio, avisos de vencimento, limites do plano (50 no trial / 200 assinante / 100 cortesia).
3. Figurinhas do Joca (já geradas em `docs/design/mascote/figurinhas/`) + chave no /admin.

### D. Divulgação
1. **Landing** `hopefin.com.br` com a copy do prompt 19.1, ligada ao app e à oferta de lançamento (até 31/12/2026).
2. **Beta fechado** com 5–10 famílias (cupom `IGREJA2026`) por ~2 semanas; olhar acerto da voz e onde travam no /admin.
3. **Botão de ajuda** (lado direito, reservado) + FAQ + contato.

### E. Faxina
- Desligar Vercel e apagar `vercel.json` depois de **15/11/2026**; tirar `hopefin.vercel.app` das Redirect URLs do Supabase.
- /admin: botão "reenviar e-mail".
- Open Finance: só depois (plano Família+).

## Combinados que valem sempre
- PT-BR. Commit/merge/push/deploy conforme autorizado pelo Raul; produção = `npm run cf:deploy` (push sozinho não publica).
- Depois de migração: `npm run smoke`. Nunca FK extra entre `grupos` e `usuarios`.
