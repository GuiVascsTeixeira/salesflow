import { Router } from 'express';
import { exigirAutenticacao } from '../middlewares/auth.middleware.js';
import {
  listarClientes,
  buscarCliente,
  criarCliente,
  atualizarCliente,
  desativarCliente,
  reativarCliente,
} from '../controllers/clientes.controller.js';

const router = Router();

// Todas as rotas deste módulo exigem uma sessão válida.
// O prefixo /api é definido no app.js.
router.use('/clientes', exigirAutenticacao);

router.get('/clientes', listarClientes);
router.post('/clientes', criarCliente);
router.get('/clientes/:id', buscarCliente);
router.put('/clientes/:id', atualizarCliente);
router.delete('/clientes/:id', desativarCliente);
router.post('/clientes/:id/reativar', reativarCliente);

export default router;
