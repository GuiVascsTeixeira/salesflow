
import { AppError } from '../utils/AppError.js';

// Roda quando nenhuma rota atendeu ao pedido: vira um erro 404.
export function rotaNaoEncontrada(req, res, next) {
  next(new AppError(404, 'Rota não encontrada.', 'NAO_ENCONTRADO'));
}

// Todo erro do sistema cai aqui.
export function tratarErros(erro, req, res, next) {
  let status = 500;
  let codigo = 'ERRO_INTERNO';
  let mensagem = 'Erro interno do servidor.';

  if (erro instanceof AppError) {
    status = erro.status;
    codigo = erro.codigo;
    mensagem = erro.message;

  } else if (erro.type === 'entity.parse.failed') {
    status = 400;
    codigo = 'JSON_INVALIDO';
    mensagem = 'O corpo da requisição não é um JSON válido.';

  } else if (erro.code === 'EBADCSRFTOKEN') {
    status = 403;
    codigo = 'CSRF_INVALIDO';
    mensagem = 'Sessão de formulário inválida ou expirada. Recarregue a página e tente de novo.';

  } else if (Number.isInteger(erro.status) && erro.status >= 400 && erro.status < 500) {
    // Erro "esperado" lançado como Error comum com .status (400, 401, 404, 409...).
    const codigos = {
      400: 'DADOS_INVALIDOS',
      401: 'NAO_AUTENTICADO',
      403: 'PROIBIDO',
      404: 'NAO_ENCONTRADO',
      409: 'CONFLITO',
      429: 'MUITAS_REQUISICOES',
    };
    status = erro.status;
    codigo = codigos[erro.status] ?? 'ERRO';
    mensagem = erro.message;
  }

  // Erros inesperados são registrados no terminal.
  if (status >= 500) {
    console.error(erro);
  }

  return res.status(status).json({
    erro: {
      codigo,
      mensagem,
    },
  });
}
