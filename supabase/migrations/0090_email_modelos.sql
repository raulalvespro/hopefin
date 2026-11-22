-- 0090_email_modelos — textos dos e-mails automáticos no banco (22/11/2026, pedido do Raul).
-- O Painel ("E-mails automáticos") edita assunto, título, texto e botão sem precisar de deploy,
-- liga/desliga cada automação e cria automações novas. As funções leem daqui e, se o banco falhar
-- ou a linha sumir, usam o texto que já está no código (nada para de sair).
--
-- Formato do texto (coluna corpo): texto simples. Linha em branco = novo parágrafo; **assim** = negrito;
-- {variavel} = trecho que se preenche sozinho (lista em `variaveis`). Tudo é escapado antes de virar HTML.
-- essencial = não pode ser desligado (aviso de cobrança/cancelamento, resposta de chamado, avisos internos).
-- editavel = false → só aparece na lista (avisos internos pro Raul, com dados do sistema).
-- Remarketing (sequencia = 'remarketing_*' ou categoria 'remarketing'): sai pelo remetente de campanha
-- (email_config) e sempre com o link "não quero receber".

create table if not exists public.email_config (
  id int primary key default 1 check (id = 1),
  remetente_campanha text not null default 'Lari, do HopeFin <novidades@hopefin.com.br>',
  responder_campanha text not null default 'contato@hopefin.com.br',
  atualizado_em timestamptz not null default now()
);
insert into public.email_config (id) values (1) on conflict (id) do nothing;
alter table public.email_config enable row level security; -- sem policy: só servidor e RPCs admin

create table if not exists public.email_modelos (
  chave text primary key,                -- = email_log.tipo
  nome text not null,                    -- nome no Painel
  descricao text,                        -- quando sai, em linguagem simples
  categoria text not null,               -- teste | conta | cobranca | grupo | suporte | interno | remarketing | personalizado
  para_quem text not null default 'cliente', -- cliente | dono_grupo | admin
  ligado boolean not null default true,
  essencial boolean not null default false,
  editavel boolean not null default true,
  personalizado boolean not null default false, -- criado pelo Raul no Painel (pode excluir)
  gatilho text,                          -- automações do motor: apos_cadastro | apos_fim_teste | apos_cancelar | sem_entrar | data_fixa
  dias int,                              -- dias do gatilho (ou da etapa da sequência; na régua: dias antes/depois)
  dias_editavel boolean not null default false,
  data_envio date,                       -- gatilho data_fixa
  condicao text,                         -- ex.: 'oferta_lancamento' = só sai com a oferta de lançamento valendo
  sequencia text,                        -- remarketing_teste | remarketing_cancelou | null
  ordem int not null default 0,
  assunto text, titulo text, preheader text, corpo text,
  botao_texto text, botao_link text,     -- link: '/planos' (tela do app) ou 'https://...'
  variaveis text[] not null default '{}',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.email_modelos enable row level security; -- sem policy: só servidor e RPCs admin

-- Textos de hoje (copiados do código em 22/11/2026). on conflict do nothing: rodar de novo não apaga edição.
insert into public.email_modelos (chave, nome, descricao, categoria, para_quem, essencial, editavel, dias, dias_editavel, ordem, assunto, titulo, preheader, corpo, botao_texto, botao_link, variaveis) values
('boas_vindas', 'Boas-vindas', 'Logo depois que a pessoa cria a conta.', 'conta', 'cliente', false, true, null, false, 10,
 'Bem-vindo ao HopeFin 💚', 'Bem-vindo ao HopeFin', 'Suas finanças da família, no mesmo lugar — comece em poucos minutos.',
 $t${ola} Que bom ter você no HopeFin 💚

Aqui as finanças da sua família ficam no **mesmo lugar**: dá pra lançar um gasto **falando**, acompanhar o **planejado × praticado** das contas do mês e ver pra onde o dinheiro está indo — tudo compartilhado com quem divide as contas com você.

Pra começar, vale cadastrar sua **renda**, um **cartão** e uma **conta fixa**. Em poucos minutos o painel já fica com a sua cara.$t$,
 'Abrir o HopeFin', '/', '{ola,nome}'),

('membro_entrou', 'Entrou gente no grupo', 'Quando alguém entra no grupo pelo convite. Vai pra quem criou o grupo.', 'grupo', 'dono_grupo', false, true, null, false, 20,
 '{quem} entrou no seu grupo no HopeFin', 'Entrou gente nova no seu grupo', '{quem} entrou no grupo {grupo}.',
 $t${ola} **{quem}** acabou de entrar no seu grupo **{grupo}** no HopeFin.

Agora vocês dividem o mesmo painel: os lançamentos, as contas do mês e o resumo ficam juntos. Se não foi você quem convidou, é só responder este e-mail que a gente te ajuda.$t$,
 'Abrir o HopeFin', '/', '{ola,nome,quem,grupo}'),

('fim_trial_3d', 'Teste: faltam alguns dias', 'Alguns dias antes do teste grátis acabar (você escolhe quantos).', 'teste', 'cliente', false, true, 3, true, 30,
 'Faltam {dias_restantes} do seu teste no HopeFin', 'Faltam {dias_restantes} de teste 💚', 'Seus lançamentos ficam guardados. Escolha um plano em 2 minutos.',
 $t${ola} Seu teste grátis do HopeFin termina em **{dias_restantes}**, no dia {fim}.

Tudo o que vocês lançaram até aqui fica guardado: gastos, contas do mês, cartões e o **planejado × praticado**. Pra seguir usando, é só escolher um plano — leva 2 minutos. Um plano só serve pra família toda: até 6 pessoas no mesmo painel.

{oferta}$t$,
 'Escolher meu plano', '/planos', '{ola,nome,fim,dias_restantes,oferta}'),

('fim_trial_0d', 'Teste: último dia', 'No último dia do teste grátis.', 'teste', 'cliente', false, true, 0, false, 31,
 'Hoje é o último dia do seu teste no HopeFin', 'Seu teste termina hoje', 'Assinando hoje, nada muda: vocês continuam de onde pararam.',
 $t${ola} Hoje é o **último dia** do seu teste grátis.

Assinando, vocês continuam de onde pararam: nada se perde e o painel segue o mesmo pra todo mundo do grupo.

Se não assinar agora, tudo bem: seus dados continuam guardados e dá pra ver e exportar quando quiser. Só os lançamentos novos ficam pausados até a assinatura.

{oferta}$t$,
 'Assinar o HopeFin', '/planos', '{ola,nome,fim,oferta}'),

('fim_trial_d1', 'Teste: sentimos sua falta', 'Alguns dias depois do teste acabar, para quem não assinou (você escolhe quantos).', 'teste', 'cliente', false, true, 1, true, 32,
 'Sentimos sua falta no HopeFin', 'Sentimos sua falta 💚', 'Seus lançamentos continuam guardados, do jeitinho que você deixou.',
 $t${ola} Seu teste do HopeFin terminou. Seus lançamentos continuam guardados, do jeitinho que você deixou.

Quando quiser voltar a lançar, é só ativar o plano: em 2 minutos o grupo inteiro volta a usar.

{oferta}

Ficou alguma dúvida ou algo não funcionou como você esperava? Responde este e-mail — a gente lê tudo.$t$,
 'Ativar meu plano', '/planos', '{ola,nome,fim,oferta}'),

('vencimentos', 'Contas a vencer', 'Todo dia de manhã, quando o grupo tem contas vencendo nos próximos dias.', 'conta', 'cliente', false, true, null, false, 40,
 'Você tem {qtd_contas} a vencer', 'Você tem {qtd_contas} a vencer', '{qtd_contas} a vencer · total {total}',
 $t${ola} Uma lembrança rápida das contas da sua família que estão chegando:

{lista_contas}$t$,
 'Ver no HopeFin', '/contas-do-mes', '{ola,nome,qtd_contas,total,lista_contas}'),

('resumo_mensal', 'Resumo do mês', 'Dia 1 de cada mês, com os números do mês que fechou.', 'conta', 'cliente', false, true, null, false, 41,
 'Seu resumo de {mes} chegou', 'Seu resumo de {mes} chegou', 'Saldo do mês {saldo} · sobra {sobra}',
 $t${ola} {numeros}$t$,
 'Ver o mês no HopeFin', '/fechamento', '{ola,nome,mes,saldo,sobra,numeros}'),

('renovacao_aviso', 'Plano anual renova em 7 dias', '7 dias antes de renovar o plano anual no cartão (a lei pede o aviso).', 'cobranca', 'cliente', true, true, null, false, 50,
 'Seu plano anual do HopeFin renova em 7 dias', 'Seu plano renova em 7 dias', 'Seu plano anual do HopeFin renova em 7 dias',
 $t${ola}

Seu plano anual do HopeFin renova em **{data_renovacao}**. Vamos cobrar **{valor}** ({forma}) no mesmo cartão, com o preço que você já tem.

Não quer renovar? É só cancelar em **Configurações → Minha assinatura** antes dessa data — o acesso continua até o fim do período já pago e nada será cobrado.$t$,
 'Ver minha assinatura', '/configuracoes', '{ola,nome,data_renovacao,valor,forma}'),

('renovacao_ok', 'Plano renovado', 'Quando a renovação do anual no cartão passa.', 'cobranca', 'cliente', true, true, null, false, 51,
 'Seu plano anual do HopeFin foi renovado', 'Plano renovado', 'Seu plano anual do HopeFin foi renovado',
 $t${ola}

Renovamos o seu plano anual: **{valor}** ({forma}) no cartão cadastrado. Obrigado por continuar com a gente!$t$,
 'Abrir o HopeFin', '/', '{ola,nome,valor,forma}'),

('renovacao_falha', 'Não conseguimos renovar', 'Quando a cobrança da renovação no cartão não passa.', 'cobranca', 'cliente', true, true, null, false, 52,
 'Não conseguimos renovar o seu plano do HopeFin', 'Não conseguimos renovar', 'Não conseguimos renovar o seu plano do HopeFin',
 $t${ola}

Tentamos renovar o seu plano anual, mas a cobrança no cartão não passou. Seus dados continuam guardados: você ainda vê e exporta tudo. Para voltar a lançar, é só assinar de novo com um cartão válido (ou pelo Pix).$t$,
 'Regularizar agora', '/planos', '{ola,nome}'),

('cancelamento', 'Cancelamento confirmado', 'Quando a pessoa cancela a assinatura.', 'cobranca', 'cliente', true, true, null, false, 53,
 'Seu cancelamento no HopeFin foi confirmado', 'Cancelamento confirmado', 'Seu cancelamento no HopeFin foi confirmado',
 $t${ola}

Recebemos o seu pedido e a assinatura foi cancelada. **Nenhuma nova cobrança será feita.**

{situacao}

Seus dados continuam guardados: você pode ver e exportar tudo quando quiser. Mudou de ideia? Você pode assinar de novo a qualquer momento.$t$,
 'Ver planos', '/planos', '{ola,nome,situacao}'),

('remocao_grupo', 'Saiu do grupo', 'Quando quem criou o grupo remove alguém. Vai pra pessoa removida.', 'grupo', 'cliente', false, true, null, false, 21,
 'Você saiu do grupo {grupo}', 'Você foi removido(a) do grupo', 'Você saiu do grupo {grupo}',
 $t${ola}

{quem} removeu você do grupo **{grupo}** no HopeFin. Você não vê mais os gastos, contas e metas desse grupo; o que você lançou continua nele.

Sua conta continua ativa: você pode criar um grupo novo ou entrar em outro com um convite. Se achar que foi engano, fale com quem criou o grupo.$t$,
 'Abrir o HopeFin', '/', '{ola,nome,quem,grupo}'),

('chamado_resposta', 'Resposta de chamado', 'Quando você responde um chamado aberto pelo app (Suporte).', 'suporte', 'cliente', true, true, null, false, 60,
 'Respondemos seu chamado {codigo}', 'Respondemos seu chamado', 'A equipe HopeFin respondeu o seu chamado.',
 $t${ola}

Sobre o seu chamado **{codigo}**{assunto_chamado}:

{resposta}

A resposta também está no app, em **Ajuda › Meus chamados**.$t$,
 'Ver no app', '/?ajuda=chamados', '{ola,nome,codigo,assunto_chamado,resposta}'),

('chamado_novo_admin', 'Aviso de chamado novo (pra você)', 'A cada 5 minutos, se tiver chamado novo esperando. Vai só pros admins.', 'interno', 'admin', true, false, null, false, 90,
 null, null, null, null, null, null, '{}'),

('saude_alerta', 'Alerta de saúde do sistema (pra você)', 'De hora em hora, só quando algo no sistema precisa de atenção. Vai só pros admins.', 'interno', 'admin', true, false, null, false, 91,
 null, null, null, null, null, null, '{}')
on conflict (chave) do nothing;
