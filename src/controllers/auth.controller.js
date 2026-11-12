
import {
  cadastrarEmpresa,
  autenticarUsuario,
} from '../services/auth.service.js';
import {
  sessionCookieName,
  sessionCookieOptions,
} from '../config/session.js';

// Recebe a requisição de cadastro.
export async function cadastrar(req, res, next) {
  try {
    const resultado = await cadastrarEmpresa(req.body);

    return res.status(201).json({
      mensagem: 'Empresa e usuário cadastrados com sucesso.',
      dados: resultado,
    });
  } catch (erro) {
    next(erro);
  }
}

// Recebe a requisição de login e cria a sessão.
export async function login(req, res, next) {
  try {
    const usuario = await autenticarUsuario(req.body);

    // Regenera a sessão para evitar session fixation.
    req.session.regenerate((erro) => {
      if (erro) return next(erro);

      req.session.usuario = usuario;

      req.session.save((erroAoSalvar) => {
        if (erroAoSalvar) return next(erroAoSalvar);

        return res.status(200).json({
          mensagem: 'Login realizado com sucesso.',
          usuario,
        });
      });
    });
  } catch (erro) {
    next(erro);
  }
}

// Encerra a sessão e remove o cookie do navegador.
export function logout(req, res, next) {
  req.session.destroy((erro) => {
    if (erro) return next(erro);

    res.clearCookie(sessionCookieName, sessionCookieOptions);

    return res.status(200).json({
      mensagem: 'Logout realizado com sucesso.',
    });
  });
}

// Informa se a sessão atual pertence a um usuário autenticado.
export function consultarSessao(req, res) {
  return res.status(200).json({
    autenticado: true,
    usuario: req.session.usuario,
  });
}
