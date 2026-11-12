// Segurança da aplicação: cabeçalhos HTTP (helmet), proteção contra CSRF
// e limite de tentativas nas rotas de autenticação.
import helmet from 'helmet';
import { csrfSync } from 'csrf-sync';
import { rateLimit } from 'express-rate-limit';

// Cabeçalhos de segurança. A CSP só permite scripts/estilos do próprio site
// (fontes locais). Por isso não há <script> inline nas páginas.
export const cabecalhosSeguranca = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'font-src': ["'self'"],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      // Em http://localhost não podemos forçar https.
      'upgrade-insecure-requests': null,
    },
  },
});

// CSRF: um token fica guardado na sessão e o navegador precisa devolvê-lo no
// cabeçalho X-CSRF-Token em toda requisição que altera dados (POST/PUT/DELETE).
// Um site malicioso consegue disparar a requisição, mas não consegue ler o token.
const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

export const protecaoCsrf = csrfSynchronisedProtection;

export function entregarTokenCsrf(req, res) {
  return res.json({ token: generateToken(req) });
}

// Limite de tentativas: só contam as respostas com erro (senha errada etc.).
function limitador(janelaMinutos, maximo, mensagem) {
  return rateLimit({
    windowMs: janelaMinutos * 60 * 1000,
    limit: maximo,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => res.status(429).json({
      erro: { codigo: 'MUITAS_REQUISICOES', mensagem },
    }),
  });
}

export const limiteLogin = limitador(
  15, 10, 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
);
export const limiteCadastro = limitador(
  60, 20, 'Muitas tentativas de cadastro. Aguarde um pouco e tente novamente.',
);
