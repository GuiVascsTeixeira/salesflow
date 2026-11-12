

import { pool } from '../config/database.js';

// Cria a empresa e seu primeiro usuário dentro de uma transação.
export async function criarEmpresaEUsuario(dados) {
  const conexao = await pool.getConnection();

  try {
    await conexao.beginTransaction();

    const [empresa] = await conexao.execute(
      'INSERT INTO empresas (nome) VALUES (?)',
      [dados.empresaNome],
    );

    const [usuario] = await conexao.execute(
      `INSERT INTO usuarios (empresa_id, nome, email, senha_hash)
       VALUES (?, ?, ?, ?)`,
      [
        empresa.insertId,
        dados.nome,
        dados.email,
        dados.senhaHash,
      ],
    );

    await conexao.commit();

    return {
      empresaId: empresa.insertId,
      usuarioId: usuario.insertId,
    };
  } catch (erro) {
    await conexao.rollback();
    throw erro;
  } finally {
    conexao.release();
  }
}

// Busca um usuário pelo e-mail para realizar o login.
export async function buscarUsuarioPorEmail(email) {
  const [usuarios] = await pool.execute(
    `SELECT id, empresa_id, nome, email, senha_hash, ativo
     FROM usuarios
     WHERE email = ?
     LIMIT 1`,
    [email],
  );

  return usuarios[0] || null;
}
