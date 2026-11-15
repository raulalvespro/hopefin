-- 0058_flags_app.sql
-- Ajuste combinado (15/11/2026): as feature flags controlam o que vai pro APP DO
-- USUÁRIO (o dia a dia), NÃO as seções do /admin. O painel é todo do dono por
-- enquanto (ele é o único admin); quando houver outro admin, a gente define como
-- limitar. Então:
--   - a gestão de WhatsApp no painel deixa de ter flag (fica sempre visível pro admin);
--   - nova flag 'whatsapp_app' controla o card "Conectar meu WhatsApp" no app do
--     usuário: começa SÓ no dono (teste em produção) e ele libera pra todos quando aprova.
-- Idempotente e não-destrutivo (não rebaixa uma flag já promovida).

delete from public.feature_flags where chave = 'whatsapp_admin';

insert into public.feature_flags (chave, titulo, descricao, audiencia) values
  ('whatsapp_app', 'Lançar por WhatsApp (no app)',
   'Mostra o card "Conectar meu WhatsApp" em Configurações do app. Comece em "Só eu" pra testar em produção; libere pra todos quando aprovar.',
   'dono')
on conflict (chave) do nothing;
