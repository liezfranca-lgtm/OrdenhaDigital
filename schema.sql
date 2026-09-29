-- ============================================================
-- OrdenhaDigital — GM Agronegócios
-- Schema completo (Supabase / Postgres)
-- ============================================================

-- ---------- Lotes ----------
create table if not exists lotes (
  id serial primary key,
  nome text not null unique,
  tipo text not null default 'lactacao' check (tipo in ('lactacao','pre_parto','secas','novilhas','bezerras','outro')),
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- Touros / sêmen (botijão) ----------
create table if not exists touros (
  id serial primary key,
  codigo text not null unique,
  raca text,
  central text,
  sexado boolean not null default false,
  doses int not null default 0,
  preco_dose numeric(10,2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- Animais ----------
create table if not exists animais (
  id bigserial primary key,
  brinco text not null unique,
  nome text,
  raca text,
  categoria text not null check (categoria in ('Bezerra','Novilha','Lactação','Seca')),
  data_nascimento date,
  mae_id bigint references animais(id) on delete set null,
  pai text,
  lote_id int references lotes(id) on delete set null,
  -- situação atual (histórico completo fica em eventos_reprodutivos)
  numero_lactacao int not null default 0,
  data_ultimo_parto date,
  situacao_reprodutiva text not null default 'Vazia'
    check (situacao_reprodutiva in ('Em recria','Apta p/ IA','Pós-parto','Vazia','Inseminada','Prenhe')),
  data_ultima_ia date,
  touro_ultima_ia text,
  ias_no_ciclo int not null default 0,
  data_secagem date,
  -- cria
  colostro_ok boolean,
  data_b19 date,
  leite_aleitamento numeric(5,1),
  data_desmama date,
  peso numeric(6,1),
  -- saída do rebanho
  ativo boolean not null default true,
  data_saida date,
  motivo_saida text,
  observacao text,
  criado_em timestamptz not null default now()
);
create index if not exists animais_categoria_idx on animais(categoria) where ativo;

-- ---------- Eventos reprodutivos / histórico ----------
create table if not exists eventos (
  id bigserial primary key,
  animal_id bigint not null references animais(id) on delete cascade,
  data date not null,
  tipo text not null,           -- Inseminação, Diagnóstico positivo, Diagnóstico negativo, Cio observado, Parto, Secagem, Aborto, Nascimento, Desmama, Vacina B19, Saída...
  touro_id int references touros(id) on delete set null,
  detalhe text,
  criado_em timestamptz not null default now()
);
create index if not exists eventos_animal_idx on eventos(animal_id, data desc);

-- ---------- Controle leiteiro individual ----------
create table if not exists pesagens_leite (
  id bigserial primary key,
  animal_id bigint not null references animais(id) on delete cascade,
  data date not null,
  manha numeric(5,1) not null default 0,
  tarde numeric(5,1) not null default 0,
  total numeric(5,1) generated always as (manha + tarde) stored,
  ccs int,                       -- mil cél/mL
  criado_em timestamptz not null default now(),
  unique (animal_id, data)
);
create index if not exists pesagens_leite_data_idx on pesagens_leite(data desc);

-- ---------- Tanque (entrega diária) ----------
create table if not exists producao_tanque (
  data date primary key,
  litros numeric(8,1) not null,
  descartado numeric(8,1) not null default 0,
  observacao text,
  criado_em timestamptz not null default now()
);

create table if not exists temperaturas_tanque (
  id bigserial primary key,
  data date not null,
  hora time not null,
  temperatura numeric(4,1) not null,
  criado_em timestamptz not null default now()
);

-- ---------- Sanidade ----------
create table if not exists tratamentos (
  id bigserial primary key,
  animal_id bigint not null references animais(id) on delete cascade,
  doenca text not null,
  medicamento text not null,
  data_inicio date not null,
  dias_aplicacao int not null default 1,
  carencia_leite int not null default 0,
  carencia_carne int not null default 0,
  data_liberacao date generated always as (data_inicio + dias_aplicacao + carencia_leite) stored,
  observacao text,
  criado_em timestamptz not null default now()
);

create table if not exists manejos_sanitarios (
  id serial primary key,
  nome text not null unique,
  grupo text,
  frequencia_dias int not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists aplicacoes_sanitarias (
  id bigserial primary key,
  manejo_id int not null references manejos_sanitarios(id) on delete cascade,
  data date not null,
  observacao text,
  criado_em timestamptz not null default now()
);

-- ---------- Nutrição e estoque ----------
create table if not exists insumos (
  id serial primary key,
  nome text not null unique,
  unidade text not null default 'kg',
  preco numeric(10,2) not null default 0,
  estoque numeric(12,2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists insumo_movimentos (
  id bigserial primary key,
  insumo_id int not null references insumos(id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('entrada','saida','ajuste')),
  quantidade numeric(12,2) not null,   -- ajuste = novo saldo
  valor_unitario numeric(10,2),
  observacao text,
  criado_em timestamptz not null default now()
);

-- saldo do insumo sempre atualizado pelo banco
create or replace function atualiza_estoque_insumo() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.tipo = 'entrada' then
      update insumos set estoque = estoque + new.quantidade,
             preco = coalesce(nullif(new.valor_unitario,0), preco) where id = new.insumo_id;
    elsif new.tipo = 'saida' then
      update insumos set estoque = estoque - new.quantidade where id = new.insumo_id;
    else
      update insumos set estoque = new.quantidade where id = new.insumo_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.tipo = 'entrada' then
      update insumos set estoque = estoque - old.quantidade where id = old.insumo_id;
    elsif old.tipo = 'saida' then
      update insumos set estoque = estoque + old.quantidade where id = old.insumo_id;
    end if;
    return old;
  end if;
  return null;
end $$;
drop trigger if exists trg_estoque_insumo on insumo_movimentos;
create trigger trg_estoque_insumo after insert or delete on insumo_movimentos
  for each row execute function atualiza_estoque_insumo();

create table if not exists dietas (
  id serial primary key,
  lote_id int not null references lotes(id) on delete cascade,
  insumo_id int not null references insumos(id) on delete cascade,
  kg_cab_dia numeric(8,2) not null,
  unique (lote_id, insumo_id)
);

-- ---------- Qualidade / laticínio ----------
create table if not exists analises_leite (
  id serial primary key,
  mes date not null unique,           -- sempre dia 1 do mês
  volume numeric(10,0),
  preco_base numeric(6,4),
  bonificacao numeric(6,4) not null default 0,
  ccs int,
  cbt int,
  gordura numeric(4,2),
  proteina numeric(4,2),
  observacao text,
  criado_em timestamptz not null default now()
);

-- ---------- Financeiro ----------
create table if not exists lancamentos (
  id bigserial primary key,
  data date not null,
  tipo text not null check (tipo in ('receita','despesa')),
  categoria text not null,
  descricao text,
  valor numeric(12,2) not null,
  criado_em timestamptz not null default now()
);
create index if not exists lancamentos_data_idx on lancamentos(data);

-- ---------- RLS desabilitado (acesso controlado pelo login) ----------
alter table lotes disable row level security;
alter table touros disable row level security;
alter table animais disable row level security;
alter table eventos disable row level security;
alter table pesagens_leite disable row level security;
alter table producao_tanque disable row level security;
alter table temperaturas_tanque disable row level security;
alter table tratamentos disable row level security;
alter table manejos_sanitarios disable row level security;
alter table aplicacoes_sanitarias disable row level security;
alter table insumos disable row level security;
alter table insumo_movimentos disable row level security;
alter table dietas disable row level security;
alter table analises_leite disable row level security;
alter table lancamentos disable row level security;

-- ---------- Dados iniciais ----------
insert into lotes (nome, tipo, ordem) values
  ('Lote 1 · Alta produção','lactacao',1),
  ('Lote 2 · Média produção','lactacao',2),
  ('Lote 3 · Fim de lactação','lactacao',3),
  ('Pré-parto','pre_parto',4),
  ('Vacas secas','secas',5),
  ('Novilhas','novilhas',6),
  ('Bezerreiro','bezerras',7)
on conflict (nome) do nothing;

insert into manejos_sanitarios (nome, grupo, frequencia_dias) values
  ('Raiva','Todo o rebanho',365),
  ('Clostridioses (polivalente)','Todo o rebanho',180),
  ('Leptospirose','Vacas e novilhas',180),
  ('IBR / BVD','Vacas e novilhas',180),
  ('Exame de brucelose e tuberculose','Rebanho adulto',365),
  ('Vermifugação estratégica','Novilhas e bezerras',60),
  ('Controle de carrapato','Todo o rebanho',21)
on conflict (nome) do nothing;
