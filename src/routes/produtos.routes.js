import { Router } from 'express';
import { exigirAutenticacao } from '../middlewares/auth.middleware.js';
import {
  listarCategorias,
  criarCategoria,
  atualizarCategoria,
  excluirCategoria,
  listarProdutos,
  buscarProduto,
  criarProduto,
  atualizarProduto,
  desativarProduto,
  movimentarEstoque,
  historicoEstoque,
} from '../controllers/produtos.controller.js';

const router = Router();

// Todas as rotas deste módulo exigem uma sessão válida.
router.use(exigirAutenticacao);

router.get('/categorias', listarCategorias);
router.post('/categorias', criarCategoria);
router.put('/categorias/:id', atualizarCategoria);
router.delete('/categorias/:id', excluirCategoria);

router.get('/produtos', listarProdutos);
router.post('/produtos', criarProduto);
router.get('/produtos/:id', buscarProduto);
router.put('/produtos/:id', atualizarProduto);
router.delete('/produtos/:id', desativarProduto);
router.post('/produtos/:id/movimentacoes', movimentarEstoque);
router.get('/produtos/:id/movimentacoes', historicoEstoque);

export default router;
