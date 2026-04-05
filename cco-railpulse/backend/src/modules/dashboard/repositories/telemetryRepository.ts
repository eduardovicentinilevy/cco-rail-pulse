import { db } from '../../../infrastructure/db/timescale';
import { TelemetryDTO } from '../entities/Telemetry';

export class TelemetryRepository {
  static async insert(data: TelemetryDTO): Promise<void> {
    const query = `
      INSERT INTO tb_cbtc_telemetry 
      (event_time, fleet_code, train_id, speed_kmh, latitude, longitude, doors_open, cbtc_sync_status) 
      VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7)
    `;
    const values = [
      data.fleet_code, data.train_id, data.speed_kmh, 
      data.latitude, data.longitude, data.doors_open, data.cbtc_sync_status
    ];
    
    // Fire-and-forget otimizado para concorrência
    await db.query(query, values);
  }
}