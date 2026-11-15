# HopeFin — o que rodou na madrugada (15/11/2026)

Bom dia, Raul! Executei as fases do plano do painel ERP **tudo na PRÉVIA**
(`admin-preview.hopefin.com.br`) — o painel oficial segue **intocado**. Nada de e-mail
foi disparado, nada publicado no oficial. É só você revisar e aprovar.

> Toda migração de banco (0047→0052) foi aplicada **com backup antes e `SMOKE OK` depois**.
> Deploys só no worker da prévia. Branch `admin-erp`, nada mergeado na `main`, sem commit/push.

---

## ✅ Pronto na prévia pra você aprovar

**Fase 0 — Custo REAL de IA (o que você mais pediu)**
- Cada chamada de IA (`interpretar-lancamento`) agora grava tokens, tempo, sucesso e **custo real**
  (tarifa por modelo, editável). Acabou a estimativa de 3,5¢.
- **Custos → "IA por operação"**: chamadas, US$/R$, tokens médios, tempo, falhas. Já validei com
  uma chamada real (Haiku 5.5, 716/151 tokens, US$ 0,000147).
- A ficha do cliente ganhou **"Custo de IA e resultado"** (pagou − custo real).

**Fase 1 — Vitórias rápidas**
- **Auditoria** (nova seção): tudo do `admin_log` com filtro por categoria, busca e **Exportar CSV**.
- **Configurações** (nova seção): IA grátis/mês, teto/pausa do WhatsApp, **tarifas de IA editáveis**,
  status das integrações (Anthropic/Resend/Asaas).
- **Clientes**: chips de filtro com contagem + Exportar CSV.

**Fase 2 — Visão geral rica**
- Bloco **"Precisa de atenção"** (o melhor do Kywo): trials vencendo, inadimplentes, suporte novo,
  saldo de IA baixo, falhas de IA — **cada um clicável**, leva direto à seção.
- Mini-gráfico **Cadastros (14 dias)** e **busca global ⌘K** (buscar cliente ou página).

**Fase 3 — Métricas**
- **Receitas** ganhou **funil de ativação** (cadastrou → entrou no grupo → usou IA → pagante, com %)
  e **retenção** 30 dias.

**Fase 4.2 — Saúde**
- **"No ar agora"**: pings de uptime (app/site/painel) com latência, além dos sinais do banco.

**Fase 5.1 — Suporte helpdesk**
- **Código de ticket** (`HF-xxxxxx`), **SLA** (tempo médio até a 1ª resposta, respondidos, esperando),
  **respostas prontas** (5 modelos que você insere com 1 clique) e **marcar Spam**.

---

## ⏸️ Precisa de você (não dá pra fazer sozinho)

1. **Admin key da Anthropic** (`sk-ant-admin...`) → **Fase 0.2**: reconciliar o gasto total da conta.
   (O custo por chamada já funciona; isso é só o "total do mês" da conta.) Me diz quando criar que
   eu te falo o nome do secret e onde colar.
2. **Testar e-mail juntos** (envia de verdade, por isso parei):
   - **Alerta de saúde por e-mail** (Fase 4.1) — código pronto, falta ligar e testar.
   - **Responder um suporte** de verdade (hoje só o clique seu dispara).
3. **Ingestão de e-mail (5.2)** — você decidiu **contato@hopefin** (encaminhar → endpoint → banco,
   sem tocar no MX/SPF/_dmarc). Construo quando você quiser.
4. **Comunicação em massa (5.3)** — disparo segmentado + reengajamento. Sensível → com trava e prévia, juntos.
5. **Publicar no oficial (Fase 6)** — só depois de você revisar a prévia e **cadastrar o 2FA**; aí eu
   travo o `aal2` no banco (senão tranca o painel antes do cadastro).

---

## Como revisar
Abra **admin-preview.hopefin.com.br** (você já fica logado). Passe por: Visão geral (Precisa de atenção,
⌘K), Custos (IA por operação), Clientes (filtros/CSV + ficha), Receitas (funil), Auditoria, Configurações,
Suporte (SLA + respostas prontas), Saúde (No ar agora). Se aprovar, a gente agenda a publicação no oficial.
