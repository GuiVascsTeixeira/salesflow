-- =====================================================================
-- SalesFlow - Views para o Power BI (somente LEITURA, não apaga nada)
-- =====================================================================
-- Rode UMA vez no banco "salesflow" (MySQL Workbench). Pode rodar de novo:
-- CREATE OR REPLACE apenas atualiza as views, sem tocar nos dados.
-- Datas já convertidas de UTC para Fortaleza (UTC-3).
-- Todas trazem empresa_id: no Power BI filtre pela empresa desejada.
-- =====================================================================
USE salesflow;

CREATE OR REPLACE VIEW vw_fato_vendas AS
SELECT v.id AS venda_id, v.empresa_id,
       DATE_SUB(v.data_venda, INTERVAL 3 HOUR) AS data_hora,
       DATE(DATE_SUB(v.data_venda, INTERVAL 3 HOUR)) AS data,
       v.cliente_id, v.usuario_id, v.status,
       v.subtotal, v.desconto, v.total,
       (SELECT pg.forma FROM pagamentos pg WHERE pg.venda_id = v.id ORDER BY pg.id LIMIT 1) AS forma_pagamento
FROM vendas v;

CREATE OR REPLACE VIEW vw_fato_itens AS
SELECT i.id AS item_id, v.empresa_id, v.id AS venda_id,
       DATE(DATE_SUB(v.data_venda, INTERVAL 3 HOUR)) AS data,
       v.status, i.produto_id, i.quantidade,
       i.preco_unitario, i.custo_unitario, i.subtotal AS receita,
       i.quantidade * i.custo_unitario AS custo_total,
       i.subtotal - i.quantidade * i.custo_unitario AS lucro_bruto
FROM itens_venda i
JOIN vendas v ON v.id = i.venda_id;

CREATE OR REPLACE VIEW vw_dim_produtos AS
SELECT p.id AS produto_id, p.empresa_id, p.nome AS produto, p.sku,
       c.nome AS categoria, p.preco_venda, p.custo,
       p.estoque_atual, p.estoque_minimo, p.ativo
FROM produtos p
JOIN categorias c ON c.id = p.categoria_id AND c.empresa_id = p.empresa_id;

CREATE OR REPLACE VIEW vw_dim_clientes AS
SELECT id AS cliente_id, empresa_id, nome AS cliente, ativo,
       DATE(DATE_SUB(criado_em, INTERVAL 3 HOUR)) AS cliente_desde
FROM clientes;

CREATE OR REPLACE VIEW vw_dim_vendedores AS
SELECT id AS usuario_id, empresa_id, nome AS vendedor FROM usuarios;

CREATE OR REPLACE VIEW vw_estoque_movimentos AS
SELECT m.id AS movimento_id, m.empresa_id, m.produto_id, m.tipo, m.quantidade,
       m.saldo_apos, DATE_SUB(m.criado_em, INTERVAL 3 HOUR) AS data_hora
FROM movimentacoes_estoque m;
