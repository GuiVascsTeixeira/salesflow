// Route = liga um endereço (URL) a uma função do controller.
import { Router } from 'express';
import { verificarSaude } from '../controllers/health.controller.js';

const router = Router();

// GET /api/health (o prefixo /api é definido no app.js)
router.get('/health', verificarSaude);

export default router;
