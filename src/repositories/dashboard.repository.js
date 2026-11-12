// Repository do dashboard: concentra as consultas SQL e sempre filtra pela empresa.
import { pool } from '../config/database.js';

export async function buscarDadosDashboard(empresaId, periodos) {
  const {
    inicioMesUtc,
    proximoMesUtc,
    inicioSeteDiasUtc,
    inicioAmanhaUtc,
  } = periodos;

  const [
    [resumoRows],
    [vendasPorDia],
    [produtosMaisVendidos],
    [vendasRecentes],
    [empresaRows],
  ] = await Promise.all([
    pool.execute(
      `SELECT
        (SELECT COALESCE(SUM(v.total), 0)
         FROM vendas v
         WHERE v.empresa_id = ?
           AND v.status = 'confirmada'
           AND v.data_venda >= ?
           AND v.data_venda < ?) AS faturamento_mes,
        (SELECT COUNT(*)
         FROM vendas v
         WHERE v.empresa_id = ?
           AND v.status = 'confirmada'
           AND v.data_venda >= ?
           AND v.data_venda < ?) AS vendas_mes,
        (SELECT COUNT(*)
         FROM produtos p
         WHERE p.empresa_id = ? AND p.ativo = 1) AS produtos_ativos,
        (SELECT COUNT(*)
         FROM produtos p
         WHERE p.empresa_id = ?
           AND p.ativo = 1
           AND p.estoque_atual <= p.estoque_minimo) AS estoque_baixo,
        (SELECT COUNT(*)
         FROM clientes c
         WHERE c.empresa_id = ? AND c.ativo = 1) AS clientes_ativos`,
      [
        empresaId, inicioMesUtc, proximoMesUtc,
        empresaId, inicioMesUtc, proximoMesUtc,
        empresaId,
        empresaId,
        empresaId,
      ],
    ),
    pool.execute(
      `SELECT
        DATE(DATE_SUB(v.data_venda, INTERVAL 3 HOUR)) AS dia,
        COUNT(*) AS quantidade,
        COALESCE(SUM(v.total), 0) AS faturamento
       FROM vendas v
       WHERE v.empresa_id = ?
         AND v.status = 'confirmada'
         AND v.data_venda >= ?
         AND v.data_venda < ?
       GROUP BY DATE(DATE_SUB(v.data_venda, INTERVAL 3 HOUR))
       ORDER BY dia ASC`,
      [empresaId, inicioSeteDiasUtc, inicioAmanhaUtc],
    ),
    pool.execute(
      `SELECT
        p.id,
        p.nome,
        SUM(iv.quantidade) AS unidades,
        COALESCE(SUM(iv.subtotal), 0) AS faturamento
       FROM vendas v
       INNER JOIN itens_venda iv ON iv.venda_id = v.id
       INNER JOIN produtos p
         ON p.id = iv.produto_id
        AND p.empresa_id = v.empresa_id
       WHERE v.empresa_id = ?
         AND v.status = 'confirmada'
         AND v.data_venda >= ?
         AND v.data_venda < ?
       GROUP BY p.id, p.nome
       ORDER BY unidades DESC, faturamento DESC
       LIMIT 5`,
      [empresaId, inicioMesUtc, proximoMesUtc],
    ),
    pool.execute(
      `SELECT
        v.id,
        DATE_FORMAT(DATE_SUB(v.data_venda, INTERVAL 3 HOUR), '%d/%m/%Y %H:%i') AS data_formatada,
        v.total,
        v.status,
        COALESCE(c.nome, 'Consumidor final') AS cliente
       FROM vendas v
       LEFT JOIN clientes c
         ON c.id = v.cliente_id
        AND c.empresa_id = v.empresa_id
       WHERE v.empresa_id = ?
       ORDER BY v.data_venda DESC, v.id DESC
       LIMIT 6`,
      [empresaId],
    ),
    pool.execute(
      'SELECT nome FROM empresas WHERE id = ? LIMIT 1',
      [empresaId],
    ),
  ]);

  return {
    resumo: resumoRows[0] ?? {},
    vendasPorDia,
    produtosMaisVendidos,
    vendasRecentes,
    empresaNome: empresaRows[0]?.nome ?? null,
  };
}
