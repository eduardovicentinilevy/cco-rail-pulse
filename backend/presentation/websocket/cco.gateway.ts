// backend/presentation/websocket/cco.gateway.ts
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { domainEventBus } from '../../application/events/event-bus';
import type { LineEvent } from '../../application/events/event-bus';
import { processTrainCommandUseCase } from '../../application/use-cases/ProcessTrainCommand';
import { TrainRepository } from '../../infrastructure/database/repositories/TrainRepository';
import { operatorRepository } from '../../infrastructure/repositories/pg-operator.repository';
import { isTrainCommand } from '../../domain/entities/TrainSession';
import type { TrainCommand } from '../../domain/entities/TrainSession';
import { verifyOperatorToken, extractBearerToken } from '../../shared/jwt';
import { createLogger } from '../../shared/logger';
import { AppError } from '../../shared/errors';
import { RateLimiter } from '../http/middlewares/rate-limit.middleware';
import type { SimulationRegistry } from '../../application/services/SimulationRegistry';
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
const commandLimiter = new RateLimiter(20, 10_000);

interface AuthenticatedSocket extends Socket {
  operator?: OperatorTokenPayload;
}

/** Sala de uma linha. Um painel só recebe o que acontece na linha do seu token. */
const roomFor = (lineId: string): string => `line:${lineId}`;

/**
 * Gateway WebSocket do CCO.
 *
 * Toda conexão é autenticada no handshake e a identidade do operador passa a vir do
 * token — nunca do payload enviado pelo cliente, que é falsificável. A linha da
 * sessão vem do mesmo token e define a sala do socket: os eventos de domínio são
 * entregues por sala, não em broadcast, que é o que impedia dois clientes de
 * coexistirem no mesmo processo sem ver a operação um do outro.
 */
export const registerCcoGateway = (io: SocketIOServer, registry: SimulationRegistry): void => {
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
    // conta segue ativa. `findById` já filtra `is_active = TRUE`, e recebe o cliente do
    // token: a busca nunca alcança um operador de outro cliente com o mesmo id.
    const operator = await operatorRepository.findById(payload.tenantId, payload.operatorId);
    if (!operator) {
      next(new Error('UNAUTHORIZED'));
      return;
    }

    // O escopo (cliente e linha) vem do token; o perfil vem fresco do banco, para que
    // um rebaixamento de permissão valha para a sessão já aberta.
    socket.operator = { ...payload, role: operator.role };
    next();
  });

  // Uma assinatura por processo, com roteamento por sala. Antes cada socket
  // registrava quatro listeners próprios no barramento e recebia tudo.
  const relay = <T>(event: 'telemetry:batch' | 'alert:critical' | 'train:updated' | 'incident:changed') =>
    ({ lineId, payload }: LineEvent<T>) => {
      io.to(roomFor(lineId)).emit(event, payload);
    };

  domainEventBus.on('telemetry:updated', relay('telemetry:batch'));
  domainEventBus.on('system:alert', relay('alert:critical'));
  domainEventBus.on('train:updated', relay('train:updated'));
  domainEventBus.on('incident:changed', relay('incident:changed'));

  // Também uma única vez para o gateway inteiro: desativar um operador em `Equipe`
  // derruba qualquer socket já aberto em nome dele, na hora — sem isso, uma sessão de
  // WebSocket já estabelecida seguiria comandando trens normalmente até o cliente
  // desconectar por conta própria. O id é a chave interna (UUID), única em toda a
  // instalação, então não há como derrubar o socket do operador de outro cliente.
  domainEventBus.on('operator:deactivated', ({ operatorId }) => {
    for (const socket of io.sockets.sockets.values()) {
      if ((socket as AuthenticatedSocket).operator?.operatorId === operatorId) {
        socket.disconnect(true);
      }
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const operator = socket.operator!;
    const { lineId, tenantId } = operator;

    void socket.join(roomFor(lineId));
    logger.info(`Painel conectado: ${socket.id} (operador ${operator.credential}, linha ${lineId})`);

    // Carga inicial: o painel já abre com o estado corrente da sua linha.
    socket.emit('telemetry:batch', registry.snapshotOf(lineId));
    TrainRepository.findAll(lineId)
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
        commandLimiter.consume(operator.operatorId);

        // Adquire o lock pessimista, valida, audita, executa e emite — tudo dentro do
        // use case; ver ProcessTrainCommand.ts para o ciclo de vida completo e a
        // mitigação de deadlock/inanição sob comandos concorrentes ao mesmo trem.
        const { applied } = await processTrainCommandUseCase.execute({
          lineId,
          tenantId,
          operatorCredential: operator.credential,
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
      // O Socket.IO tira o socket da sala sozinho; não há mais listeners de
      // barramento por conexão para limpar.
      logger.info(`Painel desconectado: ${socket.id} (${reason})`);
    });
  });
};
