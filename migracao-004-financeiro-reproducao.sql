-- ============================================================
-- OrdenhaDigital — migração 004
-- Financeiro por fazenda, parcelas e categorias; tanque/laticínio por fazenda (opcional);
-- causa da morte; inseminadores, tipo de cio (natural/IATF) e touro da monta
-- ============================================================

-- ---------- categorias do financeiro (cadastráveis) ----------
create table if not exists categorias_financeiras (
  id serial primary key,
  tipo text not null check (tipo in ('receita','despesa')),
  nome text not null,
  ordem int not null default 0,
  ativo boolean not null default true,
  unique (tipo, nome)
);
alter table categorias_financeiras disable row level security;
insert into categorias_financeiras (tipo, nome, ordem) values
  ('receita','Venda de leite',1), ('receita','Venda de animais',2), ('receita','Venda de bezerros',3), ('receita','Venda de novilhas',4),
  ('receita','Venda de esterco',5), ('receita','Serviços',6), ('receita','Outras receitas',99),
  ('despesa','Alimentação',1), ('despesa','Mão de obra',2), ('despesa','Pró-labore',3), ('despesa','Sanidade',4),
  ('despesa','Medicamentos e veterinário',5), ('despesa','Reprodução',6), ('despesa','Material de ordenha e limpeza',7),
  ('despesa','Energia',8), ('despesa','Água',9), ('despesa','Combustível',10), ('despesa','Fretes',11),
  ('despesa','Manutenção',12), ('despesa','Máquinas e equipamentos',13), ('despesa','Benfeitorias',14),
  ('despesa','Compra de animais',15), ('despesa','Telefone e internet',16), ('despesa','Seguros',17),
  ('despesa','Juros e financiamentos',18), ('despesa','Impostos e taxas',19), ('despesa','Arrendamento',20),
  ('despesa','Outras despesas',99)
on conflict (tipo, nome) do nothing;

-- ---------- lançamentos: fazenda, pago/pendente e parcelas ----------
alter table lancamentos add column if not exists fazenda_id int references fazendas(id) on delete set null;
alter table lancamentos add column if not exists pago boolean not null default true;
alter table lancamentos add column if not exists data_pagamento date;
alter table lancamentos add column if not exists parcela_num int;
alter table lancamentos add column if not exists parcela_total int;
alter table lancamentos add column if not exists grupo uuid;          -- liga as parcelas de uma mesma compra/venda
create index if not exists lancamentos_grupo_idx on lancamentos(grupo);
update lancamentos set data_pagamento = data where pago and data_pagamento is null;

-- ---------- tanque e laticínio por fazenda (opcional: sem fazenda = geral) ----------
alter table producao_tanque add column if not exists id bigserial;
alter table producao_tanque add column if not exists fazenda_id int references fazendas(id) on delete set null;
alter table producao_tanque drop constraint if exists producao_tanque_pkey;
alter table producao_tanque add primary key (id);
alter table producao_tanque drop constraint if exists producao_tanque_data_fazenda_key;
alter table producao_tanque add constraint producao_tanque_data_fazenda_key unique nulls not distinct (data, fazenda_id);

alter table analises_leite add column if not exists fazenda_id int references fazendas(id) on delete set null;
alter table analises_leite drop constraint if exists analises_leite_mes_key;
alter table analises_leite drop constraint if exists analises_leite_mes_fazenda_key;
alter table analises_leite add constraint analises_leite_mes_fazenda_key unique nulls not distinct (mes, fazenda_id);

-- ---------- óbito ----------
alter table animais add column if not exists causa_morte text;

-- ---------- reprodução: inseminadores, tipo de cio e touro da monta ----------
create table if not exists inseminadores (
  id serial primary key,
  nome text not null unique,
  telefone text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table inseminadores disable row level security;
alter table eventos add column if not exists tipo_cio text check (tipo_cio in ('Cio natural','IATF'));
alter table eventos add column if not exists inseminador_id int references inseminadores(id) on delete set null;
alter table eventos add column if not exists touro_animal_id bigint references animais(id) on delete set null;
