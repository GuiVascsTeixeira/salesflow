// Ponto de entrada: confere o banco e liga o servidor.
// Para rodar:  npm run dev
import app from './app.js';
import { env } from './config/env.js';
import { pool } from './config/database.js';
import { consultarEstadoDoBanco } from './repositories/health.repository.js';

async function iniciar() {
  // 1) Testa o banco ANTES de aceitar visitas.
  try {
    const banco = await consultarEstadoDoBanco();
    console.log(`Banco conectado: ${banco.banco} (MySQL ${banco.versao})`);
  } catch (erro) {
    console.error('Não foi possível conectar ao MySQL.');
    console.error('Confira o arquivo .env (usuário, senha, nome do banco) e se o MySQL está rodando.');
    console.error(`Motivo: ${erro.code ?? 'ERRO'} - ${erro.message}`);
    process.exit(1);
  }

  // 2) Liga o servidor. No Express 5, esta função é chamada tanto quando o
  //    servidor liga quanto quando falha; no caso de falha ela recebe o erro.
  const servidor = app.listen(env.porta, (erro) => {
    if (erro) {
      if (erro.code === 'EADDRINUSE') {
        console.error(`A porta ${env.porta} já está em uso. Feche o outro programa ou mude PORT no .env.`);
      } else {
        console.error(erro);
      }
      process.exit(1);
    }
    console.log(`Servidor rodando em http://localhost:${env.porta}`);
  });

  // 3) Ctrl+C no terminal: fecha o servidor e as conexões do banco com educação.
  const encerrar = (sinal) => {
    console.log(`\n${sinal} recebido. Encerrando...`);
    servidor.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));
}

iniciar();
