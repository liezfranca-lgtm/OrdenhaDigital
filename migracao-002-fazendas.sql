-- ============================================================
-- OrdenhaDigital — migração 002: cadastro de fazendas
-- Troca o campo de texto animais.propriedade por animais.fazenda_id
-- ============================================================

create table if not exists fazendas (
  id serial primary key,
  nome text not null unique,
  proprietario text,
  municipio text,
  uf text,
  area_total numeric(10,2),          -- ha
  area_pastagem numeric(10,2),       -- ha
  inscricao_estadual text,
  car text,                          -- Cadastro Ambiental Rural
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table fazendas disable row level security;

alter table animais add column if not exists fazenda_id int references fazendas(id) on delete set null;
create index if not exists animais_fazenda_idx on animais(fazenda_id);

-- converte as propriedades digitadas em fazendas cadastradas
insert into fazendas (nome)
select distinct trim(propriedade) from animais where coalesce(trim(propriedade), '') <> ''
on conflict (nome) do nothing;

update animais a set fazenda_id = f.id
from fazendas f
where a.fazenda_id is null and trim(a.propriedade) = f.nome;

alter table animais drop column if exists propriedade;
