import { TelemetryDTO } from '../entities/Telemetry';
import { TelemetryRepository } from '../repositories/telemetryRepository';
import { publishEvent } from '../../../infrastructure/redis/publisher';

export class IngestTelemetryUseCase {
  static async execute(data: TelemetryDTO): Promise<void> {
    // 1. Persistência assíncrona na Hypertable (TimescaleDB)
    await TelemetryRepository.insert(data).catch(err => {
      console.error('[DB] Falha no insert de telemetria (Drop de pacote aceitável em alta frequência):', err.message);
    });

    // 2. Propagação Real-Time via Backplane (Painel Sinótico Linear)
    // O canal do Socket.io usando Redis Adapter segue o padrão de namespace/room
    const room = `fleet_${data.fleet_code}`;
    const wsPayload = {
      type: 'TELEMETRY_UPDATE',
      payload: { ...data, timestamp: new Date().toISOString() }
    };

    // Propaga via socket.io-redis
    await publishEvent(`socket.io#/#${room}#`, wsPayload);
  }
}