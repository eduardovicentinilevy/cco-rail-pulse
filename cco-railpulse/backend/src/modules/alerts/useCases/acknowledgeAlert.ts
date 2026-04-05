import { AckDTO } from '../entities/Alert';
import { AlertRepository } from '../repositories/alertRepository';
import { publishEvent } from '../../../infrastructure/redis/publisher';

export class AcknowledgeAlertUseCase {
  static async execute(data: AckDTO): Promise<void> {
    await AlertRepository.acknowledge(data);

    // Notifica os painéis para removerem o alerta da fila visual de eventos ativos
    await publishEvent('socket.io#/#alerts#', {
      type: 'ALERT_ACKNOWLEDGED',
      payload: data
    });
  }
}