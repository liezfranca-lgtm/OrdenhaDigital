-- ============================================================
-- OrdenhaDigital — migração 003: histórico de peso dos animais
-- ============================================================

create table if not exists pesagens_corporais (
  id bigserial primary key,
  animal_id bigint not null references animais(id) on delete cascade,
  data date not null,
  peso numeric(6,1) not null,
  observacao text,
  criado_em timestamptz not null default now(),
  unique (animal_id, data)
);
create index if not exists pesagens_corporais_animal_idx on pesagens_corporais(animal_id, data);
alter table pesagens_corporais disable row level security;

-- traz o que já existia: pesagens registradas como evento ("123,5 kg ..."), peso ao nascer e peso na desmama
insert into pesagens_corporais (animal_id, data, peso, observacao)
select animal_id, data,
       replace(replace(substring(detalhe from '^([0-9.,]+) kg'), '.', ''), ',', '.')::numeric,
       nullif(trim(substring(detalhe from '^[0-9.,]+ kg(.*)$')), '')
from eventos
where tipo = 'Pesagem corporal' and detalhe ~ '^[0-9.,]+ kg'
on conflict (animal_id, data) do nothing;

insert into pesagens_corporais (animal_id, data, peso, observacao)
select id, data_nascimento, peso_nascimento, 'Ao nascer' from animais
where peso_nascimento is not null and data_nascimento is not null
on conflict (animal_id, data) do nothing;

insert into pesagens_corporais (animal_id, data, peso, observacao)
select id, data_desmama, peso_desmama, 'Desmama' from animais
where peso_desmama is not null and data_desmama is not null
on conflict (animal_id, data) do nothing;
