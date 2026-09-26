// backend/presentation/http/app.ts
import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import { env } from '../../config/env';
import { authRouter } from './routes/auth.routes';
import { operatorRouter } from './routes/operator.routes';
import { auditRouter } from './routes/audit.routes';
import { createNetworkRouter } from './routes/network.routes';
import { incidentRouter } from './routes/incident.routes';
import { teamRouter } from './routes/team.routes';
import { shiftRouter } from './routes/shift.routes';
import { healthRouter } from './routes/health.routes';
import { alarmRouter } from './routes/alarm.routes';
import { communicationRouter } from './routes/communication.routes';
import { procedureRouter } from './routes/procedure.routes';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { RateLimiter, rateLimit } from './middlewares/rate-limit.middleware';
import { rateLimitStore } from '../../infrastructure/rate-limit/pg-rate-limit.store';
import type { TelemetrySimulator } from '../../application/services/TelemetrySimulator';

/**
 * Cabeçalhos de segurança básicos, sem adicionar dependências ao bundle.
 *
 * O CSP não corrige nenhuma XSS existente (não há nenhuma conhecida — o frontend nunca
 * usa `dangerouslySetInnerHTML`/`innerHTML`) — é defesa em profundidade: o token de sessão
 * vive em `localStorage`, acessível a qualquer script que rode na página, então reduzir o
 * que um script malicioso conseguiria fazer (caso uma XSS apareça no futuro, por exemplo
 * via uma dependência nova) vale a pena mesmo sem um vetor ativo hoje.
 */
const securityHeaders: express.RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' https: http: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  );
  if (env.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  res.removeHeader('X-Powered-By');
  next();
};

/**
 * Teto global por origem, acima dos limites específicos de login e de renovação.
 * Usa o mesmo contador compartilhado, então vale para o conjunto das instâncias.
 */
const apiLimiter = new RateLimiter(env.apiMaxRequests, env.apiWindowMs, rateLimitStore);

export const createApp = (simulator: TelemetrySimulator): Express => {
  const app = express();

  app.disable('x-powered-by');
  // Sem proxy reverso conhecido na frente deste deploy — confiar em `X-Forwarded-For` do
  // próprio cliente permitiria forjar `req.ip` e contornar o rate limiter de login (que usa
  // IP como parte da chave). Se um dia houver um proxy real, trocar para o IP/CIDR dele
  // especificamente — nunca `true`.
  app.set('trust proxy', false);
  app.use(securityHeaders);
  app.use(cors({ origin: env.corsOrigin, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], credentials: false }));
  app.use(express.json({ limit: '64kb' }));

  app.use(healthRouter);
  app.use('/api', rateLimit(apiLimiter, (req) => `api:${req.ip ?? 'unknown'}`));
  app.use('/api/auth', authRouter);
  app.use('/api/operator', operatorRouter);
  app.use('/api/audit-logs', auditRouter);
  app.use('/api/network', createNetworkRouter(simulator));
  app.use('/api/incidents', incidentRouter);
  app.use('/api/team', teamRouter);
  app.use('/api/shift', shiftRouter);
  app.use('/api/alarms', alarmRouter);
  app.use('/api/communications', communicationRouter);
  app.use('/api/procedures', procedureRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
