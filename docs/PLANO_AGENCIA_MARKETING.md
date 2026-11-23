# HopeFin — plano da agência de marketing (agentes + painel admin + Meta) — 23/11/2026

> Objetivo: uma **agência pequena de agentes** cuidando do Instagram/Facebook do HopeFin. Um **gerente de
> marketing** recebe os pedidos e distribui entre os operários; tudo é acompanhado e aprovado no **painel admin**;
> o que for aprovado é **postado sozinho no horário certo**. Documento vivo: o Raul vai moldando cada membro
> com o Claude ao longo do tempo.

## A resposta curta: dá, com 3 peças

1. **Os agentes** moram no repo `hopefin-social` (`.claude/agents/` + `.claude/skills/`) e trabalham no Claude Code
   (é onde estão a fábrica de reels/tirinhas, os assets do Joca e o Remotion).
2. **O painel admin** ganha a aba **Agência**: é a mesa de controle (pedidos, calendário, aprovações, membros,
   conexões, resultados). Ele não "roda" o Claude Code; ele guarda o que fazer e o que foi feito no Supabase, e os
   agentes leem e escrevem ali.
3. **A ligação com a Meta** (API oficial do Instagram/Facebook) posta no minuto agendado e traz o status e os números
   de volta.

## Limite importante: música do Instagram

A API oficial da Meta **não deixa escolher música da biblioteca do Instagram** (as músicas em alta). Isso só existe
no app do Instagram, e também não entra pelo Business Suite. Então são dois caminhos, por peça:

- **Postagem automática:** a música vai **dentro do vídeo**, de uma biblioteca liberada para uso. A
  **Meta Sound Collection** (da própria Meta, gratuita para usar no Instagram/Facebook) é a primeira opção; uma
  assinatura (ex.: Epidemic Sound, Artlist) é a segunda.
- **Postagem com música em alta:** o sistema deixa tudo pronto e, no horário, manda um aviso no celular do Raul
  (push/WhatsApp) com o vídeo, a capa e a legenda. Ele posta pelo app e escolhe a música. O status volta sozinho
  pela sincronização.

**Decisão do Raul:** qual é o padrão (automático com música embutida, ou aviso pra postar com música em alta)?

## A equipe (sugestão — moldar membro a membro)

| Membro | Faz | Usa | Precisa de aprovação? |
| --- | --- | --- | --- |
| **Gerente de marketing** | Recebe pedidos, monta o calendário (2 posts/dia + datas), escreve o briefing de cada peça, distribui, cobra prazo, faz o relatório semanal | calendário, métricas, todos abaixo | Plano da semana |
| **Pesquisador de pautas** | Datas comemorativas, tendências do nicho, assuntos que estão rendendo, áudios em alta | web, métricas | Não (alimenta o gerente) |
| **Redator** | Roteiros, textos dos quadros, legendas (storytelling + 3 hashtags), CTA, tom de voz | estratégia comercial, regras de marca | Junto com a peça |
| **Designer** | Carrossel, tirinha, estático, capa de reel, poses novas do Joca | fábrica (Remotion), Gemini via Raul | Sim (peça) |
| **Editor de vídeo** | Reels (6 estilos), voz, efeitos, música embutida, legendas na tela | fábrica (Remotion), ffmpeg | Sim (peça) |
| **Revisor de marca** | Porteiro antes de ir pro Raul: oferta vigente, sem prometer economia, área segura, grafia, hashtags, LGPD | regras do CLAUDE.md + README | Não (bloqueia ou libera) |
| **Social media** | Agenda, publica, confere o que foi ao ar, responde comentários/DMs simples, sobe o que precisa de humano | API da Meta | Respostas fora do roteiro |
| **Automações (ManyChat)** | Palavra no comentário → DM com link de teste, sequências, etiquetas de lead | ManyChat | Sim (fluxo novo) |
| **Gestor de tráfego** | Impulsionar o que performou, campanhas, públicos, orçamento, relatório de custo por teste | API de anúncios da Meta | **Sempre** (gasta dinheiro) |
| **Analista** | Números por peça (alcance, salvamentos, compartilhamentos), o que repetir, o que parar | API da Meta | Não (alimenta o gerente) |

Regra de ouro: **nada que gasta dinheiro ou fala em nome do HopeFin sai sem o Raul aprovar no painel**
(anúncio, orçamento, resposta fora do roteiro, fluxo novo do ManyChat). Postar peça já aprovada no horário
agendado é automático.

Detalhe técnico: no Claude Code, um agente não chama outro agente. Por isso o **gerente é uma skill**
(`/agencia`) que roda na conversa principal e chama os operários (que são agentes). Os operários com trabalho
repetível também ganham skill própria (ex.: `criar-tirinha`, que já existe; `criar-carrossel`, `criar-reel`).

## Como o trabalho anda (o ciclo)

1. **Pedido:** Raul escreve no painel ("semana da Black Friday", "reel sobre 13º") ou o gerente propõe o plano da semana.
2. **Briefing:** o gerente quebra em peças (data, formato, gancho, membro responsável).
3. **Produção:** redator → designer/editor → revisor. A peça sobe pro Storage com prévia.
4. **Aprovação no painel:** Raul vê imagens/vídeo + legenda e aprova ou pede ajuste (o comentário volta pro membro).
5. **Agendada:** no horário, a função `mkt-publicar` posta (ou avisa o Raul, se for com música em alta).
6. **Resultado:** `mkt-sync` traz link, status e números; o analista e o gerente usam isso no próximo plano.

Quem executa: **textos** (pauta, roteiro, legenda, relatório) podem rodar direto do painel por Edge Function com a
API da Anthropic. **Produção pesada** (render de vídeo/imagem) roda no Claude Code do PC, com uma tarefa agendada
que pega a fila de manhã (ou quando o Raul abre a conversa). Mais tarde dá pra levar o render pra nuvem.

## Fases

### FASE 1 — A equipe no Claude Code (rápido, sem mexer no app)
- Criar no `hopefin-social`: skill `agencia` (gerente) + agentes `designer`, `editor-video`, `redator`,
  `revisor-marca`, `social-media`, `pesquisador`, `analista` (tráfego e ManyChat entram na fase 4).
- Cada membro com: missão, o que pode e não pode, regras de marca, ferramentas, formato de entrega.
- Skills que faltam: **`criar-carrossel`** (template novo 1080×1350, 5–7 slides) e `criar-reel` (escolhe o estilo,
  roteiro, render, conferência de quadros).
- *Entrega:* "gerente, monta a semana" já funciona na conversa, usando a planilha do calendário.

### FASE 2 — A aba Agência no painel (admin)
- Banco (uma migração por mudança, via `scripts/db.mjs`, backup antes e smoke depois):
  `mkt_pecas` (calendário: data, horário, formato, título, status, membro, arquivos, legenda, link, números),
  `mkt_pedidos` (o que o Raul pediu), `mkt_comentarios` (ajustes e aprovações),
  `mkt_agentes` (cada membro: função, instruções, ativo). Tudo só para admin com `aal2`, como o resto do painel.
- Telas: **Calendário** (semana/mês, cor por status), **Aprovações** (prévia + aprovar/ajustar), **Pedidos**,
  **Equipe** (editar as instruções de cada membro; um script sincroniza com `.claude/agents/`), **Conexões**,
  **Resultados**.
- A planilha do Google vira histórico; a fonte passa a ser o painel.
- Publica na prévia primeiro (é tela grande nova).

### FASE 3 — Ligar Instagram e Facebook (postar sozinho)
- O que o Raul faz (uma vez, ~30 min, eu guio): confirmar que o @hopefinapp é conta **Profissional** ligada à
  **Página do Facebook**; criar um **app na Meta for Developers** (no modo de desenvolvimento, para a própria conta,
  sem revisão da Meta); gerar o token de longa duração e colar nos secrets (eu digo o nome e onde).
- O que eu faço: Edge Function `mkt-publicar` + cron a cada 5 min (posta reel, carrossel e imagem no Instagram e
  na Página); `mkt-sync` diário (link, status, alcance, salvamentos); arquivos das peças num bucket público do
  Storage (a API da Meta pega o arquivo por link); aviso no celular para as peças "com música em alta".
- *Entrega:* peça aprovada sai no minuto agendado e o calendário se atualiza sozinho.

### FASE 4 — Tráfego e ManyChat
- **ManyChat:** conectar a conta; o membro de automações desenha os fluxos (ex.: comentou "TESTE" → DM com link
  do teste de 7 dias) e ativa as etiquetas pela API; criar fluxo novo é na tela do ManyChat (o agente deixa pronto
  pra copiar, ou monta junto com o Raul no navegador).
- **Tráfego:** API de anúncios da Meta só para **propor** (público, verba, criativo); **criar e gastar só com
  aprovação no painel**, com teto mensal configurado pelo Raul.

## O que preciso do Raul para começar
1. Decisão da **música** (padrão automático com música embutida ou aviso para postar com música em alta).
2. Ok para a **FASE 1** (membros no Claude Code). Eu proponho a primeira versão de cada membro e a gente molda.
3. Quando chegar na FASE 3: acesso de admin na Página do Facebook e na conta do Instagram para criar o app da Meta.
