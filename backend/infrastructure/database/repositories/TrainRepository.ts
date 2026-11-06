// backend/infrastructure/database/repositories/TrainRepository.ts
import type { PoolClient } from 'pg';
import { db } from '../postgres';
import { TrainSession } from '../../../domain/entities/TrainSession';
import type { TrainStatus } from '../../../domain/entities/TrainSession';
import { isDirection } from '../../../domain/operation';
import type { Direction } from '../../../domain/operation';

interface TrainRow {
  train_id: string;
  current_station_code: string;
  speed_kmh: string | number;
  voltage_v: string | number;
  status: string;
  updated_at: Date;
  direction: number;
  next_station_code: string | null;
  segment_progress: string | number;
  progress_at: Date | null;
  remaining_ms: number | null;
  hold_reason: string | null;
}

const COLUMNS = `train_id, current_station_code, speed_kmh, voltage_v, status, updated_at,
  direction, next_station_code, segment_progress, progress_at, remaining_ms, hold_reason`;

/** `pg` devolve NUMERIC como string para preservar precisão — normalizamos na borda. */
const toEntity = (row: TrainRow): TrainSession => {
  const updatedAt = new Date(row.updated_at);
  return new TrainSession(
    row.train_id,
    row.current_station_code,
    Number(row.speed_kmh),
    Number(row.voltage_v),
    row.status as TrainStatus,
    updatedAt,
    {
      direction: isDirection(Number(row.direction)) ? (Number(row.direction) as Direction) : 1,
      motion: row.next_station_code
        ? {
            toStationCode: row.next_station_code,
            progress: Math.min(1, Math.max(0, Number(row.segment_progress) || 0)),
            progressAt: row.progress_at ? new Date(row.progress_at) : updatedAt,
            remainingMs: row.remaining_ms === null ? null : Number(row.remaining_ms),
          }
        : null,
      holdReason: row.hold_reason,
    },
  );
};

type Queryable = Pick<PoolClient, 'query'>;

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
    const motion = train.motion;
    await client.query(
      `INSERT INTO trains (line_id, ${COLUMNS})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (line_id, train_id) DO UPDATE
       SET current_station_code = EXCLUDED.current_station_code,
           speed_kmh = EXCLUDED.speed_kmh,
           voltage_v = EXCLUDED.voltage_v,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at,
           direction = EXCLUDED.direction,
           next_station_code = EXCLUDED.next_station_code,
           segment_progress = EXCLUDED.segment_progress,
           progress_at = EXCLUDED.progress_at,
           remaining_ms = EXCLUDED.remaining_ms,
           hold_reason = EXCLUDED.hold_reason`,
      [
        lineId,
        train.trainId,
        train.currentStationCode,
        train.speedKmH,
        train.voltageV,
        train.status,
        train.updatedAt,
        train.direction,
        motion?.toStationCode ?? null,
        motion?.progress ?? 0,
        motion?.progressAt ?? null,
        motion && motion.remainingMs !== null ? Math.round(motion.remainingMs) : null,
        train.holdReason,
      ],
    );
  }
}
