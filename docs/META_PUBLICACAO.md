# Postar sozinho no Instagram e no Facebook (agência, FASE 3)

O painel já sabe postar as peças aprovadas no horário marcado. Falta ligar a conta da Meta. A chave geral
(`publicar_ativo`) está **desligada** e só liga depois dos passos abaixo e do seu ok.

Como funciona: a cada 5 minutos a função `mkt-publicar` procura peças com status **agendado** cujo dia e horário
(de Brasília) já chegou e posta, no máximo 3 por vez. Deu certo: a peça vira **postado** com o link. Deu erro: tenta de
novo (espera 15 min entre tentativas); na 3ª falha a peça vira **atrasado** e o erro aparece na peça.

## 1. Conferir a conta (uma vez)

1. No app do Instagram, o **@hopefinapp** precisa ser **conta Profissional** (Empresa ou Criador de conteúdo).
2. Ela precisa estar **ligada à Página do Facebook** do HopeFin (Instagram → Configurações → Central de contas, ou na
   Página → Configurações → Contas vinculadas).
3. A Página e o Instagram precisam estar dentro do seu **Business Manager** (business.facebook.com → Configurações
   do negócio → Contas → Páginas / Contas do Instagram).

## 2. O app da Meta

Dá pra **reaproveitar o app que já existe** (o do WhatsApp, `META_APP_ID` no `supabase/.env.local`), desde que ele
seja do tipo **Empresa** e esteja no mesmo Business Manager. No painel do app (developers.facebook.com → seu app):

- Adicione o produto **Instagram** (opção "API com login do Facebook" / Instagram Graph API).
- Não precisa de revisão da Meta: o app só vai postar na **própria** Página e no **próprio** Instagram.

Se o app do WhatsApp for de outro tipo e não deixar adicionar o Instagram, crie um app novo do tipo **Empresa** no
mesmo Business Manager. Um app separado também isola: se um der problema, o outro segue.

## 3. O token (caminho principal: usuário do sistema — não expira)

1. business.facebook.com → **Configurações do negócio → Usuários → Usuários do sistema → Adicionar**.
   Nome: `hopefin-publicador`, função **Admin**.
2. No usuário criado → **Atribuir ativos**: a **Página** do HopeFin e a **conta do Instagram** @hopefinapp, com
   controle total.
3. No mesmo usuário → **Gerar novo token**: escolha o app do passo 2, validade **Nunca**, e marque as permissões:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
   - `business_management`
   - `pages_manage_posts` (só é preciso pro Facebook, mas já marque)
4. Copie o token e cole **você mesmo** no arquivo `supabase/.env.local`, numa linha nova:
   `META_PAGE_TOKEN=...` (nunca mande o token no chat).
5. Rode no terminal, na pasta do hopefin:
   ```
   node scripts/meta-descobrir.mjs
   node scripts/set-secrets.mjs
   ```
   O primeiro mostra (sem mostrar o token) as permissões, o `fb_page_id` da Página e o `ig_user_id` do Instagram.
   O segundo manda o token pros segredos das funções.

A função usa esse token direto no Instagram e, para o Facebook, pede o token da Página na hora (não precisa guardar
outro token).

**Caminho alternativo** (se não der pra usar o usuário do sistema): no **Explorador da Graph API**
(developers.facebook.com/tools/explorer), escolha o app, gere um token de usuário com as mesmas permissões, troque
por um de **longa duração** (Ferramentas → Depurador de token de acesso → "Estender token de acesso") e cole esse
no `META_PAGE_TOKEN`. Esse expira em ~60 dias. Por isso o usuário do sistema é o principal.

## 4. Ligar

Mande pro Claude os dois números que o `meta-descobrir` mostrou (`ig_user_id` e `fb_page_id`; eles não são
segredo). Ele grava no banco, faz uma simulação (mostra o que sairia agora, sem postar) e só então, com o seu ok, liga
a chave. O Facebook nasce **desligado** (`publicar_facebook`); liga separado quando você quiser.

**Atenção na hora de ligar:** qualquer peça que já esteja **agendada com horário no passado** sai logo nos primeiros
5 minutos. Antes de ligar, confira o calendário (hoje existe 1 assim: "A parcela esquecida", 23/11 15:05).

## Limites da Meta (para a equipe saber)

- **Até 50 posts por dia** pela API, por conta do Instagram (na prática, contar com 25). Carrossel conta como 1.
- Imagens só em **JPEG** (os slides já são JPEG). Carrossel: 2 a 10 imagens.
- **Música só embutida no vídeo** (Meta Sound Collection já mixada no mp4). A API não deixa escolher música da
  biblioteca do Instagram. **Carrossel sai sem música.**
- Reel: mp4 (H.264 + AAC), 9:16, de 3 s a 15 min. A Meta processa o vídeo antes de publicar; se demorar, sai na
  execução seguinte (5 min depois).
- Story sai só no Instagram (sem legenda; a API não põe figurinhas nem links).
- Os arquivos vão pra Meta por um link temporário (2 h) do Storage privado. Nada fica público.

## Se algo der errado

- O erro aparece na peça (`pub_erro`). Erro `[190]` = token inválido ou revogado: gere outro (passo 3).
- Desligar tudo na hora: pedir pro Claude pôr `publicar_ativo = false` (ou desligar no painel quando a tela existir).
