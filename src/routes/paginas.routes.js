// Rotas das páginas renderizadas pelo EJS.
import { Router } from 'express';
import { mostrarDashboard } from '../controllers/dashboard.controller.js';
import {
  mostrarPaginaProdutos,
  mostrarPaginaCategorias,
} from '../controllers/produtos.controller.js';
import { mostrarPaginaClientes } from '../controllers/clientes.controller.js';
import { mostrarPaginaVendas } from '../controllers/vendas.controller.js';
import { mostrarPaginaRelatorios } from '../controllers/relatorios.controller.js';

const router = Router();

function exigirSessaoPagina(req, res, next) {
  if (!req.session.usuario) return res.redirect('/');
  return next();
}

router.get('/', (req, res) => {
  if (req.session.usuario) return res.redirect('/dashboard');
  return res.render('index', { titulo: 'Entrar | SalesFlow' });
});

router.get('/cadastro', (req, res) => {
  if (req.session.usuario) return res.redirect('/dashboard');
  return res.render('cadastro', { titulo: 'Criar conta | SalesFlow' });
});

router.get('/dashboard', exigirSessaoPagina, mostrarDashboard);
router.get('/produtos', exigirSessaoPagina, mostrarPaginaProdutos);
router.get('/categorias', exigirSessaoPagina, mostrarPaginaCategorias);
router.get('/clientes', exigirSessaoPagina, mostrarPaginaClientes);
router.get('/vendas', exigirSessaoPagina, mostrarPaginaVendas);
router.get('/relatorios', exigirSessaoPagina, mostrarPaginaRelatorios);

export default router;
