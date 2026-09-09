// backend/application/use-cases/ExecuteTrainCommandUseCase.ts
import { withTransaction } from '../../infrastructure/database/postgres';
import { TrainRepository } from '../../infrastructure/database/repositories/TrainRepository';
import { AuditLogger } from '../../infrastructure/security/AuditLogger';
import { NotFoundError } from '../../shared/errors';
import type { TrainCommand, TrainSnapshot } from '../../domain/entities/TrainSession';

export interface ExecuteCommandRequest {
  operatorId: string;
  trainId: string;
  command: TrainCommand;
  /** Bloco/estação de referência informado pelo operador — usado apenas na auditoria. */
  targetBlock?: string;
}

const SEVERITY: Record<TrainCommand, 'INFO' | 'WARNING' | 'CRITICAL'> = {
  HALT: 'CRITICAL',
  RESTRICT_SPEED: 'WARNING',
  RELEASE: 'INFO',
};

/**
 * Executa um comando operacional sobre uma composição real da malha.
 *
 * O estado persistido é carregado sob lock pessimista (FOR UPDATE) dentro de uma
 * transação, de modo que dois operadores emitindo comandos simultâneos para o mesmo
 * trem sejam serializados — requisito de segurança ferroviária.
 */
export class ExecuteTrainCommandUseCase {
  public async execute({ operatorId, trainId, command, targetBlock }: ExecuteCommandRequest): Promise<TrainSnapshot> {
    const snapshot = await withTransaction(async (client) => {
      const train = await TrainRepository.findByIdWithLock(trainId, client);

      if (!train) {
        throw new NotFoundError(`Composição ${trainId} não encontrada na malha ferroviária.`);
      }

      train.applyCommand(command);
      await TrainRepository.save(train, client);

      return train.toSnapshot();
    });

    AuditLogger.record({
      operatorId,
      action: `COMMAND_${command}`,
      targetResource: `TRAIN_${trainId}_BLOCK_${targetBlock ?? snapshot.currentStationCode}`,
      severity: SEVERITY[command],
    });

    return snapshot;
  }
}

export const executeTrainCommandUseCase = new ExecuteTrainCommandUseCase();
