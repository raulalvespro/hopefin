# HopeFin · biblioteca de design

Referência de visual do HopeFin para o Claude Code. São as 69 telas do canvas "Telas de entrada" (https://claude.ai/artifact/WCTb5Dr9hpPmEZPZTkWibd), exportadas em 06/11/2026 como HTML puro, com as animações em CSS. Substitui os prints nos prompts do pacote.

## Como usar

1. Descompacte esta pasta no repositório do HopeFin, em `docs/design/`. Se já existir uma versão anterior, substitua a pasta inteira.
2. Faça commit: `docs: biblioteca de design v2`.
3. Nos prompts, diga qual arquivo ler. Exemplo: "Use como referência `docs/design/telas/contas-mes.html`".
4. Para ver as telas, abra `index.html` no navegador.

## Regras para o Claude Code

- Estas telas são referência de **visual** (cores, tipografia, espaços, componentes e animações), não de conteúdo nem de estrutura. O app atual manda, conforme as regras da seção Design do CLAUDE.md gravadas no prompt 14.
- Leia o código de cada tela: estilos inline, `@keyframes` no `<style>` do topo e `prefers-reduced-motion`, que desliga as animações. Reproduza esses movimentos; na landing eles podem virar GSAP.
- Os tokens oficiais estão em `tokens/tokens.json`. Quando uma tela e o tokens.json divergirem, vale o tokens.json.
- Nomes, valores e datas das telas são de exemplo. Use sempre os dados reais do grupo.
- **Texto desatualizado**: as telas do app ainda mostram a oferta antiga (preço de fundador, 100 vagas, 14 dias, R$ 14,90 e R$ 119,90) e a voz dentro do app.
  - A oferta que vale é a do prompt 2.1: anual de lançamento R$ 149,90 no Pix até 31/12/2026, mensal R$ 24,90 e teste de 7 dias.
  - O lançamento principal é pelo WhatsApp.
- Links entre telas (`href="cadastro.html"`) são só navegação de protótipo; as rotas reais são as do app.

## Decisões de identidade (06/11/2026)

- **Estilo oficial: 6 · ícone de app (claro e limpo).** Base do perfil, do app, do site e do dia a dia nas redes.
- **Estilo 2 · noite (escuro)**: só para conteúdos "sérios" (resumo do mês, comparativos, preços).
- **Estilo 5 · divertido (amarelo)**: só para campanhas e humor (lançamento até 31/12, perguntas da vida real).
- **Estilos 1, 3 e 4**: explorações. Não use.
- **@ das redes**: `@hopefinapp` no Instagram e no Facebook.
- **E-mails**:
  - `contato@hopefin.com.br` é o público, para os clientes;
  - `social@hopefin.com.br` é só para login das redes.
- **Ícone do app (PWA) e favicon**: `telas/pwa-icone.html` (H verde sobre branco até a borda) e `telas/favicon.html` (quadrado branco com borda verde).

## Mascote: Joca, o joão-de-barro

- **Base aprovada**: a versão 1 (verde), em `telas/mascote-folha.html`, `mascote-expressoes.html`, `mascote-casinha.html` e `mascote-figurinhas.html`.
- **Versão final**: vai ser **3D**, com cara confiável, leve e moderna (menos infantil que o desenho vetorial). As imagens 3D entram em `docs/design/mascote/` quando estiverem prontas.
- **Até lá**: não use o desenho vetorial como imagem final no app. Ele é só referência de cor, proporção e regras.
- **Descartados**: `joca-natural`, `joca-pedreiro`, `joca-casinha`, `joca-geometrico`, `joca-silhueta`, `joca-refinado` e `joca-traco`. Ficam aqui só como histórico.
- **Prompts e regras do personagem**: `mascote/joca.md`.

## Telas, por grupo

### App
- **Entrada**:
  - `login.html`, `login-claro.html`, `login-celular.html`;
  - `cadastro.html`, `splash.html`, `onboarding.html`, `boas-vindas.html`.
- **Dentro do app**:
  - `inicio.html`, `inicio-escuro.html`;
  - `contas-mes.html`, `voz-ouvindo.html`, `estados.html`, `feedback.html`;
  - `planos.html`, `banner-fundador.html`, `convite.html`, `resumo-mes.html`.
- **Site**: `landing.html`.
- **E-mail**: `email-topo.html`, `assinatura-email.html`.
- **Ícones**: `pwa-icone.html`, `favicon.html`.

### Redes sociais (estilo 6, oficial)
- **Perfil**: `icone-perfil.html` (perfil oficial) e `icone-perfil-verde.html` (alternativo).
- **Capa e destaques**:
  - `icone-capa.html` (capa do Facebook);
  - `icone-destaque-como-funciona.html`, `icone-destaque-precos.html`, `icone-destaque-duvidas.html`.
- **Posts e stories**:
  - `post-carrossel.html`, `carrossel-slide2.html`, `carrossel-slide3.html`, `carrossel-final.html`;
  - `post-dica.html`, `story-teste.html`, `capa-reels.html`.
- **WhatsApp e guia**: `whatsapp-perfil.html` (foto do número do WhatsApp) e `guia-marca.html` (guia da marca).

### Redes sociais (estilos de apoio)
- **Estilo 2 · noite**:
  - `noite-perfil.html`, `noite-capa.html`;
  - `noite-destaque-como-funciona.html`, `noite-destaque-precos.html`, `noite-destaque-duvidas.html`.
- **Estilo 5 · divertido**:
  - `divertido-perfil.html`, `divertido-capa.html`;
  - `divertido-destaque-como-funciona.html`, `divertido-destaque-precos.html`, `divertido-destaque-duvidas.html`.

### Explorações (não usar)
- **Estilos antigos**:
  - `foto-perfil.html`, `capa-facebook.html`;
  - `destaque-como-funciona.html`, `destaque-precos.html`, `destaque-duvidas.html`;
  - `conversa-perfil.html`, `conversa-capa.html`, `casa-perfil.html`, `casa-capa.html`.
- **Formatos antigos**: `story.html`, `post.html`.

## Qual prompt usa qual tela

| Prompt | Arquivos |
| --- | --- |
| 12 · Ícone e favicon | `pwa-icone.html`, `favicon.html`, `tokens/tokens.json` |
| 14 · Base visual | `tokens/tokens.json`, `estados.html`, `feedback.html`, `inicio.html`, `inicio-escuro.html` |
| 15 · Abertura e entrada | `splash.html`, `login.html`, `login-claro.html`, `login-celular.html`, `cadastro.html`, `onboarding.html`, `boas-vindas.html` |
| 16 · Início, contas e voz | `inicio.html`, `inicio-escuro.html`, `contas-mes.html`, `voz-ouvindo.html`, `estados.html`, `feedback.html` |
| 17 · Planos | `planos.html`, `banner-fundador.html` |
| 18 · Convite | `convite.html` |
| 19 · Resumo do mês | `resumo-mes.html`, `email-topo.html`, `mascote-casinha.html` |
| 19.1 · Copy da página de vendas | `landing.html`, `inicio.html`, `contas-mes.html`, `convite.html`, `resumo-mes.html` |
| 20 · Landing | `landing.html`, a copy aprovada em `docs/landing/copy.md` e o guia `guia-marca.html` |
| 22 · Mascote no app | `mascote/joca.md`, as imagens 3D em `docs/design/mascote/`, `estados.html`, `boas-vindas.html`, `mascote-casinha.html` |
