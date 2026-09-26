// backend/presentation/websocket/cco.gateway.ts
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { domainEventBus } from '../../application/events/event-bus';
import { processTrainCommandUseCase } from '../../application/use-cases/ProcessTrainCommand';
import { TrainRepository } from '../../infrastructure/database/repositories/TrainRepository';
import { operatorRepository } from '../../infrastructure/repositories/pg-operator.repository';
import { isTrainCommand } from '../../domain/entities/TrainSession';
import type { TrainCommand } from '../../domain/entities/TrainSession';
import { verifyOperatorToken, extractBearerToken } from '../../shared/jwt';
import { authSessionService } from '../../infrastructure/auth/session-service';
import { createLogger } from '../../shared/logger';
import { AppError } from '../../shared/errors';
import { RateLimiter } from '../http/middlewares/rate-limit.middleware';
import { rateLimitStore } from '../../infrastructure/rate-limit/pg-rate-limit.store';
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

/** Nenhum identificador real da malha chega perto disso — sobra é payload malformado. */
const MAX_IDENTIFIER_LENGTH = 20;

/** Por operador (não por socket): reconectar não reabre a cota. Reaproveita o limitador já usado no login. */
const commandLimiter = new RateLimiter(20, 10_000, rateLimitStore);

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
  io.use(async (socket: AuthenticatedSocket, next) => {
    const handshake = socket.handshake;
    const token =
      (typeof handshake.auth?.token === 'string' ? handshake.auth.token : null) ??
      extractBearerToken(handshake.headers.authorization);

    const payload = verifyOperatorToken(token);
    if (!payload) {
      next(new Error('UNAUTHORIZED'));
      return;
    }

    // Mesma revalidação do REST (`verifyJwt`): um token assinado não prova, sozinho, que a
    // conta segue ativa. `findById` já filtra `is_active = TRUE`.
    const operator = await operatorRepository.findById(payload.operatorId);
    if (!operator) {
      next(new Error('UNAUTHORIZED'));
      return;
    }

    // A sessão pode ter sido revogada depois da emissão do token: o socket fica
    // aberto por horas, então conferir só a assinatura deixaria o canal vivo.
    if (!(await authSessionService.isActive(payload.sessionId))) {
      next(new Error('UNAUTHORIZED'));
      return;
    }

    socket.operator = { operatorId: operator.id, role: operator.role, sessionId: payload.sessionId };
    next();
  });

  // Registrado uma única vez para o gateway inteiro (não por conexão): desativar um
  // operador em `Equipe` derruba qualquer socket já aberto em nome dele, na hora — sem
  // isso, uma sessão de WebSocket já estabelecida seguiria comandando trens normalmente
  // até o cliente desconectar por conta própria.
  domainEventBus.on('operator:deactivated', ({ operatorId }) => {
    for (const socket of io.sockets.sockets.values()) {
      if ((socket as AuthenticatedSocket).operator?.operatorId === operatorId) {
        socket.disconnect(true);
      }
    }
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

      // Nenhum id real da malha chega perto deste tamanho — acima disso é payload
      // malformado (ou hostil), e não vale nem abrir uma transação com lock para ele.
      if (trainId.length > MAX_IDENTIFIER_LENGTH || (targetBlock?.length ?? 0) > MAX_IDENTIFIER_LENGTH) {
        acknowledge('FAILED', 'Identificador de composição ou bloco inválido.');
        return;
      }

      if (!trainId || !command) {
        acknowledge('FAILED', 'Comando ou composição inválidos.');
        return;
      }

      try {
        // Por operador: sem isso, um único cliente autenticado (qualquer perfil, mesmo
        // OPERADOR) poderia inundar `train:command` e manter o lock pessimista de um
        // trem permanentemente disputado, fazendo outros operadores levarem 409 com
        // frequência — o próprio mecanismo de segurança de concorrência virando negação
        // de serviço contra um trem específico.
        await commandLimiter.consume(`ws-command:${operator.operatorId}`);

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
        // Só a mensagem de um AppError (nosso, com texto pensado pro operador) sai pro
        // cliente — qualquer outro erro (ex.: uma falha crua do driver do Postgres) vira
        // uma mensagem genérica, do mesmo jeito que o error handler do REST já faz.
        acknowledge('FAILED', error instanceof AppError ? error.message : 'Falha ao executar o comando.');
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
