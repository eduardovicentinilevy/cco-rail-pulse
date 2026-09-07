// backend/infrastructure/database/repositories/TrainRepository.ts
import { db } from '../postgres';
import { TrainSession } from '../../../domain/entities/TrainSession';

export class TrainRepository {
  public static async findByIdWithLock(trainId: string): Promise<TrainSession | null> {
    const result = await db.query(
      `SELECT train_id, current_station_code, speed_kmh, voltage_kv, status, updated_at
       FROM trains
       WHERE train_id = $1
       FOR UPDATE`,
      [trainId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return new TrainSession(
      row.train_id,
      row.current_station_code,
      Number(row.speed_kmh),
      Number(row.voltage_kv),
      row.status,
      row.updated_at
    );
  }

  public static async save(train: TrainSession): Promise<void> {
    await db.query(
      `INSERT INTO trains (train_id, current_station_code, speed_kmh, voltage_kv, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (train_id) DO UPDATE
       SET current_station_code = $2, speed_kmh = $3, voltage_kv = $4, status = $5, updated_at = $6`,
      [train.trainId, train.currentStationCode, train.speedKmH, train.voltageKV, train.status, train.updatedAt]
    );
  }
}
