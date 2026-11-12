// Consultas e transações de vendas. Toda consulta recebe empresaId e limita
// os dados à empresa da sessão.
import { pool } from '../config/database.js';
import { AppError } from '../utils/AppError.js';

const DATA_BR = "DATE_FORMAT(DATE_SUB(%CAMPO%, INTERVAL 3 HOUR), '%d/%m/%Y %H:%i')";
const formatarData = (campo) => DATA_BR.replace('%CAMPO%', campo);

export async function buscarDescontoMaximo(empresaId) {
  const [rows] = await pool.execute(
    'SELECT desconto_maximo FROM empresas WHERE id = ? LIMIT 1',
    [empresaId],
  );
  return Number(rows[0]?.desconto_maximo ?? 0);
}

export const VENDAS_POR_PAGINA = 20;

// Monta o WHERE comum à listagem e à contagem (mesmos filtros nas duas).
function montarFiltro(empresaId, filtros) {
  const condicoes = ['v.empresa_id = ?'];
  const parametros = [empresaId];

  if (filtros.busca) {
    // Busca pelo número da venda ou pelo nome do cliente.
    condicoes.push('(CAST(v.id AS CHAR) LIKE ? OR c.nome LIKE ?)');
    const termo = `%${filtros.busca}%`;
    parametros.push(termo, termo);
  }
  if (filtros.status === 'confirmadas') condicoes.push("v.status = 'confirmada'");
  if (filtros.status === 'canceladas') condicoes.push("v.status = 'cancelada'");
  return { condicoes, parametros };
}

// Total de vendas e faturamento (só confirmadas) de TODO o filtro, não só da página.
export async function resumirVendasDoFiltro(empresaId, filtros = {}) {
  const { condicoes, parametros } = montarFiltro(empresaId, filtros);
  const [[linha]] = await pool.execute(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN v.status = 'confirmada' THEN v.total END), 0) AS faturamento
     FROM vendas v
     LEFT JOIN clientes c ON c.id = v.cliente_id AND c.empresa_id = v.empresa_id
     WHERE ${condicoes.join(' AND ')}`,
    parametros,
  );
  return linha;
}

export async function listarVendasDoBanco(empresaId, filtros = {}) {
  const { condicoes, parametros } = montarFiltro(empresaId, filtros);
  const pagina = Number.isInteger(filtros.pagina) && filtros.pagina > 0 ? filtros.pagina : 1;
  const deslocamento = (pagina - 1) * VENDAS_POR_PAGINA;

  const [rows] = await pool.execute(
    `SELECT v.id, v.status, v.subtotal, v.desconto, v.total,
            ${formatarData('v.data_venda')} AS data_formatada,
            COALESCE(c.nome, 'Consumidor final') AS cliente_nome,
            u.nome AS vendedor_nome,
            (SELECT p.forma FROM pagamentos p WHERE p.venda_id = v.id ORDER BY p.id LIMIT 1) AS forma_pagamento
     FROM vendas v
     LEFT JOIN clientes c
       ON c.id = v.cliente_id AND c.empresa_id = v.empresa_id
     INNER JOIN usuarios u
       ON u.id = v.usuario_id AND u.empresa_id = v.empresa_id
     WHERE ${condicoes.join(' AND ')}
     ORDER BY v.data_venda DESC, v.id DESC
     LIMIT ${VENDAS_POR_PAGINA} OFFSET ${deslocamento}`,
    parametros,
  );
  return rows;
}

export async function buscarVendaDaEmpresa(empresaId, vendaId) {
  const [vendas] = await pool.execute(
    `SELECT v.id, v.status, v.subtotal, v.desconto, v.total, v.motivo_cancelamento,
            ${formatarData('v.data_venda')} AS data_formatada,
            ${formatarData('v.cancelada_em')} AS cancelada_em_formatada,
            COALESCE(c.nome, 'Consumidor final') AS cliente_nome,
            u.nome AS vendedor_nome,
            uc.nome AS cancelada_por_nome
     FROM vendas v
     LEFT JOIN clientes c
       ON c.id = v.cliente_id AND c.empresa_id = v.empresa_id
     INNER JOIN usuarios u
       ON u.id = v.usuario_id AND u.empresa_id = v.empresa_id
     LEFT JOIN usuarios uc
       ON uc.id = v.cancelada_por AND uc.empresa_id = v.empresa_id
     WHERE v.id = ? AND v.empresa_id = ?
     LIMIT 1`,
    [vendaId, empresaId],
  );
  if (!vendas.length) return null;

  const [itens] = await pool.execute(
    `SELECT i.produto_id, p.nome AS produto_nome, p.sku, i.quantidade,
            i.preco_unitario, i.subtotal
     FROM itens_venda i
     INNER JOIN produtos p
       ON p.id = i.produto_id AND p.empresa_id = ?
     WHERE i.venda_id = ?
     ORDER BY i.id`,
    [empresaId, vendaId],
  );

  const [pagamentos] = await pool.execute(
    'SELECT forma, valor FROM pagamentos WHERE venda_id = ? ORDER BY id',
    [vendaId],
  );

  return { ...vendas[0], itens, pagamentos };
}

export async function contarVendasPorStatus(empresaId) {
  const [rows] = await pool.execute(
    `SELECT COALESCE(SUM(status = 'confirmada'), 0) AS confirmadas,
            COALESCE(SUM(status = 'cancelada'), 0) AS canceladas
     FROM vendas
     WHERE empresa_id = ?`,
    [empresaId],
  );
  return {
    confirmadas: Number(rows[0].confirmadas),
    canceladas: Number(rows[0].canceladas),
  };
}

// Registra a venda inteira em UMA transação: se qualquer passo falhar, nada
// é gravado (rollback). `montarVenda` é a função do service que aplica as
// regras de negócio (preço, estoque, desconto) usando os dados já TRAVADOS
// aqui dentro, para ninguém alterar o estoque no meio da operação.
export async function registrarVendaNoBanco(empresaId, usuarioId, entrada, montarVenda) {
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();

    // 1) Produtos: trava as linhas (FOR UPDATE), sempre em ordem de id para
    //    duas vendas simultâneas não ficarem esperando uma à outra (deadlock).
    const idsProdutos = entrada.itens.map((item) => item.produtoId).sort((a, b) => a - b);
    const marcas = idsProdutos.map(() => '?').join(', ');
    const [produtos] = await conexao.execute(
      `SELECT id, nome, preco_venda, custo, estoque_atual, ativo
       FROM produtos
       WHERE empresa_id = ? AND id IN (${marcas})
       ORDER BY id
       FOR UPDATE`,
      [empresaId, ...idsProdutos],
    );

    // 2) Cliente (opcional): precisa existir, ser da empresa e estar ativo.
    let cliente = null;
    if (entrada.clienteId) {
      const [clientes] = await conexao.execute(
        'SELECT id FROM clientes WHERE id = ? AND empresa_id = ? AND ativo = 1',
        [entrada.clienteId, empresaId],
      );
      cliente = clientes[0] ?? null;
    }

    const [empresas] = await conexao.execute(
      'SELECT desconto_maximo FROM empresas WHERE id = ? LIMIT 1',
      [empresaId],
    );

    // 3) Regras de negócio (service): devolve itens, subtotal, desconto, total.
    const venda = montarVenda({
      produtos,
      cliente,
      descontoMaximo: Number(empresas[0]?.desconto_maximo ?? 0),
    });

    // 4) Cabeçalho, itens e pagamento.
    const [cabecalho] = await conexao.execute(
      `INSERT INTO vendas (empresa_id, cliente_id, usuario_id, status, subtotal, desconto, total)
       VALUES (?, ?, ?, 'confirmada', ?, ?, ?)`,
      [empresaId, entrada.clienteId ?? null, usuarioId, venda.subtotal, venda.desconto, venda.total],
    );
    const vendaId = cabecalho.insertId;

    for (const item of venda.itens) {
      await conexao.execute(
        `INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario, custo_unitario)
         VALUES (?, ?, ?, ?, ?)`,
        [vendaId, item.produtoId, item.quantidade, item.precoUnitario, item.custoUnitario],
      );

      // 5) Baixa de estoque + registro no livro-razão de movimentações.
      await conexao.execute(
        'UPDATE produtos SET estoque_atual = ? WHERE id = ? AND empresa_id = ?',
        [item.saldoApos, item.produtoId, empresaId],
      );
      await conexao.execute(
        `INSERT INTO movimentacoes_estoque
         (empresa_id, produto_id, venda_id, usuario_id, tipo, quantidade, saldo_apos, justificativa)
         VALUES (?, ?, ?, ?, 'saida_venda', ?, ?, ?)`,
        [
          empresaId, item.produtoId, vendaId, usuarioId,
          item.quantidade, item.saldoApos, `Venda #${vendaId}`,
        ],
      );
    }

    await conexao.execute(
      'INSERT INTO pagamentos (venda_id, forma, valor) VALUES (?, ?, ?)',
      [vendaId, entrada.forma, venda.total],
    );

    await conexao.commit();
    return vendaId;
  } catch (erro) {
    await conexao.rollback();
    throw erro;
  } finally {
    conexao.release();
  }
}

// Cancela a venda e devolve o estoque, tudo na mesma transação.
export async function cancelarVendaNoBanco(empresaId, usuarioId, vendaId, motivo) {
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();

    // Trava a venda: dois cancelamentos ao mesmo tempo não devolvem o estoque duas vezes.
    const [vendas] = await conexao.execute(
      'SELECT id, status FROM vendas WHERE id = ? AND empresa_id = ? FOR UPDATE',
      [vendaId, empresaId],
    );
    if (!vendas.length) throw new AppError(404, 'Venda não encontrada.', 'NAO_ENCONTRADO');
    if (vendas[0].status === 'cancelada') {
      throw new AppError(409, 'Esta venda já foi cancelada.', 'VENDA_CANCELADA');
    }

    const [itens] = await conexao.execute(
      'SELECT produto_id, quantidade FROM itens_venda WHERE venda_id = ? ORDER BY produto_id',
      [vendaId],
    );

    for (const item of itens) {
      const [produtos] = await conexao.execute(
        'SELECT estoque_atual FROM produtos WHERE id = ? AND empresa_id = ? FOR UPDATE',
        [item.produto_id, empresaId],
      );
      const novoSaldo = Number(produtos[0].estoque_atual) + Number(item.quantidade);

      await conexao.execute(
        'UPDATE produtos SET estoque_atual = ? WHERE id = ? AND empresa_id = ?',
        [novoSaldo, item.produto_id, empresaId],
      );
      await conexao.execute(
        `INSERT INTO movimentacoes_estoque
         (empresa_id, produto_id, venda_id, usuario_id, tipo, quantidade, saldo_apos, justificativa)
         VALUES (?, ?, ?, ?, 'estorno_venda', ?, ?, ?)`,
        [
          empresaId, item.produto_id, vendaId, usuarioId,
          item.quantidade, novoSaldo, `Cancelamento da venda #${vendaId}`,
        ],
      );
    }

    // Os três campos de cancelamento são gravados juntos (exigência do CHECK do banco).
    await conexao.execute(
      `UPDATE vendas
       SET status = 'cancelada', cancelada_em = UTC_TIMESTAMP(),
           cancelada_por = ?, motivo_cancelamento = ?
       WHERE id = ? AND empresa_id = ?`,
      [usuarioId, motivo, vendaId, empresaId],
    );

    await conexao.commit();
  } catch (erro) {
    await conexao.rollback();
    throw erro;
  } finally {
    conexao.release();
  }
}
