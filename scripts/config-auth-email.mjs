// Configura o e-mail do Supabase Auth do HopeFin: SMTP próprio via Resend (remetente avisos@hopefin.com.br) +
// modelos em português (confirmar e-mail, redefinir senha, link mágico, mudança de e-mail).
// Sem isso o Supabase usa o remetente padrão dele: só 2 e-mails/hora e só para membros da equipe do projeto —
// quem não é da equipe (ex.: a esposa do dono) nunca recebe nada.
// Uso: node scripts/config-auth-email.mjs        (lê supabase/.env.local; não imprime segredos)
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../supabase/.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const ref = env.SUPABASE_PROJECT_REF, token = env.SUPABASE_ACCESS_TOKEN, resend = env.RESEND_API_KEY
if (!ref || !token || !resend) { console.error('faltam SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN / RESEND_API_KEY em supabase/.env.local'); process.exit(1) }

// Layout simples da marca (verde #10b981), compatível com clientes de e-mail (tabela + estilos inline).
const molde = (titulo, texto, botao, link, rodape) => `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#059669;padding:20px 28px;color:#ffffff;font-size:22px;font-weight:bold">HopeFin</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px;line-height:26px">${titulo}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:22px;color:#334155">${texto}</p>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 24px;border-radius:12px">${botao}</a></p>
<p style="margin:0;font-size:12px;line-height:18px;color:#64748b">${rodape}</p>
</td></tr></table>
<p style="font-size:12px;color:#94a3b8;margin:16px 0 0">HopeFin · finanças da família</p>
</td></tr></table></body></html>`

const L = '{{ .ConfirmationURL }}'
const corpo = {
  mailer_subjects_confirmation: 'Confirme seu e-mail no HopeFin',
  mailer_templates_confirmation_content: molde('Confirme seu e-mail', 'Falta só um passo para começar a organizar as contas da sua casa.', 'Confirmar e-mail', L, 'Se você não criou uma conta no HopeFin, pode ignorar este e-mail.'),
  mailer_subjects_recovery: 'Redefinir sua senha no HopeFin',
  mailer_templates_recovery_content: molde('Redefinir sua senha', 'Recebemos um pedido para criar uma nova senha. O link vale por 1 hora.', 'Criar nova senha', L, 'Se não foi você, ignore este e-mail: sua senha continua a mesma.'),
  mailer_subjects_magic_link: 'Seu link de acesso ao HopeFin',
  mailer_templates_magic_link_content: molde('Seu link de acesso', 'Toque no botão para entrar no HopeFin sem digitar a senha.', 'Entrar no HopeFin', L, 'Se não foi você, ignore este e-mail.'),
  mailer_subjects_email_change: 'Confirme seu novo e-mail no HopeFin',
  mailer_templates_email_change_content: molde('Confirme seu novo e-mail', 'Toque no botão para confirmar a troca do e-mail da sua conta.', 'Confirmar novo e-mail', L, 'Se não foi você, ignore este e-mail.'),
}

const corpoSmtp = {
  smtp_host: 'smtp.resend.com', smtp_port: '465', smtp_user: 'resend', smtp_pass: resend,
  smtp_admin_email: 'avisos@hopefin.com.br', smtp_sender_name: 'HopeFin',
  rate_limit_email_sent: 60,
}

const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...corpoSmtp, ...corpo }),
})
if (!r.ok) { console.error('FALHOU', r.status, (await r.text()).slice(0, 300)); process.exit(1) }
const c = await r.json()
console.log('ok — SMTP:', c.smtp_host, c.smtp_port, c.smtp_admin_email, '| limite/h:', c.rate_limit_email_sent, '| assunto confirmação:', c.mailer_subjects_confirmation)
