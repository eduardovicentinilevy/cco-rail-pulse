// src/application/use-cases/HaltTrainUseCase.ts
import { TrainRepository } from '../../infrastructure/database/repositories/TrainRepository';
import { AuditLogger } from '../../infrastructure/security/AuditLogger';

export class HaltTrainUseCase {
  public async execute(trainId: string, operatorId: string): Promise<void> {
    // Busca o trem utilizando locking pessimista para evitar concorrência em cenários críticos
    const train = await TrainRepository.findByIdWithLock(trainId);
    
    if (!train) {
      throw new Error(`Composição ${trainId} não encontrada na malha ferroviária.`);
    }

    train.updateTelemetry(0, train.voltageKV, 'EMERGÊNCIA');
    
    await TrainRepository.save(train);

    AuditLogger.record({
      operatorId,
      action: 'EMERGENCY_HALT_TRAIN',
      targetResource: `TRAIN_${trainId}`,
      severity: 'CRITICAL'
    });
  }
}