#!/usr/bin/env node
// Agenda o digest diário de push via pg_cron + pg_net.
// Lê CRON_SECRET de supabase/.env.local e a anon key de .env ( nenhum segredo
// é commitado — eles só vão parar no cron.job do banco, que é server-side).
//
//   node scripts/setup-cron.mjs
//
// Horário: 08:00 America/Sao_Paulo = 11:00 UTC, todo dia.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readEnv(file) {
  const out = {}
  const p = join(root, file)
  if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const envLocal = readEnv('supabase/.env.local')
const envFront = readEnv('.env')
const TOKEN = envLocal.SUPABASE_ACCESS_TOKEN
const REF = envLocal.SUPABASE_PROJECT_REF
const CRON = envLocal.CRON_SECRET
const ANON = envFront.VITE_SUPABASE_ANON_KEY
if (!TOKEN || !REF || !CRON || !ANON) {
  console.error('✖ Faltam SUPABASE_ACCESS_TOKEN/PROJECT_REF/CRON_SECRET (.env.local) ou VITE_SUPABASE_ANON_KEY (.env).')
  process.exit(1)
}

const urlPush = `https://${REF}.supabase.co/functions/v1/send-push`
const urlTrial = `https://${REF}.supabase.co/functions/v1/fim-de-trial`
const urlVenc = `https://${REF}.supabase.co/functions/v1/lembrete-vencimento`
const urlResumo = `https://${REF}.supabase.co/functions/v1/resumo-mensal`
const urlRenovar = `https://${REF}.supabase.co/functions/v1/renovar-cartao`
const urlReembolsos = `https://${REF}.supabase.co/functions/v1/reembolsos`
const urlSaude = `https://${REF}.supabase.co/functions/v1/saude-alerta`
const urlAvisoChamado = `https://${REF}.supabase.co/functions/v1/suporte-aviso-dono`
const urlComunicados = `https://${REF}.supabase.co/functions/v1/comunicados-agendados`
const urlAutomacoes = `https://${REF}.supabase.co/functions/v1/automacoes-email`
const urlMktPublicar = `https://${REF}.supabase.co/functions/v1/mkt-publicar`

// Agência de marketing (FASE 3, 0124) — a cada 5 min, SÓ chama a função quando a chave publicar_ativo está ligada
// E há peça agendada cujo data+horario (Brasília) já chegou. Rodar só este: node scripts/setup-cron.mjs --so-mkt
const sqlMkt = `
do $unsched$ begin
  perform cron.unschedule('hopefin-mkt-publicar');
exception when others then null; end $unsched$;

select cron.schedule('hopefin-mkt-publicar', '*/5 * * * *', $cron$
  select net.http_post(
    url := '${urlMktPublicar}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '${ANON}',
      'x-cron-secret', '${CRON}'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  where exists (select 1 from public.mkt_config where id = 1 and publicar_ativo)
    and exists (
      select 1 from public.mkt_pecas
       where status = 'agendado' and horario is not null and pub_tentativas < 3
         and (data + horario) at time zone 'America/Sao_Paulo' <= now()
    );
$cron$);
`
const SO_MKT = process.argv.includes('--so-mkt')
const sqlTodos = `
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Digest diário de push — 08:00 BRT (11:00 UTC)
do $unsched$ begin
  perform cron.unschedule('hopefin-digest-diario');
exception when others then null; end $unsched$;

select cron.schedule('hopefin-digest-diario', '0 11 * * *', $cron$
  select net.http_post(
    url := '${urlPush}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '${ANON}',
      'x-cron-secret', '${CRON}'
    ),
    body := jsonb_build_object('acao', 'digest')
  );
$cron$);

-- Avisos de fim de trial (D-2 e no dia) — 09:00 BRT (12:00 UTC)
do $unsched$ begin
  perform cron.unschedule('hopefin-fim-de-trial');
exception when others then null; end $unsched$;

select cron.schedule('hopefin-fim-de-trial', '0 12 * * *', $cron$
  select net.http_post(
    url := '${urlTrial}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '${ANON}',
      'x-cron-secret', '${CRON}'
    ),
    body := '{}'::jsonb
  );
$cron$);

-- Lembrete de vencimento (vence hoje/amanhã) — 08:30 BRT (11:30 UTC)
do $unsched$ begin
  perform cron.unschedule('hopefin-vencimentos');
exception when others then null; end $unsched$;

select cron.schedule('hopefin-vencimentos', '30 11 * * *', $cron$
  select net.http_post(
    url := '${urlVenc}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '${ANON}',
      'x-cron-secret', '${CRON}'
    ),
    body := '{}'::jsonb
  );
$cron$);

-- Resumo mensal (do mês anterior) — dia 1, 09:30 BRT (12:30 UTC)
do $unsched$ begin
  perform cron.unschedule('hopefin-resumo-mensal');
exception when others then null; end $unsched$;

select cron.schedule('hopefin-resumo-mensal', '30 12 1 * *', $cron$
  select net.http_post(
    url := '${urlResumo}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '${ANON}',
      'x-cron-secret', '${CRON}'
    ),
    body := '{}'::jsonb
  );
$cron$);

-- Renovação do anual no cartão (aviso D-7 e cobrança no dia) — 10:00 BRT (13:00 UTC)
do $unsched$ begin
  perform cron.unschedule('hopefin-renovar-cartao');
exception when others then null; end $unsched$;

select cron.schedule('hopefin-renovar-cartao', '0 13 * * *', $cron$
  select net.http_post(
    url := '${urlRenovar}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '${ANON}',
      'x-cron-secret', '${CRON}'
    ),
    body := '{}'::jsonb
  );
$cron$);

-- Reembolsos pendentes (0129) — de hora em hora, aos 20 min, SÓ quando há algum pendente: tenta estornar de novo
-- e avisa o dono (~a cada 20 h; "ATRASADO" se passou do prazo prometido ao cliente).
do $unsched$ begin
  perform cron.unschedule('hopefin-reembolsos');
exception when others then null; end $unsched$;

select cron.schedule('hopefin-reembolsos', '20 * * * *', $cron$
  select net.http_post(
    url := '${urlReembolsos}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '${ANON}',
      'x-cron-secret', '${CRON}'
    ),
    body := '{}'::jsonb
  ) where exists (select 1 from public.reembolsos_pendentes where status = 'pendente');
$cron$);

-- Alerta de saúde — de hora em hora (só manda e-mail quando surge problema novo)
do $unsched$ begin
  perform cron.unschedule('hopefin-saude-alerta');
exception when others then null; end $unsched$;

select cron.schedule('hopefin-saude-alerta', '0 * * * *', $cron$
  select net.http_post(
    url := '${urlSaude}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '${ANON}',
      'x-cron-secret', '${CRON}'
    ),
    body := '{}'::jsonb
  );
$cron$);

-- Aviso de chamado novo pro dono — a cada 5 min, mas SÓ chama a função quando há chamado sem aviso (0083)
do $unsched$ begin
  perform cron.unschedule('hopefin-suporte-aviso');
exception when others then null; end $unsched$;

select cron.schedule('hopefin-suporte-aviso', '*/5 * * * *', $cron$
  select net.http_post(
    url := '${urlAvisoChamado}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '${ANON}',
      'x-cron-secret', '${CRON}'
    ),
    body := '{}'::jsonb
  )
  where exists (
    select 1 from public.suporte_emails
     where origem = 'app' and aviso_dono_em is null and recebido_em > now() - interval '2 days'
  );
$cron$);

-- Comunicados agendados (A8.15, 0089) — a cada 5 min, SÓ chama a função quando há algum na hora
do $unsched$ begin
  perform cron.unschedule('hopefin-comunicados-agendados');
exception when others then null; end $unsched$;

select cron.schedule('hopefin-comunicados-agendados', '*/5 * * * *', $cron$
  select net.http_post(
    url := '${urlComunicados}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '${ANON}',
      'x-cron-secret', '${CRON}'
    ),
    body := '{}'::jsonb
  )
  where exists (
    select 1 from public.comunicados
     where agendado_para <= now() and enviado_em is null and cancelado_em is null
  );
$cron$);

-- Automações de e-mail criadas no Painel + remarketing (0090–0092) — 10:30 BRT (13:30 UTC).
-- A sequência de remarketing só envia quando ligada no Painel (nasce desligada).
do $unsched$ begin
  perform cron.unschedule('hopefin-automacoes-email');
exception when others then null; end $unsched$;

select cron.schedule('hopefin-automacoes-email', '30 13 * * *', $cron$
  select net.http_post(
    url := '${urlAutomacoes}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '${ANON}',
      'x-cron-secret', '${CRON}'
    ),
    body := '{}'::jsonb
  );
$cron$);
${sqlMkt}`
const sql = SO_MKT ? `create extension if not exists pg_cron;
create extension if not exists pg_net;
${sqlMkt}` : sqlTodos

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const text = await res.text()
if (!res.ok) { console.error(`✖ Falha ao agendar (HTTP ${res.status}):\n${text}`); process.exit(1) }
console.log('✔ Crons agendados:')
console.log('  • hopefin-mkt-publicar      (a cada 5 min, só com a chave ligada e peça vencida) — posta no Instagram/Página')
if (SO_MKT) { console.log(text.slice(0, 500)); process.exit(0) }
console.log('  • hopefin-digest-diario   (08:00 BRT / 11:00 UTC) — digest de push')
console.log('  • hopefin-vencimentos     (08:30 BRT / 11:30 UTC) — lembrete de vencimento')
console.log('  • hopefin-fim-de-trial    (09:00 BRT / 12:00 UTC) — avisos de fim de trial')
console.log('  • hopefin-renovar-cartao   (10:00 BRT / 13:00 UTC) — renovação do anual no cartão')
console.log('  • hopefin-reembolsos       (de hora em hora, aos 20 min, só com pendente) — tenta o estorno e avisa o dono')
console.log('  • hopefin-saude-alerta     (de hora em hora) — alerta de saúde ao dono quando há problema novo')
console.log('  • hopefin-suporte-aviso     (a cada 5 min, só quando há chamado novo) — e-mail + push pro dono')
console.log('  • hopefin-comunicados-agendados (a cada 5 min, só quando há comunicado na hora)')
console.log('  • hopefin-resumo-mensal   (dia 1, 09:30 BRT / 12:30 UTC) — resumo do mês anterior')
console.log(text.slice(0, 500))
