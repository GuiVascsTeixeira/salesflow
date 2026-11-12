// Consultas dos relatórios. Toda consulta filtra por empresa_id (da sessão)
// e considera só vendas CONFIRMADAS, exceto onde dito o contrário.
import { pool } from '../config/database.js';

// Datas do banco estão em UTC; Fortaleza é UTC-3.
const DIA_LOCAL = 'DATE(DATE_SUB(v.data_venda, INTERVAL 3 HOUR))';

export async function buscarRelatorio(empresaId, { inicioUtc, fimUtc }) {
  const periodo = [empresaId, inicioUtc, fimUtc];
  const noPeriodo = "v.empresa_id = ? AND v.status = 'confirmada' AND v.data_venda >= ? AND v.data_venda < ?";

  const [
    [resumoRows],
    [custoRows],
    [canceladasRows],
    [porDia],
    [porForma],
    [topProdutos],
    [porCategoria],
    [porVendedor],
    [estoqueCritico],
  ] = await Promise.all([
    pool.execute(
      `SELECT COUNT(*) AS vendas,
              COALESCE(SUM(v.total), 0) AS faturamento,
              COALESCE(SUM(v.desconto), 0) AS descontos
       FROM vendas v WHERE ${noPeriodo}`,
      periodo,
    ),
    pool.execute(
      `SELECT COALESCE(SUM(i.quantidade * i.custo_unitario), 0) AS custo,
              COALESCE(SUM(i.quantidade), 0) AS unidades
       FROM vendas v INNER JOIN itens_venda i ON i.venda_id = v.id
       WHERE ${noPeriodo}`,
      periodo,
    ),
    pool.execute(
      `SELECT COUNT(*) AS quantidade, COALESCE(SUM(v.total), 0) AS valor
       FROM vendas v
       WHERE v.empresa_id = ? AND v.status = 'cancelada' AND v.data_venda >= ? AND v.data_venda < ?`,
      periodo,
    ),
    pool.execute(
      `SELECT ${DIA_LOCAL} AS dia, COUNT(*) AS vendas, COALESCE(SUM(v.total), 0) AS faturamento
       FROM vendas v WHERE ${noPeriodo}
       GROUP BY ${DIA_LOCAL} ORDER BY dia`,
      periodo,
    ),
    pool.execute(
      `SELECT pg.forma, COUNT(*) AS vendas, COALESCE(SUM(pg.valor), 0) AS valor
       FROM vendas v INNER JOIN pagamentos pg ON pg.venda_id = v.id
       WHERE ${noPeriodo}
       GROUP BY pg.forma ORDER BY valor DESC`,
      periodo,
    ),
    pool.execute(
      `SELECT p.id, p.nome, SUM(i.quantidade) AS unidades,
              SUM(i.subtotal) AS faturamento,
              SUM(i.quantidade * (i.preco_unitario - i.custo_unitario)) AS lucro
       FROM vendas v
       INNER JOIN itens_venda i ON i.venda_id = v.id
       INNER JOIN produtos p ON p.id = i.produto_id AND p.empresa_id = v.empresa_id
       WHERE ${noPeriodo}
       GROUP BY p.id, p.nome ORDER BY faturamento DESC LIMIT 10`,
      periodo,
    ),
    pool.execute(
      `SELECT c.nome, SUM(i.quantidade) AS unidades, SUM(i.subtotal) AS faturamento
       FROM vendas v
       INNER JOIN itens_venda i ON i.venda_id = v.id
       INNER JOIN produtos p ON p.id = i.produto_id AND p.empresa_id = v.empresa_id
       INNER JOIN categorias c ON c.id = p.categoria_id AND c.empresa_id = p.empresa_id
       WHERE ${noPeriodo}
       GROUP BY c.id, c.nome ORDER BY faturamento DESC`,
      periodo,
    ),
    pool.execute(
      `SELECT u.nome, COUNT(*) AS vendas, COALESCE(SUM(v.total), 0) AS faturamento
       FROM vendas v INNER JOIN usuarios u ON u.id = v.usuario_id AND u.empresa_id = v.empresa_id
       WHERE ${noPeriodo}
       GROUP BY u.id, u.nome ORDER BY faturamento DESC`,
      periodo,
    ),
    // Estoque crítico não depende do período: é a situação de hoje.
    pool.execute(
      `SELECT id, nome, sku, estoque_atual, estoque_minimo
       FROM produtos
       WHERE empresa_id = ? AND ativo = 1 AND estoque_atual <= estoque_minimo
       ORDER BY (estoque_atual - estoque_minimo), nome LIMIT 20`,
      [empresaId],
    ),
  ]);

  return {
    resumo: resumoRows[0],
    custo: custoRows[0],
    canceladas: canceladasRows[0],
    porDia,
    porForma,
    topProdutos,
    porCategoria,
    porVendedor,
    estoqueCritico,
  };
}

// Linhas da exportação CSV (limitadas para não estourar a memória).
export async function listarVendasParaCsv(empresaId, { inicioUtc, fimUtc }) {
  const [rows] = await pool.execute(
    `SELECT v.id,
            DATE_FORMAT(DATE_SUB(v.data_venda, INTERVAL 3 HOUR), '%d/%m/%Y %H:%i') AS data,
            COALESCE(c.nome, 'Consumidor final') AS cliente,
            u.nome AS vendedor, v.status,
            (SELECT pg.forma FROM pagamentos pg WHERE pg.venda_id = v.id ORDER BY pg.id LIMIT 1) AS forma,
            v.subtotal, v.desconto, v.total
     FROM vendas v
     LEFT JOIN clientes c ON c.id = v.cliente_id AND c.empresa_id = v.empresa_id
     INNER JOIN usuarios u ON u.id = v.usuario_id AND u.empresa_id = v.empresa_id
     WHERE v.empresa_id = ? AND v.data_venda >= ? AND v.data_venda < ?
     ORDER BY v.data_venda, v.id
     LIMIT 50000`,
    [empresaId, inicioUtc, fimUtc],
  );
  return rows;
}
