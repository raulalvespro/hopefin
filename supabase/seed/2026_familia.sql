-- Seed de demonstração: família de 2 rendas, ano de 2026.
-- Específico da conta de teste (ids fixos). Roda via: node scripts/db.mjs supabase/seed/2026_familia.sql
-- Idempotente: limpa os dados do grupo antes de recriar.

do $$
declare
  g      uuid := '548c079e-168a-4e8a-9eec-c27d0ac61c38'; -- grupo "Família Teste"
  raul   uuid := 'df9fa93c-06ce-43c6-b1b1-c9adc2f7acf2';
  larissa uuid := '80516f35-9b4b-4c58-8e21-90e6a106338e';
  c_nu   uuid; c_inter uuid; c_itau uuid;
  cof_e  uuid; cof_v uuid; cof_i uuid; cof_b uuid;
  yr int := 2026;
  m int;
begin
  -- garante a 2ª usuária no grupo
  insert into usuarios(id, nome, email, grupo_id)
    values (larissa, 'Larissa', 'larissa.teste@hopefin.app', g)
    on conflict (id) do update set nome = excluded.nome, email = excluded.email, grupo_id = excluded.grupo_id;

  -- limpa dados transacionais do grupo
  delete from transferencias where grupo_id = g;
  delete from parcelas       where grupo_id = g;
  delete from parcelamentos  where grupo_id = g;
  delete from cofrinhos      where grupo_id = g;
  delete from gastos         where grupo_id = g;
  delete from entradas       where grupo_id = g;
  delete from contas_fixas   where grupo_id = g;
  delete from assinaturas    where grupo_id = g;
  delete from cartoes        where grupo_id = g;

  -- ===== CARTÕES =====
  insert into cartoes(grupo_id,nome,bandeira,dia_fechamento,dia_vencimento,limite,alerta_dias,ativo)
    values (g,'Nubank','Mastercard',3,10,8000,3,true) returning id into c_nu;
  insert into cartoes(grupo_id,nome,bandeira,dia_fechamento,dia_vencimento,limite,alerta_dias,ativo)
    values (g,'Inter','Visa',20,27,5000,3,true) returning id into c_inter;
  insert into cartoes(grupo_id,nome,bandeira,dia_fechamento,dia_vencimento,limite,alerta_dias,ativo)
    values (g,'Itaú','Visa',1,8,12000,5,true) returning id into c_itau;

  -- ===== CONTAS FIXAS =====
  insert into contas_fixas(grupo_id,nome,valor,dia_vencimento,categoria,alerta_dias,ativo) values
    (g,'Aluguel',2200,10,'moradia',3,true),
    (g,'Condomínio',650,10,'moradia',3,true),
    (g,'Energia (CEMIG)',285,15,'moradia',3,true),
    (g,'Água (COPASA)',115,12,'moradia',3,true),
    (g,'Internet 500MB',120,5,'moradia',2,true),
    (g,'Plano de saúde família',890,20,'saude',5,true),
    (g,'Creche do Bernardo',1180,5,'educacao',5,true),
    (g,'Academia (casal)',180,8,'saude',3,true);

  -- ===== ASSINATURAS =====
  insert into assinaturas(grupo_id,nome,valor,dia_cobranca,ativo) values
    (g,'Netflix',55.90,14,true),
    (g,'Spotify Família',34.90,7,true),
    (g,'Amazon Prime',19.90,22,true),
    (g,'iCloud 200GB',14.90,2,true),
    (g,'Disney+',43.90,18,true);

  -- ===== ENTRADAS (salários recorrentes + avulsos) =====
  for m in 1..12 loop
    insert into entradas(grupo_id,usuario_id,descricao,valor,tipo,recorrente,data) values
      (g,raul,  'Salário',6800,'fixo',true, make_date(yr,m,5)),
      (g,larissa,'Salário',4200,'fixo',true, make_date(yr,m,5));
  end loop;
  insert into entradas(grupo_id,usuario_id,descricao,valor,tipo,recorrente,data) values
    (g,raul,  'Freelance (projeto site)',2500,'avulso',false, make_date(yr,3,18)),
    (g,larissa,'Venda de usados',600,'avulso',false, make_date(yr,5,9)),
    (g,raul,  'Restituição IR',1800,'avulso',false, make_date(yr,6,25)),
    (g,raul,  '13º salário (1ª parcela)',3400,'avulso',false, make_date(yr,11,30)),
    (g,larissa,'13º salário (1ª parcela)',2100,'avulso',false, make_date(yr,11,30));

  -- ===== GASTOS (espalhados Jan–Nov, variando pessoa/categoria/pagamento) =====
  -- Mercado (semanal)
  insert into gastos(grupo_id,usuario_id,descricao,valor,categoria,tipo_pagamento,cartao_id,data)
  select g, case when random()<0.5 then raul else larissa end,
         (array['Supermercado BH','Mercado Verdemar','Atacadão','Hortifruti'])[1+floor(random()*4)],
         round((190 + random()*230)::numeric,2),'mercado','cartao',c_nu,
         (make_date(yr,mo,1) + (w*7 + floor(random()*4))::int)
  from generate_series(1,11) mo, generate_series(0,3) w;

  -- Combustível (2x/mês)
  insert into gastos(grupo_id,usuario_id,descricao,valor,categoria,tipo_pagamento,cartao_id,data)
  select g, raul, 'Combustível', round((150 + random()*130)::numeric,2),'transporte','cartao',c_inter,
         (make_date(yr,mo,1) + (floor(random()*27))::int)
  from generate_series(1,11) mo, generate_series(1,2) k;

  -- Restaurante / iFood (3x/mês, pagamento variado)
  insert into gastos(grupo_id,usuario_id,descricao,valor,categoria,tipo_pagamento,cartao_id,data)
  select g, case when random()<0.5 then raul else larissa end,
         (array['iFood','Restaurante','Padaria','Lanche'])[1+floor(random()*4)],
         round((38 + random()*140)::numeric,2),'alimentacao',
         case when random()<0.6 then 'cartao' else 'pix' end,
         case when random()<0.6 then c_nu else null end,
         (make_date(yr,mo,1) + (floor(random()*27))::int)
  from generate_series(1,11) mo, generate_series(1,3) k;

  -- Lazer (2x/mês)
  insert into gastos(grupo_id,usuario_id,descricao,valor,categoria,tipo_pagamento,cartao_id,data)
  select g, case when random()<0.5 then raul else larissa end,
         (array['Cinema','Passeio parque','Bar com amigos','Show'])[1+floor(random()*4)],
         round((60 + random()*240)::numeric,2),'lazer',
         case when random()<0.5 then 'cartao' else 'pix' end,
         case when random()<0.5 then c_itau else null end,
         (make_date(yr,mo,1) + (floor(random()*27))::int)
  from generate_series(1,11) mo, generate_series(1,2) k;

  -- Farmácia / saúde (ocasional)
  insert into gastos(grupo_id,usuario_id,descricao,valor,categoria,tipo_pagamento,cartao_id,data)
  select g, case when random()<0.5 then raul else larissa end,
         'Farmácia', round((45 + random()*160)::numeric,2),'saude','cartao',c_inter,
         (make_date(yr,mo,1) + (floor(random()*27))::int)
  from generate_series(1,11) mo where random() < 0.7;

  -- Vestuário (alguns meses)
  insert into gastos(grupo_id,usuario_id,descricao,valor,categoria,tipo_pagamento,cartao_id,data)
  select g, case when random()<0.5 then raul else larissa end,
         (array['Roupas','Calçados','Loja infantil'])[1+floor(random()*3)],
         round((90 + random()*350)::numeric,2),'vestuario','cartao',c_itau,
         (make_date(yr,mo,1) + (floor(random()*27))::int)
  from generate_series(1,11) mo where random() < 0.45;

  -- Diversos / outros (1-2x/mês, dinheiro/pix)
  insert into gastos(grupo_id,usuario_id,descricao,valor,categoria,tipo_pagamento,cartao_id,data)
  select g, case when random()<0.5 then raul else larissa end,
         (array['Presente','Pet shop','Manutenção casa','Uber','Papelaria'])[1+floor(random()*5)],
         round((30 + random()*180)::numeric,2),'outros',
         case when random()<0.5 then 'pix' else 'dinheiro' end, null,
         (make_date(yr,mo,1) + (floor(random()*27))::int)
  from generate_series(1,11) mo, generate_series(1,2) k;

  -- Bebê (Bernardo, 2 anos): fraldas/leite mensal + pediatra/vacina ocasional
  insert into gastos(grupo_id,usuario_id,descricao,valor,categoria,tipo_pagamento,cartao_id,data)
  select g, case when random()<0.5 then raul else larissa end,
         'Fraldas e leite (Bernardo)', round((130 + random()*120)::numeric,2),'mercado','cartao',c_nu,
         (make_date(yr,mo,1) + (floor(random()*27))::int)
  from generate_series(1,11) mo;

  insert into gastos(grupo_id,usuario_id,descricao,valor,categoria,tipo_pagamento,cartao_id,data)
  select g, larissa, (array['Pediatra','Vacina','Farmácia bebê'])[1+floor(random()*3)],
         round((160 + random()*160)::numeric,2),'saude','cartao',c_inter,
         (make_date(yr,mo,1) + (floor(random()*27))::int)
  from generate_series(1,11) mo where random() < 0.45;

  -- ===== PARCELAMENTOS (o trigger gera as parcelas) =====
  insert into parcelamentos(grupo_id,usuario_id,descricao,valor_total,num_parcelas,valor_parcela,cartao_id,categoria,data_primeira_parcela) values
    (g,raul,  'Geladeira Brastemp Frost Free',4800,12,400,c_nu,  'eletronico', make_date(yr,3,10)),
    (g,larissa,'Sofá retrátil 3 lugares',      3000,10,300,c_itau,'moveis',     make_date(yr,6,8)),
    (g,raul,  'iPhone 15',                    7200,12,600,c_itau,'eletronico', make_date(yr,9,10)),
    (g,larissa,'Pacote viagem Beach Park',     5000,10,500,c_nu,  'lazer',      make_date(yr,8,10));

  -- marca como pagas as parcelas já vencidas (até hoje)
  update parcelas set paga = true where grupo_id = g and data_vencimento < current_date;

  -- ===== COFRINHOS + APORTES =====
  insert into cofrinhos(grupo_id,nome,descricao,meta,tipo)
    values (g,'Reserva de emergência','Meta: 6 meses de custo fixo',35000,'reserva') returning id into cof_e;
  insert into cofrinhos(grupo_id,nome,descricao,meta,tipo)
    values (g,'Viagem dos sonhos','Disney 2027',20000,'cofrinho') returning id into cof_v;
  insert into cofrinhos(grupo_id,nome,descricao,meta,tipo)
    values (g,'Investimentos (Tesouro/CDB)','Tesouro Direto e CDBs',null,'investimento') returning id into cof_i;
  insert into cofrinhos(grupo_id,nome,descricao,meta,tipo)
    values (g,'Futuro do Bernardo','Faculdade / reserva do filho',50000,'reserva') returning id into cof_b;

  for m in 1..11 loop
    insert into transferencias(grupo_id,usuario_id,cofrinho_id,valor,descricao,data) values
      (g,raul,  cof_e,800,'Aporte mensal reserva', make_date(yr,m,6)),
      (g,larissa,cof_v,450,'Guardando p/ viagem',   make_date(yr,m,6)),
      (g,raul,  cof_i,600,'Aporte investimento',   make_date(yr,m,15)),
      (g,larissa,cof_b,300,'Aporte futuro Bernardo',make_date(yr,m,20));
  end loop;
  -- aportes extras pontuais
  insert into transferencias(grupo_id,usuario_id,cofrinho_id,valor,descricao,data) values
    (g,raul,  cof_e,1800,'Parte da restituição IR', make_date(yr,6,26)),
    (g,raul,  cof_i,2500,'Freelance p/ investir',   make_date(yr,3,20));

  -- recalcula saldo_atual dos cofrinhos
  update cofrinhos c set saldo_atual = coalesce((select sum(valor) from transferencias t where t.cofrinho_id = c.id),0)
    where grupo_id = g;
end $$;
