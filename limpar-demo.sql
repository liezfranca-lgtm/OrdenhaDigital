-- ============================================================
-- OrdenhaDigital — apaga os dados de demonstração (rebanho fictício)
-- Mantém só o cadastro inicial: lotes e calendário sanitário.
-- ATENÇÃO: apaga TUDO que foi lançado. Rodar só antes de o cliente começar a usar.
-- Uso: python runsql.py limpar-demo.sql
-- ============================================================
delete from lancamentos;
delete from analises_leite;
delete from temperaturas_tanque;
delete from producao_tanque;
delete from aplicacoes_sanitarias;
delete from dietas;
delete from insumo_movimentos;
delete from insumos;
update animais set mae_id = null;
delete from animais;          -- apaga junto eventos, pesagens e tratamentos
delete from touros;
