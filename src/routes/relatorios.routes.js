import { Router } from 'express';
import { exigirAutenticacao } from '../middlewares/auth.middleware.js';
import { resumoRelatorios, exportarVendasCsv } from '../controllers/relatorios.controller.js';

const router = Router();

// O prefixo /api é definido no app.js.
router.use('/relatorios', exigirAutenticacao);
router.get('/relatorios/resumo', resumoRelatorios);
router.get('/relatorios/vendas.csv', exportarVendasCsv);

export default router;
