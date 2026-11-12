// Monta o aplicativo Express: configurações, rotas e tratamento de erros.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import healthRoutes from './routes/health.routes.js';
import paginasRoutes from './routes/paginas.routes.js';
import authRoutes from './routes/auth.routes.js';
import produtosRoutes from './routes/produtos.routes.js';
import clientesRoutes from './routes/clientes.routes.js';
import vendasRoutes from './routes/vendas.routes.js';
import relatoriosRoutes from './routes/relatorios.routes.js';

import { sessionMiddleware } from './config/session.js';
import {
  cabecalhosSeguranca,
  protecaoCsrf,
  entregarTokenCsrf,
} from './middlewares/seguranca.middleware.js';
import {
  rotaNaoEncontrada,
  tratarErros,
} from './middlewares/erros.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
// Atrás de um proxy (Render, Railway, Nginx...) defina TRUST_PROXY=1 no .env
// para o limite de tentativas enxergar o IP real do visitante.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cabecalhosSeguranca);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
// Sem corpo JSON, o Express 5 deixa req.body indefinido: garantimos um objeto.
app.use((req, res, next) => { req.body ??= {}; next(); });
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/chart.js', express.static(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist')));
app.use(sessionMiddleware);

// Token CSRF (o front-end o busca e envia no cabeçalho X-CSRF-Token).
app.get('/api/csrf-token', entregarTokenCsrf);
app.use(protecaoCsrf);

app.use('/api', healthRoutes);
app.use('/api', authRoutes);
app.use('/api', produtosRoutes);
app.use('/api', clientesRoutes);
app.use('/api', vendasRoutes);
app.use('/api', relatoriosRoutes);
app.use('/', paginasRoutes);

app.use(rotaNaoEncontrada);
app.use(tratarErros);

export default app;
