// backend/infrastructure/database/repositories/TrainRepository.ts
import type { PoolClient } from 'pg';
import { db } from '../postgres';
import { TrainSession } from '../../../domain/entities/TrainSession';
import type { TrainStatus } from '../../../domain/entities/TrainSession';

interface TrainRow {
  train_id: string;
  current_station_code: string;
  speed_kmh: string | number;
  voltage_kv: string | number;
  status: string;
  updated_at: Date;
}

/** `pg` devolve NUMERIC como string para preservar precisão — normalizamos na borda. */
const toEntity = (row: TrainRow): TrainSession =>
  new TrainSession(
    row.train_id,
    row.current_station_code,
    Number(row.speed_kmh),
    Number(row.voltage_kv),
    row.status as TrainStatus,
    new Date(row.updated_at),
  );

type Queryable = Pick<PoolClient, 'query'>;

const COLUMNS = 'train_id, current_station_code, speed_kmh, voltage_kv, status, updated_at';

/**
 * Composições de uma linha.
 *
 * A numeração (`T-01`) só é única dentro da linha, então `lineId` é obrigatório
 * em todo método: dois clientes podem ter uma composição T-01.
 */
export class TrainRepository {
  public static async findAll(lineId: string): Promise<TrainSession[]> {
    const result = await db.query<TrainRow>(
      `SELECT ${COLUMNS} FROM trains WHERE line_id = $1 ORDER BY train_id ASC`,
      [lineId],
    );
    return result.rows.map(toEntity);
  }

  /**
   * Busca com locking pessimista (FOR UPDATE).
   * Precisa rodar dentro de uma transação — passe o client de `withTransaction`.
   */
  public static async findByIdWithLock(
    lineId: string,
    trainId: string,
    client: Queryable,
  ): Promise<TrainSession | null> {
    const result = await client.query<TrainRow>(
      `SELECT ${COLUMNS} FROM trains WHERE line_id = $1 AND train_id = $2 FOR UPDATE`,
      [lineId, trainId],
    );
    return result.rows.length === 0 ? null : toEntity(result.rows[0]);
  }

  public static async save(lineId: string, train: TrainSession, client: Queryable = db): Promise<void> {
    await client.query(
      `INSERT INTO trains (line_id, train_id, current_station_code, speed_kmh, voltage_kv, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (line_id, train_id) DO UPDATE
       SET current_station_code = EXCLUDED.current_station_code,
           speed_kmh = EXCLUDED.speed_kmh,
           voltage_kv = EXCLUDED.voltage_kv,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at`,
      [
        lineId,
        train.trainId,
        train.currentStationCode,
        train.speedKmH,
        train.voltageKV,
        train.status,
        train.updatedAt,
      ],
    );
  }
}
