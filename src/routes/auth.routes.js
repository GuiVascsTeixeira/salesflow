import { Router } from 'express';

import {
  cadastrar,
  login,
  logout,
  consultarSessao,
} from '../controllers/auth.controller.js';
import { limiteLogin, limiteCadastro } from '../middlewares/seguranca.middleware.js';
import { exigirAutenticacao } from '../middlewares/auth.middleware.js';

const router = Router();

// Cadastro e login são acessíveis sem autenticação.
router.post('/auth/cadastro', limiteCadastro, cadastrar);
router.post('/auth/login', limiteLogin, login);

// Logout e consulta da sessão exigem usuário autenticado.
router.post('/auth/logout', exigirAutenticacao, logout);
router.get('/auth/me', exigirAutenticacao, consultarSessao);

export default router;
