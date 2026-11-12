
// Lê o arquivo .env e entrega as configurações já organizadas.
import 'dotenv/config';

const obrigatorias = [
  'DB_HOST',
  'DB_USER',
  'DB_NAME',
  'SESSION_SECRET',
];

const faltando = obrigatorias.filter((nome) => !process.env[nome]);

if (faltando.length > 0) {
  throw new Error(
    `Faltam variáveis no arquivo .env: ${faltando.join(', ')}. ` +
      'Copie o .env.example para .env e preencha.',
  );
}

export const env = {
  porta: Number(process.env.PORT) || 3000,
  ambiente: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET,
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
  },
};
