// Consultas de categorias, produtos e movimentações. Toda consulta de negócio
// recebe empresaId e limita os dados à empresa da sessão.
import { pool } from '../config/database.js';

export async function buscarNomeEmpresa(empresaId) {
  const [rows] = await pool.execute(
    'SELECT nome FROM empresas WHERE id = ? LIMIT 1',
    [empresaId],
  );
  return rows[0]?.nome ?? 'Sua empresa';
}

export async function listarCategoriasDoBanco(empresaId) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.nome,
            (SELECT COUNT(*) FROM produtos p
             WHERE p.empresa_id = c.empresa_id AND p.categoria_id = c.id) AS total_produtos
     FROM categorias c
     WHERE c.empresa_id = ?
     ORDER BY c.nome ASC`,
    [empresaId],
  );
  return rows;
}

export async function inserirCategoria(empresaId, nome) {
  const [resultado] = await pool.execute(
    'INSERT INTO categorias (empresa_id, nome) VALUES (?, ?)',
    [empresaId, nome],
  );
  return resultado.insertId;
}

export async function atualizarCategoriaNoBanco(empresaId, id, nome) {
  const [resultado] = await pool.execute(
    'UPDATE categorias SET nome = ? WHERE id = ? AND empresa_id = ?',
    [nome, id, empresaId],
  );
  return resultado.affectedRows;
}

export async function contarProdutosDaCategoria(empresaId, categoriaId) {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM produtos WHERE empresa_id = ? AND categoria_id = ?',
    [empresaId, categoriaId],
  );
  return Number(rows[0].total);
}

export async function removerCategoria(empresaId, id) {
  const [resultado] = await pool.execute(
    'DELETE FROM categorias WHERE id = ? AND empresa_id = ?',
    [id, empresaId],
  );
  return resultado.affectedRows;
}

export async function listarProdutosDoBanco(empresaId, filtros = {}) {
  const condicoes = ['p.empresa_id = ?'];
  const parametros = [empresaId];

  if (filtros.busca) {
    condicoes.push('(p.nome LIKE ? OR p.sku LIKE ?)');
    const termo = `%${filtros.busca}%`;
    parametros.push(termo, termo);
  }

  if (filtros.status === 'ativos') condicoes.push('p.ativo = 1');
  if (filtros.status === 'inativos') condicoes.push('p.ativo = 0');

  const [rows] = await pool.execute(
    `SELECT p.id, p.nome, p.descricao, p.sku, p.preco_venda, p.custo,
            p.estoque_atual, p.estoque_minimo, p.ativo, p.categoria_id,
            c.nome AS categoria_nome
     FROM produtos p
     INNER JOIN categorias c
       ON c.id = p.categoria_id AND c.empresa_id = p.empresa_id
     WHERE ${condicoes.join(' AND ')}
     ORDER BY p.ativo DESC, p.nome ASC`,
    parametros,
  );
  return rows;
}

export async function buscarProdutoDaEmpresa(empresaId, produtoId) {
  const [rows] = await pool.execute(
    `SELECT p.id, p.nome, p.descricao, p.sku, p.preco_venda, p.custo,
            p.estoque_atual, p.estoque_minimo, p.ativo, p.categoria_id,
            c.nome AS categoria_nome
     FROM produtos p
     INNER JOIN categorias c
       ON c.id = p.categoria_id AND c.empresa_id = p.empresa_id
     WHERE p.id = ? AND p.empresa_id = ?
     LIMIT 1`,
    [produtoId, empresaId],
  );
  return rows[0] ?? null;
}

export async function inserirProdutoComEstoque(dados) {
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();

    const [categorias] = await conexao.execute(
      'SELECT id FROM categorias WHERE id = ? AND empresa_id = ? FOR UPDATE',
      [dados.categoriaId, dados.empresaId],
    );
    if (!categorias.length) {
      const erro = new Error('Selecione uma categoria válida da sua empresa.');
      erro.status = 400;
      throw erro;
    }

    const [produto] = await conexao.execute(
      `INSERT INTO produtos
       (empresa_id, categoria_id, nome, descricao, sku, preco_venda, custo,
        estoque_atual, estoque_minimo, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 1)`,
      [
        dados.empresaId, dados.categoriaId, dados.nome, dados.descricao,
        dados.sku, dados.precoVenda, dados.custo, dados.estoqueMinimo,
      ],
    );

    if (dados.estoqueInicial > 0) {
      await conexao.execute(
        'UPDATE produtos SET estoque_atual = ? WHERE id = ? AND empresa_id = ?',
        [dados.estoqueInicial, produto.insertId, dados.empresaId],
      );
      await conexao.execute(
        `INSERT INTO movimentacoes_estoque
         (empresa_id, produto_id, usuario_id, tipo, quantidade, saldo_apos, justificativa)
         VALUES (?, ?, ?, 'entrada', ?, ?, 'Estoque inicial do cadastro')`,
        [
          dados.empresaId, produto.insertId, dados.usuarioId,
          dados.estoqueInicial, dados.estoqueInicial,
        ],
      );
    }

    await conexao.commit();
    return produto.insertId;
  } catch (erro) {
    await conexao.rollback();
    throw erro;
  } finally {
    conexao.release();
  }
}

export async function atualizarProdutoNoBanco(empresaId, produtoId, dados) {
  const [categorias] = await pool.execute(
    'SELECT id FROM categorias WHERE id = ? AND empresa_id = ? LIMIT 1',
    [dados.categoriaId, empresaId],
  );
  if (!categorias.length) {
    const erro = new Error('Selecione uma categoria válida da sua empresa.');
    erro.status = 400;
    throw erro;
  }

  const [resultado] = await pool.execute(
    `UPDATE produtos
     SET categoria_id = ?, nome = ?, descricao = ?, sku = ?,
         preco_venda = ?, custo = ?, estoque_minimo = ?
     WHERE id = ? AND empresa_id = ?`,
    [
      dados.categoriaId, dados.nome, dados.descricao, dados.sku,
      dados.precoVenda, dados.custo, dados.estoqueMinimo,
      produtoId, empresaId,
    ],
  );
  return resultado.affectedRows;
}

export async function desativarProdutoNoBanco(empresaId, produtoId) {
  const [resultado] = await pool.execute(
    'UPDATE produtos SET ativo = 0 WHERE id = ? AND empresa_id = ? AND ativo = 1',
    [produtoId, empresaId],
  );
  return resultado.affectedRows;
}

export async function registrarMovimentacao(empresaId, produtoId, usuarioId, dados) {
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();

    const [rows] = await conexao.execute(
      `SELECT id, estoque_atual
       FROM produtos
       WHERE id = ? AND empresa_id = ? AND ativo = 1
       FOR UPDATE`,
      [produtoId, empresaId],
    );

    if (!rows.length) {
      const erro = new Error('Produto não encontrado ou inativo.');
      erro.status = 404;
      throw erro;
    }

    const saldoAtual = Number(rows[0].estoque_atual);
    const entrada = dados.tipo === 'entrada' || dados.tipo === 'ajuste_positivo';
    const novoSaldo = entrada
      ? saldoAtual + dados.quantidade
      : saldoAtual - dados.quantidade;

    if (novoSaldo < 0) {
      const erro = new Error(`Estoque insuficiente. Saldo atual: ${saldoAtual}.`);
      erro.status = 409;
      throw erro;
    }

    await conexao.execute(
      'UPDATE produtos SET estoque_atual = ? WHERE id = ? AND empresa_id = ?',
      [novoSaldo, produtoId, empresaId],
    );

    await conexao.execute(
      `INSERT INTO movimentacoes_estoque
       (empresa_id, produto_id, usuario_id, tipo, quantidade, saldo_apos, justificativa)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        empresaId, produtoId, usuarioId, dados.tipo,
        dados.quantidade, novoSaldo, dados.justificativa,
      ],
    );

    await conexao.commit();
    return { saldoAnterior: saldoAtual, saldoAtual: novoSaldo };
  } catch (erro) {
    await conexao.rollback();
    throw erro;
  } finally {
    conexao.release();
  }
}

export async function listarHistoricoEstoque(empresaId, produtoId) {
  const [rows] = await pool.execute(
    `SELECT m.id, m.tipo, m.quantidade, m.saldo_apos, m.justificativa,
            DATE_FORMAT(DATE_SUB(m.criado_em, INTERVAL 3 HOUR), '%d/%m/%Y %H:%i') AS data_formatada,
            u.nome AS usuario_nome
     FROM movimentacoes_estoque m
     INNER JOIN produtos p
       ON p.id = m.produto_id AND p.empresa_id = m.empresa_id
     INNER JOIN usuarios u
       ON u.id = m.usuario_id AND u.empresa_id = m.empresa_id
     WHERE m.empresa_id = ? AND m.produto_id = ?
     ORDER BY m.criado_em DESC, m.id DESC
     LIMIT 100`,
    [empresaId, produtoId],
  );
  return rows;
}
