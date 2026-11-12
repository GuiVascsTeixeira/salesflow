// Consultas de clientes. Toda consulta recebe empresaId e limita os dados
// à empresa da sessão (isolamento multiempresa).
import { pool } from '../config/database.js';

export async function listarClientesDoBanco(empresaId, filtros = {}) {
  const condicoes = ['c.empresa_id = ?'];
  const parametros = [empresaId];

  if (filtros.busca) {
    condicoes.push('(c.nome LIKE ? OR c.email LIKE ? OR c.telefone LIKE ?)');
    const termo = `%${filtros.busca}%`;
    parametros.push(termo, termo, termo);
  }

  if (filtros.status === 'ativos') condicoes.push('c.ativo = 1');
  if (filtros.status === 'inativos') condicoes.push('c.ativo = 0');

  const [rows] = await pool.execute(
    `SELECT c.id, c.nome, c.email, c.telefone, c.ativo,
            DATE_FORMAT(DATE_SUB(c.criado_em, INTERVAL 3 HOUR), '%d/%m/%Y') AS criado_em_formatado
     FROM clientes c
     WHERE ${condicoes.join(' AND ')}
     ORDER BY c.ativo DESC, c.nome ASC`,
    parametros,
  );
  return rows;
}

export async function contarClientesDaEmpresa(empresaId) {
  const [rows] = await pool.execute(
    `SELECT COALESCE(SUM(ativo = 1), 0) AS ativos,
            COALESCE(SUM(ativo = 0), 0) AS inativos
     FROM clientes
     WHERE empresa_id = ?`,
    [empresaId],
  );
  return {
    ativos: Number(rows[0].ativos),
    inativos: Number(rows[0].inativos),
  };
}

export async function buscarClienteDaEmpresa(empresaId, clienteId) {
  const [rows] = await pool.execute(
    `SELECT id, nome, email, telefone, ativo
     FROM clientes
     WHERE id = ? AND empresa_id = ?
     LIMIT 1`,
    [clienteId, empresaId],
  );
  return rows[0] ?? null;
}

export async function inserirCliente(empresaId, dados) {
  const [resultado] = await pool.execute(
    'INSERT INTO clientes (empresa_id, nome, email, telefone) VALUES (?, ?, ?, ?)',
    [empresaId, dados.nome, dados.email, dados.telefone],
  );
  return resultado.insertId;
}

export async function atualizarClienteNoBanco(empresaId, clienteId, dados) {
  const [resultado] = await pool.execute(
    `UPDATE clientes
     SET nome = ?, email = ?, telefone = ?
     WHERE id = ? AND empresa_id = ?`,
    [dados.nome, dados.email, dados.telefone, clienteId, empresaId],
  );
  return resultado.affectedRows;
}

// Muda a situação (ativo = 1 ou 0). Só altera se o cliente ainda não estiver
// na situação pedida; assim o service sabe diferenciar "já estava assim"
// de "não existe".
export async function alterarSituacaoCliente(empresaId, clienteId, ativo) {
  const [resultado] = await pool.execute(
    'UPDATE clientes SET ativo = ? WHERE id = ? AND empresa_id = ? AND ativo <> ?',
    [ativo, clienteId, empresaId, ativo],
  );
  return resultado.affectedRows;
}
