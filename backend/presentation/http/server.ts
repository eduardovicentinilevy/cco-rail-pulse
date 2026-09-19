// backend/presentation/http/server.ts
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { env } from '../../config/env';
import { createLogger } from '../../shared/logger';
import { createApp } from './app';
import { registerCcoGateway } from '../websocket/cco.gateway';
import { TelemetrySimulator } from '../../application/services/TelemetrySimulator';
import { TelemetryArchiver } from '../../application/services/TelemetryArchiver';
import { TrainMotionSimulator } from '../../application/services/TrainMotionSimulator';
import { runMigrations } from '../../infrastructure/database/migrations';
import { authSessionService } from '../../infrastructure/auth/session-service';
import { closeDatabase, db } from '../../infrastructure/database/postgres';
import { domainEventBus } from '../../application/events/event-bus';
import { AlarmRepository } from '../../infrastructure/database/repositories/AlarmRepository';

const logger = createLogger('BOOT');

/** Frequência da limpeza das sessões vencidas. */
const SESSION_PURGE_INTERVAL_MS = 3_600_000;

const simulator = new TelemetrySimulator(env.telemetryIntervalMs);
const archiver = new TelemetryArchiver(env.telemetryBucketSeconds, env.telemetryRetentionDays);
const trainMotion = new TrainMotionSimulator(env.trainMotionIntervalMs);
const app = createApp(simulator);
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: { origin: env.corsOrigin, methods: ['GET', 'POST'] },
  // Sockets ociosos são derrubados antes de acumular no gateway.
  pingTimeout: 20_000,
  pingInterval: 25_000,
});

registerCcoGateway(io, simulator);

// Persiste todo alerta de domínio na Central de Alarmes — o feed ao vivo do painel
// some ao recarregar a página; esta tabela é o histórico que sobrevive entre turnos.
domainEventBus.on('system:alert', (alert) => {
  AlarmRepository.create(alert).catch((error) => logger.error('Falha ao persistir alarme.', error));
});

// Sem este handler, uma porta ocupada derruba o processo com stack trace bruto.
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`A porta ${env.port} já está em uso. Encerre o outro processo ou ajuste PORT no .env.`);
  } else {
    logger.error('Falha no servidor HTTP.', error);
  }
  process.exit(1);
});

let sessionPurgeTimer: NodeJS.Timeout | null = null;

/** Remove sessões vencidas para que a tabela não cresça indefinidamente. */
const startSessionPurge = (): void => {
  const purge = () =>
    void authSessionService
      .purgeExpired()
      .then((removed) => {
        if (removed > 0) logger.info(`${removed} sessão(ões) vencida(s) removida(s).`);
      })
      .catch((error) => logger.error('Falha ao limpar sessões vencidas.', error));

  purge();
  sessionPurgeTimer = setInterval(purge, SESSION_PURGE_INTERVAL_MS);
  // Não é motivo para manter o processo vivo no encerramento.
  sessionPurgeTimer.unref();
};

let shuttingDown = false;

/** Encerramento gracioso: para a telemetria, fecha sockets, HTTP e o pool do Postgres. */
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Sinal ${signal} recebido — iniciando encerramento gracioso.`);

  simulator.stop();
  trainMotion.stop();
  if (sessionPurgeTimer) clearInterval(sessionPurgeTimer);
  // Descarrega a janela pendente antes de derrubar o barramento.
  await archiver.stop().catch((error) => logger.error('Falha ao encerrar o arquivamento.', error));
  domainEventBus.removeAllListeners();

  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase().catch((error) => logger.error('Falha ao encerrar o pool.', error));

  logger.info('Encerramento concluído.');
  process.exit(0);
};

const bootstrap = async (): Promise<void> => {
  try {
    // Fail-fast: sem banco íntegro o CCO não abre a porta HTTP.
    await db.query('SELECT 1');
    logger.info('Conexão com PostgreSQL estabelecida.');

    await runMigrations();
    startSessionPurge();
    archiver.start();
    simulator.start();
    trainMotion.start();

    server.listen(env.port, () => {
      logger.info(`RailPulse CCO (${env.nodeEnv}) ativo em http://localhost:${env.port}`);
      logger.info(`Telemetria SCADA emitindo a cada ${env.telemetryIntervalMs}ms.`);
      logger.info(`Composições avançando uma estação a cada ${env.trainMotionIntervalMs}ms.`);
    });
  } catch (error) {
    logger.error('Falha crítica de inicialização. Servidor abortado.', error);
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  }
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}

process.on('unhandledRejection', (reason) => logger.error('Promise rejeitada sem tratamento.', reason));

void bootstrap();
