// backend/presentation/http/routes/health.routes.ts
import { Router } from 'express';
import { db } from '../../../infrastructure/database/postgres';
import { env } from '../../../config/env';

export const healthRouter: Router = Router();

const startedAt = Date.now();

healthRouter.get('/health', async (_req, res) => {
  const base = {
    service: 'railpulse-cco',
    environment: env.nodeEnv,
    architecture: 'Event-Driven (EDA)',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  };

  try {
    const check = await db.query<{ now: Date }>('SELECT NOW() AS now');
    res.status(200).json({ ...base, status: 'ONLINE', database: 'CONNECTED', databaseTime: check.rows[0].now });
  } catch {
    res.status(503).json({ ...base, status: 'DEGRADED', database: 'DISCONNECTED' });
  }
});
