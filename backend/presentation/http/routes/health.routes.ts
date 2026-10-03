// backend/presentation/http/routes/health.routes.ts
import { Router } from 'express';
import { db } from '../../../infrastructure/database/postgres';
import { env } from '../../../config/env';

export const healthRouter: Router = Router();

const startedAt = Date.now();

let acceptingTraffic = true;

/**
 * Marca o serviço como fora de rotação. Chamado no início do encerramento
 * gracioso: o balanceador para de mandar tráfego enquanto as conexões em
 * andamento terminam.
 */
export const setAcceptingTraffic = (value: boolean): void => {
  acceptingTraffic = value;
};

const uptimeSeconds = (): number => Math.floor((Date.now() - startedAt) / 1000);

const checkDatabase = async (): Promise<{ connected: boolean; time: Date | null }> => {
  try {
    const result = await db.query<{ now: Date }>('SELECT NOW() AS now');
    return { connected: true, time: result.rows[0].now };
  } catch {
    return { connected: false, time: null };
  }
};

/**
 * Liveness: responde enquanto o processo estiver de pé, sem tocar no banco.
 *
 * É a sonda do orquestrador (HEALTHCHECK do contêiner, livenessProbe): uma
 * indisponibilidade do Postgres não deve fazer o supervisor matar e reiniciar
 * um processo que está saudável.
 */
healthRouter.get('/health/live', (_req, res) => {
  res.status(200).json({
    status: 'ALIVE',
    service: env.serviceName,
    version: env.appVersion,
    uptimeSeconds: uptimeSeconds(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness: só responde 200 quando o serviço pode de fato atender — banco
 * acessível e instância ainda em rotação.
 */
healthRouter.get('/health/ready', async (_req, res) => {
  const database = await checkDatabase();
  const ready = acceptingTraffic && database.connected;

  res.status(ready ? 200 : 503).json({
    status: ready ? 'READY' : 'NOT_READY',
    service: env.serviceName,
    version: env.appVersion,
    database: database.connected ? 'CONNECTED' : 'DISCONNECTED',
    acceptingTraffic,
    uptimeSeconds: uptimeSeconds(),
    timestamp: new Date().toISOString(),
  });
});

/** Diagnóstico completo, consumido pelo painel "Status do sistema" do console. */
healthRouter.get('/health', async (_req, res) => {
  const base = {
    service: 'railpulse-cco',
    line: 'Linha 6-Laranja (Linha Uni)',
    version: env.appVersion,
    environment: env.nodeEnv,
    architecture: 'Event-Driven (EDA)',
    uptimeSeconds: uptimeSeconds(),
    telemetryIntervalMs: env.telemetryIntervalMs,
    timestamp: new Date().toISOString(),
  };

  const database = await checkDatabase();

  if (!database.connected) {
    res.status(503).json({ ...base, status: 'DEGRADED', database: 'DISCONNECTED' });
    return;
  }

  res.status(200).json({ ...base, status: 'ONLINE', database: 'CONNECTED', databaseTime: database.time });
});
