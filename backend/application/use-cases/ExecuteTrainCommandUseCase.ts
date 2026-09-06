// src/application/use-cases/ExecuteTrainCommandUseCase.ts
import { TrainSession } from '../../domain/entities/TrainSession';
import { AuditLogger } from '../../infrastructure/security/AuditLogger';

interface ExecuteCommandRequest {
  operatorId: string;
  trainId: string;
  command: 'HALT' | 'RESTRICT_SPEED' | 'RELEASE';
  targetBlock: string;
}

export class ExecuteTrainCommandUseCase {
  public execute(request: ExecuteCommandRequest): TrainSession {
    const { operatorId, trainId, command, targetBlock } = request;

    // Trilha de auditoria obrigatória para comandos operacionais críticos na malha
    AuditLogger.record({
      operatorId,
      action: `COMMAND_${command}`,
      targetResource: `TRAIN_${trainId}_BLOCK_${targetBlock}`,
      severity: command === 'HALT' ? 'CRITICAL' : 'WARNING'
    });

    // Aplicação das regras de negócio do domínio ferroviário
    const status = command === 'HALT' ? 'EMERGÊNCIA' : command === 'RESTRICT_SPEED' ? 'ATENÇÃO' : 'NORMAL';
    const speed = command === 'HALT' ? 0 : command === 'RESTRICT_SPEED' ? 30 : 50;

    const updatedTrain = new TrainSession(
      trainId,
      targetBlock,
      speed,
      25.0,
      status,
      new Date()
    );

    return updatedTrain;
  }
}