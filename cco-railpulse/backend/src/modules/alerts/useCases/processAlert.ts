import { AlertDTO } from '../entities/Alert';
import { AlertRepository } from '../repositories/alertRepository';
import { publishEvent } from '../../../infrastructure/redis/publisher';

export class ProcessAlertUseCase {
  static async execute(data: AlertDTO): Promise<void> {
    const alertId = await AlertRepository.create(data);

    // Propaga o alerta crítico para todos os painéis sinóticos imediatamente via Redis
    const wsPayload = {
      type: 'NEW_ALERT',
      payload: { alert_id: alertId, ...data }
    };
    await publishEvent('socket.io#/#alerts#', wsPayload);
  }
}