-- 0091_email_rastreio_remarketing — aberturas/cliques e a sequência de remarketing (22/11/2026, D11).
--
-- 1) email_log ganha o rastreio que o Resend avisa pela função resend-webhook (entregue, aberto,
--    clicado, devolvido/marcado como spam). Quem marca como spam sai da lista na hora.
-- 2) email_sequencias: as sequências de remarketing. NASCEM DESLIGADAS (ligada = false).
-- 3) remarketing_pessoas: quem entrou em cada sequência e em que pé está
--    (ativo | pausado | removido | assinou | saiu). Atualizada todo dia por remarketing_atualizar()
--    (chamada pela função automacoes-email) — só servidor.
-- 4) As etapas (textos) ficam em email_modelos, com sequencia = chave da sequência.

-- 1) Rastreio ------------------------------------------------------------------------------------
alter table public.email_log add column if not exists entregue_em timestamptz;
alter table public.email_log add column if not exists aberto_em timestamptz;
alter table public.email_log add column if not exists clicado_em timestamptz;
alter table public.email_log add column if not exists problema text;      -- 'devolvido' | 'spam'
alter table public.email_log add column if not exists problema_em timestamptz;
create index if not exists email_log_resend_idx on public.email_log (resend_id) where resend_id is not null;
create index if not exists email_log_tipo_idx on public.email_log (tipo, criado_em desc);

-- 2) Sequências ----------------------------------------------------------------------------------
create table if not exists public.email_sequencias (
  chave text primary key,
  nome text not null,
  descricao text,
  ligada boolean not null default false,
  janela_dias int not null default 60,    -- só entra quem terminou o teste/cancelou nos últimos N dias
  intervalo_dias int not null default 7,  -- no máximo 1 e-mail da sequência a cada N dias
  atualizado_em timestamptz not null default now()
);
alter table public.email_sequencias enable row level security;
insert into public.email_sequencias (chave, nome, descricao) values
  ('remarketing_teste', 'Testou e não assinou', 'Quem terminou o teste grátis e não assinou (sem cortesia).'),
  ('remarketing_cancelou', 'Cancelou', 'Quem pagou, cancelou e já ficou sem acesso.')
on conflict (chave) do nothing;

-- 3) Pessoas na sequência ------------------------------------------------------------------------
create table if not exists public.remarketing_pessoas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  sequencia text not null references public.email_sequencias(chave),
  entrou_em date not null,                -- dia em que o teste acabou / o acesso pago acabou (horário de SP)
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'removido', 'assinou', 'saiu')),
  status_em timestamptz not null default now(),
  assinou_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (usuario_id, sequencia)
);
alter table public.remarketing_pessoas enable row level security;
create index if not exists remarketing_pessoas_status_idx on public.remarketing_pessoas (sequencia, status);

-- Coloca/atualiza as pessoas nas sequências. Só servidor (sem grant).
create or replace function public.remarketing_atualizar()
returns json language plpgsql security definer set search_path = public as $$
declare v_novos int := 0; v_assinou int := 0; v_saiu int := 0; n int;
begin
  -- a) quem assinou (ou virou cortesia) sai da sequência como "assinou"
  update public.remarketing_pessoas p set status = 'assinou', status_em = now(), assinou_em = now()
    from public.subscriptions s
   where s.grupo_id = p.grupo_id and p.status in ('ativo', 'pausado')
     and (s.status = 'active' or coalesce(s.is_cortesia, false));
  get diagnostics v_assinou = row_count;

  -- b) quem pediu pra não receber sai como "saiu"
  update public.remarketing_pessoas p set status = 'saiu', status_em = now()
    from public.usuarios u
   where u.id = p.usuario_id and p.status in ('ativo', 'pausado') and not u.recebe_comunicados;
  get diagnostics v_saiu = row_count;

  -- c) testou e não assinou: teste acabou, nunca pagou, não é cortesia, não está ativo
  insert into public.remarketing_pessoas (usuario_id, grupo_id, sequencia, entrou_em)
  select s.titular_id, s.grupo_id, 'remarketing_teste', (s.trial_ends_at at time zone 'America/Sao_Paulo')::date
    from public.subscriptions s
    join public.email_sequencias q on q.chave = 'remarketing_teste'
    join public.usuarios u on u.id = s.titular_id
   where s.titular_id is not null and s.trial_ends_at is not null
     and s.trial_ends_at < now() and s.trial_ends_at > now() - make_interval(days => q.janela_dias)
     and s.status in ('trial', 'expired') and not coalesce(s.is_cortesia, false)
     and s.primeira_cobranca_em is null
     and u.recebe_comunicados
  on conflict (usuario_id, sequencia) do nothing;
  get diagnostics n = row_count; v_novos := v_novos + n;

  -- d) cancelou: já pagou, está cancelado/expirado e o período pago acabou
  insert into public.remarketing_pessoas (usuario_id, grupo_id, sequencia, entrou_em)
  select s.titular_id, s.grupo_id, 'remarketing_cancelou',
         (greatest(coalesce(s.current_period_end, s.canceled_at), coalesce(s.canceled_at, s.current_period_end)) at time zone 'America/Sao_Paulo')::date
    from public.subscriptions s
    join public.email_sequencias q on q.chave = 'remarketing_cancelou'
    join public.usuarios u on u.id = s.titular_id
   where s.titular_id is not null and s.canceled_at is not null
     and s.status in ('canceled', 'expired') and not coalesce(s.is_cortesia, false)
     and s.primeira_cobranca_em is not null
     and coalesce(s.current_period_end, s.canceled_at) < now()
     and coalesce(s.current_period_end, s.canceled_at) > now() - make_interval(days => q.janela_dias)
     and u.recebe_comunicados
  on conflict (usuario_id, sequencia) do nothing;
  get diagnostics n = row_count; v_novos := v_novos + n;

  return json_build_object('novos', v_novos, 'assinaram', v_assinou, 'sairam', v_saiu);
end $$;
revoke all on function public.remarketing_atualizar() from public, anon, authenticated;

-- 4) Etapas do remarketing (textos pro Raul aprovar). Remetente: Lari, do HopeFin.
insert into public.email_modelos (chave, nome, descricao, categoria, para_quem, ligado, essencial, editavel, sequencia, gatilho, dias, dias_editavel, data_envio, condicao, ordem, assunto, titulo, preheader, corpo, botao_texto, botao_link, variaveis) values
('rmk_teste_4d', 'Seus dados continuam guardados', 'Testou e não assinou · alguns dias depois do fim do teste.', 'remarketing', 'cliente', true, false, true, 'remarketing_teste', null, 4, true, null, null, 100,
 'Seus lançamentos continuam guardados', 'Tudo do jeitinho que você deixou', 'Voltar leva 1 minuto: é só escolher o plano.',
 $t${ola} Aqui é a Lari, do HopeFin.

Passando pra avisar que tudo o que você lançou no teste continua guardado: gastos, cartões e contas do mês. Nada se perdeu.

Voltar leva 1 minuto: você abre o app, escolhe o plano e o grupo inteiro volta a lançar na hora.

{oferta}

Um abraço,
Lari, do HopeFin$t$,
 'Voltar pro HopeFin', '/planos', '{ola,nome,oferta}'),

('rmk_teste_7d', 'O que o HopeFin facilita', 'Testou e não assinou · uma semana depois do fim do teste.', 'remarketing', 'cliente', true, false, true, 'remarketing_teste', null, 7, true, null, null, 101,
 '3 jeitos que o HopeFin facilita o mês da família', '3 coisas que fazem diferença', 'Lançar pelo WhatsApp, contas do mês e a família no mesmo painel.',
 $t${ola} Muita gente testa o HopeFin numa semana corrida e não chega a ver o melhor dele. Então aqui vão três coisas que fazem diferença no dia a dia:

**1. Lançar sem abrir planilha.** Manda uma mensagem ou um áudio pro Joca no WhatsApp ("gastei 45 no mercado") e pronto, está lançado.

**2. Contas do mês sob controle.** O app mostra o que já foi pago e o que ainda vence, e compara o planejado com o que aconteceu de verdade.

**3. A família no mesmo painel.** Até 6 pessoas veem os mesmos números, sem ninguém precisar repassar nada.

Seus dados do teste continuam lá esperando por você.

Um abraço,
Lari, do HopeFin$t$,
 'Ativar meu plano', '/planos', '{ola,nome,oferta}'),

('rmk_teste_15d', 'Depoimento de outra família', 'Testou e não assinou · 15 dias depois. DESLIGADO até termos um depoimento real.', 'remarketing', 'cliente', false, false, true, 'remarketing_teste', null, 15, true, null, null, 102,
 'Como outra família organiza o mês com o HopeFin', 'Como outra família usa o HopeFin', 'Uma história real de quem usa todo dia.',
 $t${ola}

[Escreva aqui o depoimento real, com a autorização da família.]

Se quiser tentar de novo, seus dados do teste continuam guardados.

Um abraço,
Lari, do HopeFin$t$,
 'Voltar pro HopeFin', '/planos', '{ola,nome,oferta}'),

('rmk_teste_30d', 'Último lembrete', 'Testou e não assinou · um mês depois. É o último da sequência.', 'remarketing', 'cliente', true, false, true, 'remarketing_teste', null, 30, true, null, null, 103,
 'Um último recado sobre o seu HopeFin', 'Um último recado', 'Seus dados continuam guardados, quando quiser voltar.',
 $t${ola} Esse é o último e-mail que mando sobre o seu teste, prometo.

Se o HopeFin não fez sentido pra vocês agora, tudo bem: seus dados continuam guardados e dá pra ver e exportar quando quiser.

Se quiser voltar, o plano ativa em 1 minuto.

{oferta}

E se preferir não receber mais nossos e-mails, é só tocar em "Clique aqui" no fim desta mensagem.

Um abraço,
Lari, do HopeFin$t$,
 'Voltar pro HopeFin', '/planos', '{ola,nome,oferta}'),

('rmk_cancelou_7d', 'Posso te fazer uma pergunta?', 'Cancelou · uma semana depois que o acesso acabou.', 'remarketing', 'cliente', true, false, true, 'remarketing_cancelou', null, 7, true, null, null, 110,
 'Posso te fazer uma pergunta?', 'Posso te fazer uma pergunta?', 'Sua resposta ajuda a gente a melhorar.',
 $t${ola} Aqui é a Lari, do HopeFin. Vi que você cancelou a assinatura e queria entender o motivo.

Faltou alguma coisa? Algo não funcionou como você esperava? É só responder este e-mail — eu leio tudo, e a sua resposta ajuda a gente a melhorar.

Seus dados continuam guardados e dá pra ver e exportar quando quiser.

Um abraço,
Lari, do HopeFin$t$,
 null, null, '{ola,nome,oferta}'),

('rmk_cancelou_30d', 'Que tal voltar?', 'Cancelou · um mês depois que o acesso acabou.', 'remarketing', 'cliente', true, false, true, 'remarketing_cancelou', null, 30, true, null, null, 111,
 'Que tal voltar pro HopeFin?', 'Que tal voltar?', 'Seus dados estão guardados, do jeito que estavam.',
 $t${ola} Faz um tempinho que você saiu do HopeFin. A gente segue melhorando o app toda semana.

Seus dados estão guardados: se quiser voltar, o plano ativa em 1 minuto e tudo aparece do jeito que estava.

{oferta}

Um abraço,
Lari, do HopeFin$t$,
 'Voltar pro HopeFin', '/planos', '{ola,nome,oferta}'),

('rmk_oferta_3112', 'Oferta de lançamento acaba em 31/12', 'Data marcada · vai pra todo mundo das sequências ligadas. Só sai com a oferta de lançamento valendo.', 'remarketing', 'cliente', true, false, true, null, 'data_fixa', null, false, date '2026-12-26', 'oferta_lancamento', 120,
 'A oferta de lançamento do HopeFin acaba em 31/12', 'Últimos dias da oferta 🎁', 'O anual com preço de lançamento vale só até 31/12.',
 $t${ola} Passando rapidinho pra avisar: a oferta de lançamento do HopeFin acaba em **31/12, às 23h59**.

{oferta}

Depois disso, o anual volta pro preço normal. Seus dados continuam guardados: assinando, vocês continuam de onde pararam.

Um abraço,
Lari, do HopeFin$t$,
 'Garantir a oferta', '/planos', '{ola,nome,oferta}')
on conflict (chave) do nothing;
