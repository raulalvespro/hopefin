# HopeFin — plano para evoluir o painel do dono (ERP), inspirado no Kywo (14/11/2026)

> Objetivo: deixar o painel do HopeFin **o mais parecido possível com o do Kywo, dentro da nossa
> realidade**. O Kywo nasceu do mesmo prompt que o nosso painel, só está mais maduro. Este doc
> organiza em **fases** o que falta (levantamento completo no benchmark; ver `project_hopefin_kywo_benchmark`
> na memória). Complementa `docs/PLANO_PROXIMOS_PASSOS.md` (fila do lançamento) e o roteiro de etapas 1–6.

## Como cada fase roda (sempre)
1. **Branch por fase** a partir de `admin-erp`. Uma migração por mudança de banco (via `scripts/db.mjs`, nunca MCP).
2. **Backup antes** de qualquer migração (`npm run backup`) e **`npm run smoke`** depois (só concluo com `SMOKE OK`).
3. Construo → subo na **PRÉVIA** (`admin-preview.hopefin.com.br`, `npx wrangler deploy -c wrangler.preview.jsonc`).
4. **Você valida na prévia** → só então penso em publicar no oficial. **Nunca no admin oficial sem o seu ok.**
5. Nada de disparo real de e-mail/mensagem sem a gente testar junto primeiro.

## Nossa realidade (o que limita e molda o plano)
- Front **sem TypeScript** (React+Vite), tema/tokens do HopeFin, tudo escopado em `.adm`.
- Supabase **Free** (sem backup automático, pausa por inatividade) → backup manual antes de migrar.
- **Custo real por provedor**: só a Anthropic tem API de uso utilizável hoje; os outros (Cloudflare/Resend/Asaas)
  entram **medidos quando der**, e enquanto não dá, ficam **preenchidos à mão** no card — melhor isso do que estimativa.
- Envio de e-mail em massa e ingestão de e-mail são **sensíveis** → ficam nas fases finais, testados com você.
- Gateway é **Asaas** (não Mercado Pago); "atletas/treinos/Strava/desafios" do Kywo **não entram** (é app de corrida).

---

## FASE 0 — Custo REAL de IA (a base de tudo) 🥇
*Por quê:* é o que você já pediu ("quero ver exatamente o que gasta, não estimativa") e destrava Custos, Serviços e ficha.

- **0.1 — Instrumentar cada chamada de IA.** Nova tabela `ia_chamadas` (grupo_id, operação, modelo, tokens_entrada,
  tokens_saida, custo_usd, ms, sucesso, erro, criado_em). Gravar a partir de `supabase/functions/interpretar-lancamento`
  (hoje só chama a Anthropic; a transcrição é do navegador, de graça). Preço por modelo numa tabela de tarifa editável.
- **0.2 — Gasto real da conta Anthropic.** Função + cron que lê a **Admin/Usage API** da Anthropic e guarda o gasto do
  período. *Preciso de você:* uma **Admin API key** da Anthropic (digo o nome do secret e onde colar).
- **0.3 — Ligar nos lugares:** Custos mostra "IA por operação" (chamadas, US$/R$, tokens médios, tempo médio, falhas);
  "Resultado por cliente" (pagou − custo de IA real); a ficha do cliente ganha o bloco "Custo de IA e resultado".
- *Entrega:* a tela de Custos deixa de usar a estimativa de 3,5¢ e passa a mostrar o número real.

## FASE 1 — Vitórias rápidas (dado que já temos) 🥈
*Por quê:* alto valor, baixo risco — quase tudo já está no banco, falta a tela.

- **1.1 — Auditoria (tela).** Já gravamos tudo em `admin_log`. Nova seção "Auditoria": lista com filtros por categoria
  (cliente/cupom/config/serviço/admin), busca por alvo/admin e **Exportar CSV**. *Sem migração nova de dados.*
- **1.2 — Configurações (seção).** Reúne o que hoje está espalhado: toggles (mascote etc.), **"preço usado nos cálculos"**
  (hoje fixo no código → vai pra config), dias de trial, e **status das integrações** (Anthropic/Resend/Asaas "Configurado").
- **1.3 — Lista de clientes melhor.** Filtros com contagem (ativo/trial/cortesia/vencido/sem plano), colunas de último
  acesso/cadastro e **Exportar CSV**.
- **1.4 — Ficha do cliente em abas.** Reorganiza o que já existe em abas (Resumo / Linha do tempo / Assinatura / Notas)
  + botões de ação no topo (enviar e-mail de acesso, estender trial, tornar admin).

## FASE 2 — Visão geral rica + "Precisa de atenção" 🥉
*Por quê:* é a cara do painel e onde o Kywo abre mais distância.

- **2.1 — Gráficos** (Recharts, já no app): cadastros por dia, receita por mês (6 meses), base de clientes por faixa.
- **2.2 — Cards comparativos:** receita do mês vs. mês passado, resultado do mês, novos cadastros com %, em teste.
- **2.3 — "Precisa de atenção"** (o melhor do Kywo): bloco de alertas **clicáveis** — clientes inativos há 14+ dias,
  onboarding/assinatura pendente, saldo de IA baixo, e-mail de suporte esperando. Cada um leva direto ao cliente/seção.
- **2.4 — Busca global (⌘K):** "buscar cliente ou página".

## FASE 3 — Métricas
- Seção própria com **funil de ativação** (cadastrou → entrou no grupo → 1º lançamento → pagante, com %) e **retenção**
  por coorte de mês. RPCs de agregação (sem tocar em dados de lançamento — LGPD).

## FASE 4 — Saúde proativa
*Por quê:* já temos a Saúde sob demanda; falta ela vigiar sozinha.

- **4.1 — Cron horário** que roda `admin_saude()` e, **só quando surge problema novo**, dispara e-mail pro dono
  (precisa de estado p/ não repetir o mesmo alerta). *Sensível (envia e-mail) → testar com você.*
- **4.2 — Pings de uptime externos:** medir se app/site/painel respondem (e tempo), além dos sinais do banco.

## FASE 5 — Comunicação + Suporte de verdade (pesados, sensíveis)
- **5.1 — Suporte helpdesk:** dois painéis com conversa encadeada, **respostas prontas**, SLA (tempo até 1ª resposta),
  código do ticket, marcar spam. Evolui a inbox atual.
- **5.2 — Ingestão de e-mail** (fecha a Etapa 4): decidir o DNS (opção A recomendada: subdomínio de atendimento →
  Cloudflare Email Routing → Worker → banco, **sem tocar** no MX/SPF/_dmarc da raiz). *Decisão sua pendente.*
- **5.3 — Comunicação:** enviar e-mail/push/sininho pra **segmentos** (todos / ativos / em teste / inativos) +
  reengajamento automático (3/7/30 dias) + histórico. *Disparo em massa → testar junto, com trava e prévia.*

## FASE 6 — Publicar no oficial + travar 2FA no banco
- Depois de você testar a prévia (principalmente o 2FA), publicar as Etapas 1–5 no `admin.hopefin.com.br`.
- **Etapa 6 (já prevista):** exigir `aal2` nas RPCs (travar o 2FA no nível do banco) **depois** que você cadastrar o
  autenticador e aprovar — senão tranca o painel.

---

## Ordem sugerida e o que preciso de você
| Fase | Esforço | Depende de você |
|---|---|---|
| 0 — Custo real de IA | médio-alto | **Admin API key da Anthropic** |
| 1 — Auditoria + Config + lista + ficha | baixo-médio | nada (dado já existe) |
| 2 — Visão geral + atenção + ⌘K | médio | nada |
| 3 — Métricas | médio | nada |
| 4 — Saúde proativa | médio | testar o e-mail de alerta junto |
| 5 — Suporte + ingestão + comunicação | alto | **decisão de DNS** + testar disparos junto |
| 6 — Oficial + travar 2FA | baixo | você testar a prévia + cadastrar 2FA |

**Minha recomendação:** Fase 0 primeiro (é o que você já queria e abre as outras), depois a Fase 1 (barata, só montar telas
sobre dado que já temos). As Fases 5 e 6 ficam pro fim por serem sensíveis/manuais. Cada fase é independente — dá pra
reordenar sem quebrar nada.
