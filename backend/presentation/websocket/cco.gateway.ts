// backend/presentation/websocket/cco.gateway.ts
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { domainEventBus } from '../../application/events/event-bus';
import { processTrainCommandUseCase } from '../../application/use-cases/ProcessTrainCommand';
import { TrainRepository } from '../../infrastructure/database/repositories/TrainRepository';
import { isTrainCommand } from '../../domain/entities/TrainSession';
import type { TrainCommand } from '../../domain/entities/TrainSession';
import { verifyOperatorToken, extractBearerToken } from '../../shared/jwt';
import { authSessionService } from '../../infrastructure/auth/session-service';
import { createLogger } from '../../shared/logger';
import type { TelemetrySimulator } from '../../application/services/TelemetrySimulator';
import type { OperatorTokenPayload } from '../../shared/jwt';

const logger = createLogger('CCO-GATEWAY');

/** Comandos expostos ao painel, mapeados para os comandos de domínio. */
const COMMAND_ALIASES: Record<string, TrainCommand> = {
  EMERGENCY_BRAKE_OVERRIDE: 'HALT',
  SPEED_RESTRICTION_20KM: 'RESTRICT_SPEED',
  RELEASE_SIGNAL: 'RELEASE',
};

const resolveCommand = (raw: unknown): TrainCommand | null => {
  if (typeof raw !== 'string') return null;
  if (raw in COMMAND_ALIASES) return COMMAND_ALIASES[raw];
  return isTrainCommand(raw) ? raw : null;
};

interface AuthenticatedSocket extends Socket {
  operator?: OperatorTokenPayload;
}

/**
 * Gateway WebSocket do CCO.
 *
 * Toda conexão é autenticada no handshake e a identidade do operador passa a vir do
 * token — nunca do payload enviado pelo cliente, que é falsificável.
 */
export const registerCcoGateway = (io: SocketIOServer, simulator: TelemetrySimulator): void => {
  io.use((socket: AuthenticatedSocket, next) => {
    const handshake = socket.handshake;
    const token =
      (typeof handshake.auth?.token === 'string' ? handshake.auth.token : null) ??
      extractBearerToken(handshake.headers.authorization);

    const operator = verifyOperatorToken(token);

    if (!operator) {
      next(new Error('UNAUTHORIZED'));
      return;
    }

    // A sessão pode ter sido revogada depois da emissão do token: o socket fica
    // aberto por horas, então conferir só a assinatura deixaria o canal vivo.
    authSessionService
      .isActive(operator.sessionId)
      .then((isActive) => {
        if (!isActive) {
          next(new Error('UNAUTHORIZED'));
          return;
        }
        socket.operator = operator;
        next();
      })
      .catch(() => next(new Error('UNAUTHORIZED')));
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const operator = socket.operator!;
    logger.info(`Painel conectado: ${socket.id} (operador ${operator.operatorId})`);

    const onTelemetryBatch = (batch: unknown) => socket.emit('telemetry:batch', batch);
    const onCriticalAlert = (alert: unknown) => socket.emit('alert:critical', alert);
    const onTrainUpdated = (train: unknown) => socket.emit('train:updated', train);
    const onIncidentChanged = (incident: unknown) => socket.emit('incident:changed', incident);

    domainEventBus.on('telemetry:updated', onTelemetryBatch);
    domainEventBus.on('system:alert', onCriticalAlert);
    domainEventBus.on('train:updated', onTrainUpdated);
    domainEventBus.on('incident:changed', onIncidentChanged);

    // Carga inicial: o painel já abre com o estado corrente da malha.
    socket.emit('telemetry:batch', simulator.snapshot());
    TrainRepository.findAll()
      .then((trains) => socket.emit('train:sync', trains.map((train) => train.toSnapshot())))
      .catch((error) => logger.error('Falha ao sincronizar composições no handshake.', error));

    socket.on('train:command', async (payload: { trainId?: unknown; command?: unknown; targetBlock?: unknown }) => {
      const trainId = typeof payload?.trainId === 'string' ? payload.trainId.trim() : '';
      const rawCommand = typeof payload?.command === 'string' ? payload.command : '';
      const command = resolveCommand(rawCommand);
      const targetBlock = typeof payload?.targetBlock === 'string' ? payload.targetBlock : undefined;

      const acknowledge = (status: 'EXECUTED' | 'FAILED', message?: string) =>
        socket.emit('train:command:acknowledged', { trainId, command: rawCommand, status, message });

      if (!trainId || !command) {
        acknowledge('FAILED', 'Comando ou composição inválidos.');
        return;
      }

      try {
        // Adquire o lock pessimista, valida, audita, executa e emite — tudo dentro do
        // use case; ver ProcessTrainCommand.ts para o ciclo de vida completo e a
        // mitigação de deadlock/inanição sob comandos concorrentes ao mesmo trem.
        const { applied } = await processTrainCommandUseCase.execute({
          operatorId: operator.operatorId,
          trainId,
          rawCommand,
          command,
          targetBlock,
        });

        acknowledge('EXECUTED', applied ? undefined : `O trem ${trainId} já estava neste estado.`);
      } catch (error) {
        logger.error(`Falha ao executar ${rawCommand} em ${trainId}`, error);
        acknowledge('FAILED', error instanceof Error ? error.message : undefined);
      }
    });

    socket.on('disconnect', (reason) => {
      // Clean-up vital: sem isso cada reconexão acumula listeners no barramento.
      domainEventBus.off('telemetry:updated', onTelemetryBatch);
      domainEventBus.off('system:alert', onCriticalAlert);
      domainEventBus.off('train:updated', onTrainUpdated);
      domainEventBus.off('incident:changed', onIncidentChanged);
      logger.info(`Painel desconectado: ${socket.id} (${reason})`);
    });
  });
};
