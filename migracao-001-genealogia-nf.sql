-- ============================================================
-- OrdenhaDigital — migração 001
-- Registro, genealogia, sexo/machos, cobrição por monta, prêmios, pesos de desmama e nota fiscal
-- ============================================================

-- ---------- identificação e genealogia ----------
alter table animais add column if not exists sexo text not null default 'F';
alter table animais add column if not exists registro text;            -- nº de registro na associação da raça
alter table animais add column if not exists propriedade text;         -- fazenda / propriedade onde está
alter table animais add column if not exists procedencia text;         -- nascido na fazenda, comprado de...
alter table animais add column if not exists pai_registro text;
alter table animais add column if not exists mae_externa text;         -- mãe que não está no rebanho
alter table animais add column if not exists mae_registro text;
alter table animais add column if not exists avo_paterno text;
alter table animais add column if not exists avo_paterna text;
alter table animais add column if not exists avo_materno text;         -- usados quando a mãe não está no rebanho
alter table animais add column if not exists avo_materna text;
-- pesos da cria
alter table animais add column if not exists peso_nascimento numeric(6,1);
alter table animais add column if not exists peso_desmama numeric(6,1);
alter table animais add column if not exists peso_mae_desmama numeric(6,1);  -- peso da mãe quando esta cria desmamou

alter table animais drop constraint if exists animais_sexo_check;
alter table animais add constraint animais_sexo_check check (sexo in ('F','M'));
alter table animais drop constraint if exists animais_categoria_check;
alter table animais add constraint animais_categoria_check
  check (categoria in ('Bezerra','Novilha','Lactação','Seca','Bezerro','Novilho','Touro'));

-- ---------- cobrição: período da monta natural ----------
alter table eventos add column if not exists data_fim date;

-- ---------- prêmios ----------
create table if not exists premios (
  id bigserial primary key,
  animal_id bigint not null references animais(id) on delete cascade,
  data date not null,
  evento text not null,          -- exposição, torneio leiteiro...
  categoria text,
  colocacao text,                -- Campeã, Reservada, 1º lugar...
  observacao text,
  criado_em timestamptz not null default now()
);
alter table premios disable row level security;

-- ---------- nota fiscal nos lançamentos ----------
alter table lancamentos add column if not exists nf_numero text;
alter table lancamentos add column if not exists fornecedor text;   -- fornecedor (despesa) ou cliente (receita)
alter table lancamentos add column if not exists arquivo text;      -- caminho do PDF/foto no Storage

-- ---------- arquivo das notas (Supabase Storage, privado, só usuário logado) ----------
insert into storage.buckets (id, name, public) values ('notas-fiscais', 'notas-fiscais', false)
on conflict (id) do nothing;
drop policy if exists "notas fiscais - usuarios logados" on storage.objects;
create policy "notas fiscais - usuarios logados" on storage.objects
  for all to authenticated
  using (bucket_id = 'notas-fiscais')
  with check (bucket_id = 'notas-fiscais');
