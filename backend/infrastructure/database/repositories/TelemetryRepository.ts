// backend/infrastructure/database/repositories/TelemetryRepository.ts
import { db } from '../postgres';

export interface TelemetryBucket {
  stationCode: string;
  bucketAt: Date;
  minKV: number;
  avgKV: number;
  maxKV: number;
  readings: number;
}

export interface HistorySample {
  stationCode: string;
  bucketAt: string;
  minKV: number;
  avgKV: number;
  maxKV: number;
}

export class TelemetryRepository {
  /**
   * Grava as janelas agregadas. A chave única (estação, janela) torna a escrita
   * idempotente: um reinício no meio de uma janela não duplica a série.
   */
  public static async saveBuckets(buckets: TelemetryBucket[]): Promise<void> {
    if (buckets.length === 0) return;

    const values: unknown[] = [];
    const placeholders = buckets.map((bucket, index) => {
      const base = index * 6;
      values.push(bucket.stationCode, bucket.bucketAt, bucket.minKV, bucket.avgKV, bucket.maxKV, bucket.readings);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    });

    await db.query(
      `INSERT INTO telemetry_samples (station_code, bucket_at, min_kv, avg_kv, max_kv, readings)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (station_code, bucket_at) DO UPDATE
       SET min_kv = LEAST(telemetry_samples.min_kv, EXCLUDED.min_kv),
           max_kv = GREATEST(telemetry_samples.max_kv, EXCLUDED.max_kv),
           avg_kv = EXCLUDED.avg_kv,
           readings = telemetry_samples.readings + EXCLUDED.readings`,
      values,
    );
  }

  /** Remove janelas fora do período de retenção. Retorna quantas linhas saíram. */
  public static async prune(retentionDays: number): Promise<number> {
    const result = await db.query(
      `DELETE FROM telemetry_samples WHERE bucket_at < NOW() - ($1 || ' days')::interval`,
      [String(retentionDays)],
    );
    return result.rowCount ?? 0;
  }

  public static async history(stationCodes: string[], sinceHours: number): Promise<HistorySample[]> {
    const result = await db.query<{
      station_code: string;
      bucket_at: Date;
      min_kv: string;
      avg_kv: string;
      max_kv: string;
    }>(
      `SELECT station_code, bucket_at, min_kv, avg_kv, max_kv
       FROM telemetry_samples
       WHERE bucket_at >= NOW() - ($2 || ' hours')::interval
         AND ($1::text[] IS NULL OR station_code = ANY($1))
       ORDER BY bucket_at ASC`,
      [stationCodes.length > 0 ? stationCodes : null, String(sinceHours)],
    );

    return result.rows.map((row) => ({
      stationCode: row.station_code,
      bucketAt: new Date(row.bucket_at).toISOString(),
      minKV: Number(row.min_kv),
      avgKV: Number(row.avg_kv),
      maxKV: Number(row.max_kv),
    }));
  }

  /** Extremos por estação no período — alimenta a tabela de resumo do histórico. */
  public static async summary(sinceHours: number): Promise<
    Array<{ stationCode: string; minKV: number; avgKV: number; maxKV: number; buckets: number }>
  > {
    const result = await db.query<{
      station_code: string;
      min_kv: string;
      avg_kv: string;
      max_kv: string;
      buckets: string;
    }>(
      `SELECT station_code,
              MIN(min_kv)::text AS min_kv,
              AVG(avg_kv)::text AS avg_kv,
              MAX(max_kv)::text AS max_kv,
              COUNT(*)::text AS buckets
       FROM telemetry_samples
       WHERE bucket_at >= NOW() - ($1 || ' hours')::interval
       GROUP BY station_code
       ORDER BY station_code ASC`,
      [String(sinceHours)],
    );

    return result.rows.map((row) => ({
      stationCode: row.station_code,
      minKV: Number(row.min_kv),
      avgKV: Number(Number(row.avg_kv).toFixed(2)),
      maxKV: Number(row.max_kv),
      buckets: Number(row.buckets),
    }));
  }
}
