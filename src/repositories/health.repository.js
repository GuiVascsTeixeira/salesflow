// Repository = o único lugar que conversa com o banco (só SQL, sem regra de negócio).
import { pool } from '../config/database.js';

// Pergunta ao MySQL qual é a versão, qual banco está em uso e que horas são (UTC).
export async function consultarEstadoDoBanco() {
  const [linhas] = await pool.query(
    'SELECT VERSION() AS versao, DATABASE() AS banco, UTC_TIMESTAMP() AS agora_utc',
  );
  return linhas[0];
}
