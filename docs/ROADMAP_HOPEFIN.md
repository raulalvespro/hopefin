# HopeFin — Auditoria, Roadmap de Produto e Plano Comercial

> Documento de trabalho gerado em **01/11/2026**. Base: código atual na `main` (commit `ec30df7`), schema Supabase (`0001`–`0003`) e pesquisa de mercado.
> Serve para planejarmos juntos. Nada aqui foi implementado ainda — é o mapa do caminho.

---

## 0. Resumo executivo (o essencial em 1 minuto)

- **O app está bom e funcional**, mas ainda em estágio de "projeto pessoal". Para virar **produto de mercado** faltam 4 frentes: (1) robustez técnica (erros, edição, confiabilidade), (2) jurídico/LGPD (obrigatório para dados financeiros), (3) monetização (assinatura + gateway), (4) aquisição (landing, onboarding, PWA instalável).
- **Preço sugerido:** plano único **"Família" R$ 14,90/mês ou R$ 119,90/ano** (2 meses grátis), com **teste grátis de 14 dias sem cartão**. Opcional: um nível gratuito limitado para aquisição. Detalhe na seção 5.
- **Maior achado da auditoria:** o app **não trata nenhum erro de rede/banco** — se o Supabase falhar, o dado silenciosamente não salva e o usuário não é avisado. Prioridade alta.
- **Features que você pediu** (planejado × praticado, contas fixas categorizadas, notificações, WhatsApp, PWA) estão desenhadas na seção 4, com a abordagem recomendada para cada uma.

---

## 1. Auditoria técnica

### 1.1 O que está bem feito
- Arquitetura limpa: RLS por grupo com `meu_grupo_id()` (SECURITY DEFINER evita recursão) — isolamento de dados correto.
- `categorias` como fonte única, `useCategorias()` com fallback.
- Trigger `gerar_parcelas` gera as parcelas no banco (lógica no lugar certo).
- Projeção por cartão com ciclo de fatura real, sem dupla contagem.
- Entrada por voz (diferencial raro no mercado BR).
- Chaves do Supabase vêm de env (`VITE_SUPABASE_*`), `.env` fora do git.

### 1.2 Problemas e correções (priorizados)

| # | Severidade | Achado | Correção proposta |
|---|-----------|--------|-------------------|
| A1 | 🔴 Alta | **Zero tratamento de erro.** Nenhuma chamada Supabase checa `error`. Falha de rede/RLS = dado não salva e usuário não sabe. | Criar um helper (`salvarComFeedback`) + toasts de sucesso/erro. Checar `error` em todo insert/update/delete. |
| A2 | 🔴 Alta | **Não dá para editar lançamentos** — gasto, entrada, conta fixa, cartão só podem ser excluídos. Erro de digitação = apagar e refazer. | Reaproveitar os modais para edição (passar registro ao `form`). |
| A3 | 🔴 Alta | **Parcelas não podem ser marcadas como pagas** pela UI (campo `paga` existe, mas sem botão). Projeção e faturas contam parcelas já quitadas. | Botão "marcar paga" em Parcelamentos; faturas/projeção passam a respeitar `paga`. |
| A4 | 🟠 Média | **Sem confirmação visual de ação longa.** Modais fecham antes de confirmar o insert; se falhar, some sem feedback. | Estado de "salvando" nos botões (já existe em Entradas/Voz; padronizar). |
| A5 | 🟠 Média | **Dupla fonte de categoria.** `gastos.categoria` é texto livre; se a categoria for renomeada/excluída, lançamentos antigos ficam órfãos (caem no emoji 📦). | Ao renomear/excluir categoria, migrar lançamentos; ou usar FK suave + "categoria arquivada". |
| A6 | 🟠 Média | **Entrada por voz (Web Speech API) não funciona no iPhone/Safari.** Metade dos usuários BR é iOS. | Fallback claro + avaliar transcrição via servidor (Whisper) na fase de WhatsApp. |
| A7 | 🟠 Média | **`assinaturas` sem tela de CRUD.** Tabela é usada no resumo, mas não há como cadastrar. Hoje "assinaturas" só aparece se inserir no banco. | Tela de assinaturas OU tratar assinatura como conta fixa recorrente (ver 4.2). |
| A8 | 🟡 Baixa | **`contas` e `orcamentos` órfãos parciais.** Aba Contas removida, mas tabela `contas` segue; orçamento só olha gastos variáveis (ignora fixas/parcelas). | Decidir: dropar `contas` ou guardar p/ Open Finance; orçamento unificado (ver 4.1). |
| A9 | 🟡 Baixa | **Sem paginação/limite.** Consultas trazem o mês todo; ok hoje, mas cresce. | Adicionar limites e índices já cobrem o essencial. |
| A10 | 🟡 Baixa | **Sem estados de carregamento em algumas telas** (Cartões, ContasFixas não têm "loading"). | Padronizar skeleton/loading. |
| A11 | 🟡 Baixa | **Datas**: uso de `new Date(d+'T12:00:00')` evita fuso, mas convém centralizar num util (como no SGQ). | Criar `dateUtils` próprio do HopeFin. |

### 1.3 Riscos de produto (não-código)
- **LGPD / dados financeiros**: hoje não há Política de Privacidade, Termos de Uso, nem base legal declarada. **Bloqueador para cobrar/divulgar.**
- **Sem exportação/backup** do usuário (direito do titular na LGPD).
- **Sem observabilidade** (erros em produção invisíveis) — ver Sentry no backlog.
- **Sem analytics** de uso (não dá para saber o que as pessoas usam).

---

## 2. Visão de produto: o que o HopeFin quer ser

App de **finanças da família/casal**, simples e em português, com 3 diferenciais fortes:
1. **Compartilhado de verdade** (grupo via código — casal/família no mesmo painel). A maioria dos concorrentes é individual ou cobra por pessoa.
2. **Lançamento rápido** (voz hoje; WhatsApp amanhã).
3. **Planejado × praticado** nas contas recorrentes (abaixo) — algo que Mobills/Organizze fazem mal.

---

## 3. Pesquisa de mercado e precificação

### 3.1 Quanto o mercado cobra (nov/2026)

| Produto | Mensal | Anual | Teste grátis | Observação |
|---|---|---|---|---|
| **Mobills** (BR) | ~R$ 14,90–19,90 | ~R$ 99,90–119,90 | 7–14 dias | Líder BR, foco individual |
| **Organizze** (BR) | ~R$ 16,90–39,90 | ~R$ 119–169 | 7 dias | Planos Manual/Conectado |
| **YNAB** (EUA) | US$ 14,99 | US$ 109 (~R$ 600) | **34 dias** | Método de envelopes, caro |
| **Monarch** (EUA) | US$ 14,99 | US$ 99,99 | 7 dias | Foco casal/família |

> Fontes: despezzas, canaltech, finvibe (BR); robberger, getfinny, costbench (YNAB/Monarch). Valores divergem entre sites — confirmar nas páginas oficiais antes de fechar.

### 3.2 Recomendação de preço para o HopeFin

- **Posicionamento:** mais barato que o Organizze, na faixa do Mobills, com o diferencial "família inclusa".
- **Plano único "Família": R$ 14,90/mês** ou **R$ 119,90/ano** (equivale a ~R$ 9,99/mês — 2 meses grátis no anual). Inclui **todos os membros do grupo** (o concorrente cobra por pessoa ou não compartilha).
- **Por que preço único e não vários planos?** No começo, simplicidade vende e reduz suporte. Múltiplos planos fazem sentido só quando houver features caras de segmentar (ex: Open Finance/sincronização bancária, que tem custo por conexão).
- **Evolução futura (quando tiver Open Finance):**
  - *Grátis:* lançamento manual, 1 grupo, histórico de 60 dias, sem projeção/relatórios avançados. (Isca de aquisição.)
  - *Família (R$ 14,90):* tudo manual + voz + WhatsApp + projeção + relatórios + histórico ilimitado.
  - *Família+ (R$ 29,90):* + sincronização bancária via Open Finance (custo por conexão justifica o preço).

### 3.3 Teste grátis

- **Recomendo 14 dias, sem cartão.** 7 dias (padrão BR) é curto para o usuário viver um ciclo e criar hábito; 34 (YNAB) é generoso demais para um produto novo que precisa de caixa. 14 dias cobre ~meio ciclo de fatura e dois fins de semana de gastos.
- Sem cartão na entrada aumenta cadastro; cobrar e-mail de lembrete no dia 11–13.

### 3.4 Planos: resposta direta às suas perguntas
- **"Vai ter planos ou só uma forma de usar?"** → Comece com **um plano pago único + trial de 14 dias**. Adicione um **Free limitado** só se precisar de um funil de aquisição mais agressivo. Múltiplos planos pagos: só depois do Open Finance.
- **"Teste grátis de quanto tempo?"** → **14 dias**.

---

## 4. Features novas (desenho das que você pediu)

### 4.1 Contas fixas categorizadas + visão unificada por categoria

**Situação:** o campo `contas_fixas.categoria` **já existe** e já é capturado no formulário e mostrado na lista. O que falta é **usar isso no resumo** em vez de jogar tudo num balde "Contas fixas".

**Proposta (recomendada):** no Início, a visão "por categoria" (barras e pizza) passa a **somar, por categoria, as 3 naturezas**: gasto variável + conta fixa + parcela. Assim "moradia" mostra aluguel+condomínio+energia (fixas) e "mercado" mostra tanto as compras avulsas quanto o "mercado" cadastrado como conta fixa da família.

- Manter um **toggle** "Por categoria ✕ Por natureza" para quem quiser ver fixo/variável/parcelado separado.
- A pizza "Para onde vai a renda" ganha versão por categoria pura (sem o balde "Contas fixas").
- O **Orçamento** também passa a considerar fixas+parcelas na categoria (hoje só olha gastos variáveis — isso faz o teto de "moradia" parecer sempre zerado).

**Esforço:** médio (só front; o dado já existe). Nenhuma migração obrigatória.

### 4.2 Planejado × Praticado (contas recorrentes) — **a joia da coroa**

**Problema que você descreveu:** "planejo R$ 200 de luz, veio R$ 220 (ou R$ 190); quero registrar e ver a diferença."

**Modelo de dados proposto** — nova tabela de *lançamentos mensais* das contas fixas:

```sql
create table public.fixas_lancamentos (
  id             uuid primary key default gen_random_uuid(),
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  conta_fixa_id  uuid not null references public.contas_fixas(id) on delete cascade,
  competencia    date not null,               -- 1º dia do mês de referência
  valor_previsto numeric(12,2) not null,       -- copiado do cadastro no fechamento do mês
  valor_real     numeric(12,2),                -- informado pelo usuário quando a conta chega
  pago           boolean not null default false,
  data_pagamento date,
  criado_em      timestamptz not null default now(),
  unique (conta_fixa_id, competencia)
);
```

**Como funciona na prática:**
- Cada conta fixa tem um **valor previsto** (o cadastro atual vira "previsto").
- No mês, o app mostra a lista de contas a pagar. Quando a conta chega, o usuário toca e **informa o valor real** (e marca como paga). Enquanto não informa, usa o previsto.
- O app calcula a **diferença** por conta e no total: *"Você planejou R$ 5.620 e pagou R$ 5.430 → economizou R$ 190 este mês"* ou *"estourou R$ 180 em energia"*.
- Histórico: gráfico "previsto × real" por conta ao longo dos meses (ex: ver a luz subindo no verão).

**UX sugerida:** uma mini-tela "Contas do mês" (ou um bloco no Início) com cada conta, botão rápido "pagar R$ X" (confirma previsto) ou "ajustar" (digita o real). Isso também resolve "mercado como conta fixa da família" — mercado vira conta recorrente com previsto, e todo mês você informa o real.

**Alternativa mais simples (MVP):** em vez de tabela nova, usar os próprios `gastos` lançados na categoria e comparar com o teto do `orcamento`. Mais pobre (não acompanha conta a conta), mas zero migração. **Recomendo a tabela** — é o diferencial do produto.

**Esforço:** médio-alto (migração + tela + relatório). Alto valor percebido.

### 4.3 PWA instalável (como o app de rotina da casa)

> Não consegui abrir o repo do seu app de rotina (deve ser privado — sem `gh`/token aqui). Mas o padrão é bem estabelecido e abaixo está o caminho.

**O que falta (hoje não há nada de PWA):**
1. `manifest.webmanifest` (nome, ícones 192/512, `theme_color` esmeralda, `display: standalone`, `start_url`).
2. Ícones (gerar a partir do logo — maskable incluso) e `apple-touch-icon` + metas iOS no `index.html`.
3. **Service worker** com `vite-plugin-pwa` (Workbox) para: cache do app shell (abre offline), estratégia network-first para dados.
4. Banner "instalar app" (capturar `beforeinstallprompt`; no iOS, instrução "compartilhar → adicionar à tela").
5. `theme-color` e splash para dar cara de app.

**Esforço:** baixo-médio (`vite-plugin-pwa` resolve 80%). Alto impacto em retenção e em "parecer app de verdade".

### 4.4 Notificações e avisos

**Hoje:** só alerta de vencimento calculado no cliente (Início) + banner de recorrentes. Não há push nem e-mail; se o app está fechado, ninguém é avisado.

**Proposta em camadas:**
1. **Web Push (PWA)** via service worker — avisa mesmo com app fechado: conta/fatura vencendo, orçamento estourando, fatura do cartão fechando, conta recorrente ainda não registrada. (Requer backend simples para disparar — Supabase Edge Functions + `web-push`, ou cron no pg.)
2. **E-mail** (Resend, como no SGQ): resumo semanal/mensal, lembrete de vencimento, fim do trial. Barato e funciona em qualquer device (resolve o gap do iOS).
3. **WhatsApp** (ver 4.5) — o canal mais forte no BR.

**Central de notificações no app:** preferências por tipo de aviso + quantos dias antes (o campo `alerta_dias` já existe por conta/cartão).

**Esforço:** médio (push + backend de disparo). E-mail é o começo mais rápido.

### 4.5 WhatsApp (lançar e receber avisos) — n8n?

**Duas coisas distintas:**
- **Avisos (saída):** o app manda "sua fatura do Nubank fecha amanhã".
- **Lançamento (entrada):** você manda "gastei 50 no mercado" e vira um gasto.

**Arquitetura recomendada:**
- **WhatsApp Cloud API (Meta)** — oficial, não quebra como libs não-oficiais. Número de negócio dedicado.
- **n8n** (self-hosted) como orquestrador: recebe o webhook do WhatsApp → interpreta a mensagem (regra simples ou um LLM barato) → insere no Supabase; e roda os fluxos agendados de aviso. n8n também pode ser o disparador das notificações da 4.4.
- Alternativa sem n8n: **Supabase Edge Functions** recebendo o webhook direto (menos peças, mas menos "visual" para montar fluxos).

**Custos (nov/2026, confirmar em fontes oficiais):**
- **Software n8n:** grátis (open-source). Precisa de **VPS** (~R$ 30–50/mês) para hospedar.
- **WhatsApp Cloud API:** modelo por mensagem desde jul/2025. **Mensagens de serviço (resposta dentro da janela de 24h) são grátis** → o lançamento por WhatsApp (usuário inicia) sai praticamente de graça. Templates *utility* (lembretes de vencimento) ~US$ 0,007/msg; *marketing* ~US$ 0,03–0,06/msg. Meta dá franquia inicial de conversas de serviço grátis/mês.
- **Estimativa realista:** VPS ~R$ 40 + alguns reais de utility templates por usuário ativo/mês. Viável. Se usar LLM para interpretar, +custo por mensagem (centavos com modelo pequeno).

**Fontes:** Meta WhatsApp pricing, messagecentral (Brasil), typebot.

**Esforço:** alto (infra + aprovação do número comercial na Meta + templates). Fazer **depois** do PWA/pagamento. É um diferencial, não um bloqueador de lançamento.

---

## 5. Minhas sugestões (coisas a considerar além do que você listou)

1. **Onboarding guiado** no primeiro acesso: criar grupo → cadastrar cartões → contas fixas → entradas. Hoje o app começa vazio e confuso para quem chega.
2. **Jurídico/LGPD (bloqueador):** Política de Privacidade, Termos de Uso, base legal, e **exportar/excluir meus dados**. Dados financeiros são sensíveis.
3. **Gateway de assinatura:** Stripe, **Asaas** ou **Pagar.me** (PIX recorrente é forte no BR). Precisa gerir status da assinatura (trial/ativo/inadimplente) e travar features.
4. **Observabilidade:** Sentry (erros em produção) + analytics de produto (PostHog/Plausible — privacy-friendly).
5. **Relatório mensal "fechamento do mês"**: um resumo bonito e compartilhável (o momento que gera engajamento e indicação).
6. **Metas financeiras** ligadas aos cofrinhos (ex: "viagem R$ 5.000 até dez" com progresso e aporte sugerido).
7. **Importar CSV/extrato** antes do Open Finance (ganho rápido de valor).
8. **Lembrete de "registrar gastos"** (hábito) — o maior inimigo desses apps é o usuário parar de lançar.
9. **Acessibilidade e tema escuro** (o CSS já tem tokens; falta o dark).
10. **Landing page** de verdade (você já tem experiência com o sgqtech-site) + domínio próprio.
11. **Backup automático / confiança**: mostrar ao usuário que os dados estão seguros aumenta conversão em finanças.

---

## 6. Roadmap / Backlog (demandas uma a uma)

> Fases pensadas para chegar ao mercado. Esforço: P (horas), M (1–2 dias), G (3+ dias). Ver planilha para acompanhar.

### Fase 0 — Robustez (antes de qualquer divulgação)
| ID | Demanda | Detalhe | Esforço |
|---|---|---|---|
| 0.1 | Tratamento de erros + toasts | Checar `error` em todas as operações; feedback visual de sucesso/falha | M |
| 0.2 | Editar lançamentos | Gasto, entrada, conta fixa, cartão, parcelamento | M |
| 0.3 | Marcar parcela/conta como paga | UI + refletir em projeção e faturas | M |
| 0.4 | Centralizar datas e `fmt` | Util único, evitar bugs de fuso | P |
| 0.5 | Loading/empty states padronizados | Cartões, ContasFixas, etc. | P |

### Fase 1 — Features pedidas
| ID | Demanda | Detalhe | Esforço |
|---|---|---|---|
| 1.1 | Contas fixas categorizadas no resumo | Visão por categoria somando fixo+variável+parcela; toggle natureza | M |
| 1.2 | Orçamento unificado por categoria | Incluir fixas e parcelas no teto | M |
| 1.3 | **Planejado × Praticado** | Tabela `fixas_lancamentos`, tela "Contas do mês", relatório previsto×real | G |
| 1.4 | Assinaturas (CRUD ou unificar em fixas) | Decidir modelo; hoje tabela sem tela | M |

### Fase 2 — Virar "app de verdade"
| ID | Demanda | Detalhe | Esforço |
|---|---|---|---|
| 2.1 | PWA instalável | manifest, ícones, service worker (vite-plugin-pwa), banner instalar | M |
| 2.2 | Notificações e-mail (Resend) | Vencimento, resumo, fim de trial | M |
| 2.3 | Web Push | Vencimento, orçamento, fatura; central de preferências | G |
| 2.4 | Onboarding guiado | Fluxo primeiro acesso | M |
| 2.5 | Tema escuro | Ativar tokens dark | P |

### Fase 3 — Comercial / go-to-market
| ID | Demanda | Detalhe | Esforço |
|---|---|---|---|
| 3.1 | LGPD: Política + Termos + base legal | Jurídico (bloqueador) | M |
| 3.2 | Exportar / excluir meus dados | Direito do titular | M |
| 3.3 | Gateway de assinatura | Asaas/Pagar.me/Stripe, PIX recorrente, trial 14d | G |
| 3.4 | Trava de features por plano/status | Free × Família × trial expirado | M |
| 3.5 | Landing + domínio próprio | Página de vendas + captação | M |
| 3.6 | Analytics + Sentry | PostHog/Plausible + erros | P |
| 3.7 | Preço e página de planos | R$ 14,90/mês · R$ 119,90/ano · 14d grátis | P |

### Fase 4 — Diferenciais / inovação
| ID | Demanda | Detalhe | Esforço |
|---|---|---|---|
| 4.1 | WhatsApp: avisos | Cloud API + n8n/Edge; templates utility | G |
| 4.2 | WhatsApp: lançar gasto | Interpretar msg → inserir (LLM barato opcional) | G |
| 4.3 | Relatório "fechamento do mês" | Resumo compartilhável | M |
| 4.4 | Metas ligadas a cofrinhos | Progresso + aporte sugerido | M |
| 4.5 | Importar CSV/extrato | Ganho antes do Open Finance | M |
| 4.6 | Open Finance | Sincronização bancária (plano Família+) | G+ |
| 4.7 | Voz no iOS | Transcrição server-side (Whisper) | M |

---

## 7. Perguntas abertas para decidirmos juntos

1. **Free tier ou só pago+trial?** (recomendo pago + trial 14d no começo).
2. **Gateway:** PIX recorrente (Asaas/Pagar.me) ou cartão (Stripe)? PIX converte melhor no BR.
3. **Planejado×Praticado:** tabela dedicada (recomendado) ou MVP só com orçamento?
4. **Assinaturas:** manter tabela separada ou tratar como conta fixa recorrente?
5. **WhatsApp:** n8n (mais flexível, mais infra) ou Edge Functions (mais enxuto)?
6. **Nome/marca e domínio** para o go-to-market.

---

*Fim do documento. Próximo passo: priorizar a Fase 0 e 1 e eu começo a implementar o que você aprovar.*
