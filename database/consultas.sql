-- =====================================================================
-- SalesFlow - Consultas SQL dos indicadores e conferências
-- =====================================================================
-- Rode DEPOIS de schema.sql e seed.sql. Cada consulta pode ser executada
-- sozinha (selecione e execute no MySQL Workbench) depois de rodar o
-- bloco 0 (parâmetros).
--
-- Na aplicação, os valores das variáveis @... virarão parâmetros "?" de
-- consultas parametrizadas (nunca concatene texto em SQL):
--     pool.execute('SELECT ... WHERE v.empresa_id = ? AND ...', [empresaId, ...])
--
-- REGRAS QUE TODA CONSULTA DE INDICADOR SEGUE
--   1. Filtra empresa_id        -> isolamento entre empresas
--   2. Filtra status='confirmada' -> venda cancelada não conta no faturamento
--   3. Usa custo_unitario do ITEM -> lucro com o custo da época da venda
--
-- SOBRE DATAS E FUSO HORÁRIO
--   O banco guarda datas em UTC. Fortaleza é UTC-3, então o dia local
--   01/10 começa em '2026-10-01 03:00:00' (UTC). Por isso o filtro usa
--   @inicio (inclusivo) e @fim (EXCLUSIVO, o início do dia seguinte):
--       data_venda >= @inicio AND data_venda < @fim
--   Para AGRUPAR por dia/mês local usamos DATE_SUB(data_venda, INTERVAL 3 HOUR).
--   (Filtrar a coluna "pelada", sem funções, permite usar o índice.)
-- =====================================================================

USE salesflow;

-- ---------------------------------------------------------------------
-- 0. PARÂMETROS (rode este bloco primeiro)
-- ---------------------------------------------------------------------
SET @empresa_id = 1;
SET @inicio     = '2026-10-01 03:00:00';   -- 01/10/2026 00:00 em Fortaleza
SET @fim        = '2026-11-01 03:00:00';   -- 01/11/2026 00:00 em Fortaleza (exclusivo)
SET @inicio_ant = '2026-09-01 03:00:00';   -- período anterior: 01/09 a 30/09
SET @produto_id = 3;                       -- Refrigerante cola 2L (teve reajuste de preço)
SET @cliente_id = 6;                       -- cliente com muitas compras
SET @venda_id   = 528;                     -- venda cancelada, com desconto


-- =====================================================================
-- A. INDICADORES DO DASHBOARD
-- =====================================================================

-- ---------------------------------------------------------------------
-- A1. Cartões do topo: faturamento, nº de vendas, ticket médio, lucro bruto
--   faturamento = soma do TOTAL das vendas (já com desconto)
--   lucro bruto = faturamento - custo das mercadorias vendidas
--   CUIDADO (erro clássico): se juntarmos vendas com itens e somarmos
--   v.total, cada venda é contada uma vez POR ITEM e o faturamento infla.
--   Por isso o custo é somado em uma consulta separada (CTE "custo").
-- ---------------------------------------------------------------------
WITH vendas_periodo AS (
    SELECT id, total
    FROM vendas
    WHERE empresa_id = @empresa_id
      AND status = 'confirmada'
      AND data_venda >= @inicio AND data_venda < @fim
),
custo AS (
    SELECT COALESCE(SUM(i.quantidade * i.custo_unitario), 0) AS custo_total
    FROM itens_venda i
    JOIN vendas_periodo vp ON vp.id = i.venda_id
)
SELECT COUNT(*)                                        AS qtd_vendas,
       COALESCE(SUM(vp.total), 0)                      AS faturamento,
       COALESCE(ROUND(AVG(vp.total), 2), 0)            AS ticket_medio,
       COALESCE(SUM(vp.total), 0) - (SELECT custo_total FROM custo) AS lucro_bruto
FROM vendas_periodo vp;

-- ---------------------------------------------------------------------
-- A2. Evolução do faturamento por DIA (gráfico de linha)
-- ---------------------------------------------------------------------
SELECT DATE(DATE_SUB(data_venda, INTERVAL 3 HOUR)) AS dia,
       COUNT(*)                                    AS qtd_vendas,
       SUM(total)                                  AS faturamento
FROM vendas
WHERE empresa_id = @empresa_id
  AND status = 'confirmada'
  AND data_venda >= @inicio AND data_venda < @fim
GROUP BY dia
ORDER BY dia;

-- ---------------------------------------------------------------------
-- A3. Evolução do faturamento por MÊS (use um @inicio mais antigo, ex.: 6 meses)
-- ---------------------------------------------------------------------
SELECT DATE_FORMAT(DATE_SUB(data_venda, INTERVAL 3 HOUR), '%Y-%m') AS mes,
       COUNT(*)                                                    AS qtd_vendas,
       SUM(total)                                                  AS faturamento
FROM vendas
WHERE empresa_id = @empresa_id
  AND status = 'confirmada'
  AND data_venda >= '2026-05-01 03:00:00' AND data_venda < @fim
GROUP BY mes
ORDER BY mes;

-- ---------------------------------------------------------------------
-- A4. Produtos mais vendidos (top 10 por quantidade)
--   receita_itens = soma dos subtotais dos itens, ANTES do desconto da venda
--   (o desconto é da venda toda, não de cada item).
-- ---------------------------------------------------------------------
SELECT p.id,
       p.nome,
       SUM(i.quantidade)                                      AS qtd_vendida,
       SUM(i.subtotal)                                        AS receita_itens,
       SUM(i.quantidade * (i.preco_unitario - i.custo_unitario)) AS lucro_itens
FROM itens_venda i
JOIN vendas   v ON v.id = i.venda_id
JOIN produtos p ON p.id = i.produto_id
WHERE v.empresa_id = @empresa_id
  AND v.status = 'confirmada'
  AND v.data_venda >= @inicio AND v.data_venda < @fim
GROUP BY p.id, p.nome
ORDER BY qtd_vendida DESC, p.nome
LIMIT 10;

-- ---------------------------------------------------------------------
-- A5. Vendas por categoria (gráfico de pizza/barras)
--   OVER () é uma "função de janela": calcula a participação de cada
--   categoria no total sem precisar de uma segunda consulta.
-- ---------------------------------------------------------------------
SELECT c.nome                                              AS categoria,
       SUM(i.quantidade)                                   AS qtd_vendida,
       SUM(i.subtotal)                                     AS receita_itens,
       ROUND(100 * SUM(i.subtotal) / SUM(SUM(i.subtotal)) OVER (), 1) AS percentual
FROM itens_venda i
JOIN vendas     v ON v.id = i.venda_id
JOIN produtos   p ON p.id = i.produto_id
JOIN categorias c ON c.id = p.categoria_id
WHERE v.empresa_id = @empresa_id
  AND v.status = 'confirmada'
  AND v.data_venda >= @inicio AND v.data_venda < @fim
GROUP BY c.id, c.nome
ORDER BY receita_itens DESC;

-- ---------------------------------------------------------------------
-- A6. Produtos com estoque baixo (alerta do dashboard)
--   Só produtos ativos; "baixo" = saldo menor ou igual ao mínimo.
--   Não depende de período: é a situação ATUAL.
-- ---------------------------------------------------------------------
SELECT p.sku,
       p.nome,
       c.nome                              AS categoria,
       p.estoque_atual,
       p.estoque_minimo,
       p.estoque_minimo - p.estoque_atual  AS faltam_para_o_minimo
FROM produtos p
JOIN categorias c ON c.id = p.categoria_id
WHERE p.empresa_id = @empresa_id
  AND p.ativo = 1
  AND p.estoque_atual <= p.estoque_minimo
ORDER BY p.estoque_atual - p.estoque_minimo, p.nome;

-- ---------------------------------------------------------------------
-- A7. Comparação com o período anterior (opcional / desejável)
--   Soma condicional: um único passe pela tabela calcula os dois períodos.
--   NULLIF evita divisão por zero quando o período anterior não teve vendas.
-- ---------------------------------------------------------------------
SELECT atual.qtd_vendas      AS vendas_atual,
       anterior.qtd_vendas   AS vendas_anterior,
       ROUND(100 * (atual.qtd_vendas - anterior.qtd_vendas) / NULLIF(anterior.qtd_vendas, 0), 1)   AS variacao_vendas_pct,
       atual.faturamento     AS faturamento_atual,
       anterior.faturamento  AS faturamento_anterior,
       ROUND(100 * (atual.faturamento - anterior.faturamento) / NULLIF(anterior.faturamento, 0), 1) AS variacao_faturamento_pct
FROM (
    SELECT COUNT(*) AS qtd_vendas, COALESCE(SUM(total), 0) AS faturamento
    FROM vendas
    WHERE empresa_id = @empresa_id AND status = 'confirmada'
      AND data_venda >= @inicio AND data_venda < @fim
) AS atual
CROSS JOIN (
    SELECT COUNT(*) AS qtd_vendas, COALESCE(SUM(total), 0) AS faturamento
    FROM vendas
    WHERE empresa_id = @empresa_id AND status = 'confirmada'
      AND data_venda >= @inicio_ant AND data_venda < @inicio
) AS anterior;

-- ---------------------------------------------------------------------
-- A8. Lucro bruto por categoria (base para o Power BI)
--   Aqui o lucro é calculado ANTES do desconto da venda (preço do item -
--   custo do item). Por isso a soma das categorias é um pouco maior que o
--   lucro bruto do cartão A1, que já desconta os descontos. A diferença
--   é exatamente o total de descontos concedidos no período.
-- ---------------------------------------------------------------------
SELECT c.nome AS categoria,
       SUM(i.subtotal)                                            AS receita_itens,
       SUM(i.quantidade * i.custo_unitario)                       AS custo,
       SUM(i.quantidade * (i.preco_unitario - i.custo_unitario))  AS lucro_antes_desconto
FROM itens_venda i
JOIN vendas     v ON v.id = i.venda_id
JOIN produtos   p ON p.id = i.produto_id
JOIN categorias c ON c.id = p.categoria_id
WHERE v.empresa_id = @empresa_id
  AND v.status = 'confirmada'
  AND v.data_venda >= @inicio AND v.data_venda < @fim
GROUP BY c.id, c.nome
ORDER BY lucro_antes_desconto DESC;

-- ---------------------------------------------------------------------
-- A9. Faturamento por forma de pagamento
-- ---------------------------------------------------------------------
SELECT pg.forma,
       COUNT(*)      AS qtd_vendas,
       SUM(pg.valor) AS valor
FROM pagamentos pg
JOIN vendas v ON v.id = pg.venda_id
WHERE v.empresa_id = @empresa_id
  AND v.status = 'confirmada'
  AND v.data_venda >= @inicio AND v.data_venda < @fim
GROUP BY pg.forma
ORDER BY valor DESC;


-- =====================================================================
-- B. TELAS DE PRODUTOS, CLIENTES E VENDAS
-- =====================================================================

-- ---------------------------------------------------------------------
-- B1. Histórico de movimentações de um produto (mais recente primeiro)
--   O filtro por empresa_id garante que ninguém veja produto de outra empresa.
-- ---------------------------------------------------------------------
SELECT DATE_SUB(m.criado_em, INTERVAL 3 HOUR) AS data_local,
       m.tipo,
       m.quantidade,
       m.saldo_apos,
       m.venda_id,
       u.nome AS usuario,
       m.justificativa
FROM movimentacoes_estoque m
JOIN usuarios u ON u.id = m.usuario_id
WHERE m.empresa_id = @empresa_id
  AND m.produto_id = @produto_id
ORDER BY m.criado_em DESC, m.id DESC
LIMIT 30;

-- ---------------------------------------------------------------------
-- B2. Preço praticado ao longo do tempo (prova da regra "preço do momento")
--   O produto tem UM preço atual, mas cada item guarda o preço que valia
--   na hora da venda. Compare com produtos.preco_venda.
-- ---------------------------------------------------------------------
SELECT DATE_FORMAT(DATE_SUB(v.data_venda, INTERVAL 3 HOUR), '%Y-%m') AS mes,
       MIN(i.preco_unitario) AS menor_preco_praticado,
       MAX(i.preco_unitario) AS maior_preco_praticado,
       MIN(i.custo_unitario) AS menor_custo,
       MAX(i.custo_unitario) AS maior_custo,
       SUM(i.quantidade)     AS qtd_vendida
FROM itens_venda i
JOIN vendas v ON v.id = i.venda_id
WHERE v.empresa_id = @empresa_id
  AND i.produto_id = @produto_id
  AND v.status = 'confirmada'
GROUP BY mes
ORDER BY mes;

SELECT id, nome, preco_venda AS preco_atual_no_cadastro, custo AS custo_atual_no_cadastro
FROM produtos
WHERE empresa_id = @empresa_id AND id = @produto_id;

-- ---------------------------------------------------------------------
-- B3. Total comprado por cliente (ranking)
--   A condição status='confirmada' fica no ON (e não no WHERE) de propósito:
--   assim clientes SEM compras confirmadas continuam aparecendo, com total 0.
--   Se fosse no WHERE, o LEFT JOIN viraria um JOIN comum e eles sumiriam.
-- ---------------------------------------------------------------------
SELECT c.id,
       c.nome,
       COUNT(v.id)                 AS qtd_compras,
       COALESCE(SUM(v.total), 0)   AS total_comprado,
       MAX(v.data_venda)           AS ultima_compra_utc
FROM clientes c
LEFT JOIN vendas v
       ON v.cliente_id = c.id
      AND v.empresa_id = c.empresa_id
      AND v.status = 'confirmada'
WHERE c.empresa_id = @empresa_id
GROUP BY c.id, c.nome
ORDER BY total_comprado DESC, c.nome
LIMIT 10;

-- ---------------------------------------------------------------------
-- B4. Histórico de compras de um cliente (inclui canceladas, com o status)
-- ---------------------------------------------------------------------
SELECT v.id               AS venda,
       DATE_SUB(v.data_venda, INTERVAL 3 HOUR) AS data_local,
       v.status,
       v.total,
       pg.forma           AS pagamento
FROM vendas v
JOIN pagamentos pg ON pg.venda_id = v.id
WHERE v.empresa_id = @empresa_id
  AND v.cliente_id = @cliente_id
ORDER BY v.data_venda DESC
LIMIT 20;

-- ---------------------------------------------------------------------
-- B5. Detalhe de uma venda: cabeçalho, itens e pagamento(s)
-- ---------------------------------------------------------------------
SELECT v.id, DATE_SUB(v.data_venda, INTERVAL 3 HOUR) AS data_local, v.status,
       COALESCE(c.nome, 'Consumidor final') AS cliente,
       u.nome AS vendedor,
       v.subtotal, v.desconto, v.total,
       v.cancelada_em, v.motivo_cancelamento
FROM vendas v
JOIN usuarios u ON u.id = v.usuario_id
LEFT JOIN clientes c ON c.id = v.cliente_id
WHERE v.empresa_id = @empresa_id AND v.id = @venda_id;

SELECT p.sku, p.nome, i.quantidade, i.preco_unitario, i.subtotal
FROM itens_venda i
JOIN vendas   v ON v.id = i.venda_id
JOIN produtos p ON p.id = i.produto_id
WHERE v.empresa_id = @empresa_id AND i.venda_id = @venda_id
ORDER BY i.id;

SELECT pg.forma, pg.valor
FROM pagamentos pg
JOIN vendas v ON v.id = pg.venda_id
WHERE v.empresa_id = @empresa_id AND pg.venda_id = @venda_id;


-- =====================================================================
-- C. CONFERÊNCIAS DE INTEGRIDADE
-- Todas devem retornar ZERO linhas. Se alguma retornar linhas, há uma
-- inconsistência nos dados (ou um bug no código que gravou os dados).
-- Vamos reutilizar estas consultas nos testes automatizados da etapa 10.
-- =====================================================================

-- C1. Saldo do produto diferente do saldo da última movimentação
SELECT p.id, p.nome, p.estoque_atual, ult.saldo_apos
FROM produtos p
JOIN movimentacoes_estoque ult ON ult.produto_id = p.id
WHERE ult.id = (SELECT MAX(m.id) FROM movimentacoes_estoque m WHERE m.produto_id = p.id)
  AND ult.saldo_apos <> p.estoque_atual;

-- C2. Saldo do produto diferente da soma de TODAS as movimentações
SELECT p.id, p.nome, p.estoque_atual,
       SUM(CASE WHEN m.tipo IN ('entrada','estorno_venda','ajuste_positivo')
                THEN m.quantidade ELSE -m.quantidade END) AS saldo_calculado
FROM produtos p
LEFT JOIN movimentacoes_estoque m ON m.produto_id = p.id
GROUP BY p.id, p.nome, p.estoque_atual
HAVING COALESCE(saldo_calculado, 0) <> p.estoque_atual;

-- C3. Subtotal da venda diferente da soma dos itens
SELECT v.id, v.subtotal, SUM(i.subtotal) AS soma_itens
FROM vendas v
JOIN itens_venda i ON i.venda_id = v.id
GROUP BY v.id, v.subtotal
HAVING v.subtotal <> soma_itens;

-- C4. Venda sem nenhum item
SELECT v.id
FROM vendas v
LEFT JOIN itens_venda i ON i.venda_id = v.id
WHERE i.id IS NULL;

-- C5. Soma dos pagamentos diferente do total da venda
SELECT v.id, v.total, COALESCE(SUM(pg.valor), 0) AS pago
FROM vendas v
LEFT JOIN pagamentos pg ON pg.venda_id = v.id
GROUP BY v.id, v.total
HAVING pago <> v.total;

-- C6. Item sem a saída de estoque correspondente (ou com quantidade diferente)
SELECT i.venda_id, i.produto_id, i.quantidade, COALESCE(SUM(m.quantidade), 0) AS saida_registrada
FROM itens_venda i
LEFT JOIN movimentacoes_estoque m
       ON m.venda_id = i.venda_id AND m.produto_id = i.produto_id AND m.tipo = 'saida_venda'
GROUP BY i.id, i.venda_id, i.produto_id, i.quantidade
HAVING saida_registrada <> i.quantidade;

-- C7. Venda cancelada sem estorno completo, ou venda confirmada com estorno
SELECT v.id AS venda_id, v.status, m.produto_id,
       SUM(CASE WHEN m.tipo = 'saida_venda'   THEN m.quantidade ELSE 0 END) AS saidas,
       SUM(CASE WHEN m.tipo = 'estorno_venda' THEN m.quantidade ELSE 0 END) AS estornos
FROM vendas v
JOIN movimentacoes_estoque m ON m.venda_id = v.id
GROUP BY v.id, v.status, m.produto_id
HAVING (v.status = 'cancelada'  AND saidas <> estornos)
    OR (v.status = 'confirmada' AND estornos <> 0);

-- C8. Desconto acima do limite da empresa (tolerância de 1 centavo de arredondamento)
SELECT v.id, v.subtotal, v.desconto, e.desconto_maximo
FROM vendas v
JOIN empresas e ON e.id = v.empresa_id
WHERE v.desconto > v.subtotal * e.desconto_maximo / 100 + 0.01;
