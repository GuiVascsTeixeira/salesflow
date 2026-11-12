import { Router } from 'express';
import { exigirAutenticacao } from '../middlewares/auth.middleware.js';
import {
  listarVendas,
  buscarVenda,
  criarVenda,
  cancelarVenda,
} from '../controllers/vendas.controller.js';

const router = Router();

// Todas as rotas deste módulo exigem uma sessão válida.
// O prefixo /api é definido no app.js.
router.use('/vendas', exigirAutenticacao);

router.get('/vendas', listarVendas);
router.post('/vendas', criarVenda);
router.get('/vendas/:id', buscarVenda);
router.post('/vendas/:id/cancelar', cancelarVenda);

export default router;
