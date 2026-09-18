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
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import type { SimulationRegistry } from '../../application/services/SimulationRegistry';

/** Cabeçalhos de segurança básicos, sem adicionar dependências ao bundle. */
const securityHeaders: express.RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.removeHeader('X-Powered-By');
  next();
};

export const createApp = (registry: SimulationRegistry): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(securityHeaders);
  app.use(cors({ origin: env.corsOrigin, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], credentials: false }));
  app.use(express.json({ limit: '64kb' }));

  app.use(healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/operator', operatorRouter);
  app.use('/api/audit-logs', auditRouter);
  app.use('/api/network', createNetworkRouter(registry));
  app.use('/api/incidents', incidentRouter);
  app.use('/api/team', teamRouter);
  app.use('/api/shift', shiftRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
