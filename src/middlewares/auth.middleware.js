import { AppError } from '../utils/AppError.js';

// Protege rotas que exigem um usuário autenticado.
export function exigirAutenticacao(req, res, next) {
  if (!req.session.usuario) {
    return next(
      new AppError(
        401,
        'Você precisa estar autenticado para acessar este recurso.',
        'NAO_AUTENTICADO',
      ),
    );
  }

  return next();
}
