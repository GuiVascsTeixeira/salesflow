// Conexão com o MySQL, feita por um "pool".
//
// Pool = um grupo de conexões abertas e reaproveitadas. Abrir uma conexão
// nova a cada requisição é lento; no pool, cada requisição "pega emprestada"
// uma conexão pronta e devolve quando termina.
import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,

  // Acentos e emojis funcionam direito.
  charset: 'utf8mb4',

  // O banco guarda as datas em UTC (ver schema.sql). 'Z' diz ao mysql2 para
  // ler e gravar as datas como UTC, sem converter pelo fuso do seu computador.
  timezone: 'Z',

  waitForConnections: true, // se as 10 conexões estiverem em uso, espera na fila
  connectionLimit: 10,
  queueLimit: 0,
});

// Importante: o mysql2 devolve colunas DECIMAL (dinheiro) como TEXTO, por
// exemplo "10.06", e não como número. É proposital: evita erro de centavos.
// Nos cálculos usaremos centavos inteiros (decisão 5 do plano).
