import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';

import { env } from './env.js';
import { pool } from './database.js';

// Conecta o armazenamento de sessões ao express-session.
const MySQLStore = MySQLStoreFactory(session);

// Reutiliza o pool de conexões que o projeto já possui.
export const sessionStore = new MySQLStore(
  {
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 8 * 60 * 60 * 1000,
  },
  pool,
);

// Opções compartilhadas pelo cookie da sessão.
export const sessionCookieName = 'salesflow.sid';
export const sessionCookieOptions = {
  httpOnly: true,
  secure: env.ambiente === 'production',
  sameSite: 'lax',
};

// Configura como as sessões funcionarão.
export const sessionMiddleware = session({
  name: sessionCookieName,
  secret: env.sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,

  cookie: {
    ...sessionCookieOptions,
    maxAge: 8 * 60 * 60 * 1000,
  },
});