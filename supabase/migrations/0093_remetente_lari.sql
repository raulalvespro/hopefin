-- 0093_remetente_lari — o remetente do remarketing passa a ser "Lari, do HopeFin" (pedido do Raul, 22/11/2026).
-- Troca no remetente e nos textos das etapas (só onde ainda está o nome antigo: edição do Painel é mantida).
update public.email_config
   set remetente_campanha = replace(remetente_campanha, 'Larissa, do HopeFin', 'Lari, do HopeFin'), atualizado_em = now()
 where id = 1 and remetente_campanha like '%Larissa, do HopeFin%';
alter table public.email_config alter column remetente_campanha set default 'Lari, do HopeFin <novidades@hopefin.com.br>';
update public.email_modelos
   set corpo = replace(replace(corpo, 'Larissa, do HopeFin', 'Lari, do HopeFin'), 'Aqui é a Larissa', 'Aqui é a Lari'), atualizado_em = now()
 where categoria = 'remarketing' and corpo like '%Larissa%';
