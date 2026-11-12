// Controller = recebe o pedido (req) e devolve a resposta (res).
import { consultarEstadoDoBanco } from '../repositories/health.repository.js';

export async function verificarSaude(req, res) {
  try {
    const banco = await consultarEstadoDoBanco();
    res.json({
      status: 'ok',
      banco: { conectado: true, nome: banco.banco, versao: banco.versao },
      horario_utc: banco.agora_utc,
    });
  } catch (erro) {
    console.error('Falha ao consultar o banco:', erro.message);
    // 503 = "serviço indisponível": o servidor está de pé, mas sem banco.
    res.status(503).json({
      status: 'erro',
      banco: { conectado: false },
    });
  }
}
