// backend/presentation/websocket/cco.gateway.ts
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { domainEventBus } from '../../application/events/event-bus';
import { executeTrainCommandUseCase } from '../../application/use-cases/ExecuteTrainCommandUseCase';
import { TrainRepository } from '../../infrastructure/database/repositories/TrainRepository';
import { operatorRepository } from '../../infrastructure/repositories/pg-operator.repository';
import { isTrainCommand } from '../../domain/entities/TrainSession';
import type { TrainCommand } from '../../domain/entities/TrainSession';
import { verifyOperatorToken, extractBearerToken } from '../../shared/jwt';
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

    socket.operator = operator;
    next();
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const operator = socket.operator!;
    logger.info(`Painel conectado: ${socket.id} (operador ${operator.operatorId})`);

    const onTelemetryBatch = (batch: unknown) => socket.emit('telemetry:batch', batch);
    const onCriticalAlert = (alert: unknown) => socket.emit('alert:critical', alert);
    const onTrainUpdated = (train: unknown) => socket.emit('train:updated', train);

    domainEventBus.on('telemetry:updated', onTelemetryBatch);
    domainEventBus.on('system:alert', onCriticalAlert);
    domainEventBus.on('train:updated', onTrainUpdated);

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
        const snapshot = await executeTrainCommandUseCase.execute({
          operatorId: operator.operatorId,
          trainId,
          command,
          targetBlock,
        });

        await operatorRepository.logAudit(operator.operatorId, `EXEC_${rawCommand}`, `TRAIN_${trainId}`, 'EXECUTED');

        domainEventBus.emit('train:updated', snapshot);
        domainEventBus.emit('system:alert', {
          severity: command === 'HALT' ? 'CRITICAL' : command === 'RESTRICT_SPEED' ? 'WARNING' : 'INFO',
          message: `Comando ${rawCommand} executado no ${trainId} pelo operador ${operator.operatorId}`,
          timestamp: new Date().toISOString(),
        });

        acknowledge('EXECUTED');
      } catch (error) {
        logger.error(`Falha ao executar ${rawCommand} em ${trainId}`, error);
        await operatorRepository.logAudit(operator.operatorId, `EXEC_${rawCommand}`, `TRAIN_${trainId}`, 'FAILED');
        acknowledge('FAILED', error instanceof Error ? error.message : undefined);
      }
    });

    socket.on('disconnect', (reason) => {
      // Clean-up vital: sem isso cada reconexão acumula listeners no barramento.
      domainEventBus.off('telemetry:updated', onTelemetryBatch);
      domainEventBus.off('system:alert', onCriticalAlert);
      domainEventBus.off('train:updated', onTrainUpdated);
      logger.info(`Painel desconectado: ${socket.id} (${reason})`);
    });
  });
};
