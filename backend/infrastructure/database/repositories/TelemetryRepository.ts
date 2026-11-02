// backend/infrastructure/database/repositories/TelemetryRepository.ts
import { db } from '../postgres';

export interface TelemetryBucket {
  stationCode: string;
  bucketAt: Date;
  minV: number;
  avgV: number;
  maxV: number;
  readings: number;
}

export interface HistorySample {
  stationCode: string;
  bucketAt: string;
  minV: number;
  avgV: number;
  maxV: number;
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
      values.push(bucket.stationCode, bucket.bucketAt, bucket.minV, bucket.avgV, bucket.maxV, bucket.readings);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    });

    await db.query(
      `INSERT INTO telemetry_samples (station_code, bucket_at, min_v, avg_v, max_v, readings)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (station_code, bucket_at) DO UPDATE
       SET min_v = LEAST(telemetry_samples.min_v, EXCLUDED.min_v),
           max_v = GREATEST(telemetry_samples.max_v, EXCLUDED.max_v),
           avg_v = EXCLUDED.avg_v,
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
      min_v: string;
      avg_v: string;
      max_v: string;
    }>(
      `SELECT station_code, bucket_at, min_v, avg_v, max_v
       FROM telemetry_samples
       WHERE bucket_at >= NOW() - ($2 || ' hours')::interval
         AND ($1::text[] IS NULL OR station_code = ANY($1))
       ORDER BY bucket_at ASC`,
      [stationCodes.length > 0 ? stationCodes : null, String(sinceHours)],
    );

    return result.rows.map((row) => ({
      stationCode: row.station_code,
      bucketAt: new Date(row.bucket_at).toISOString(),
      minV: Number(row.min_v),
      avgV: Number(row.avg_v),
      maxV: Number(row.max_v),
    }));
  }

  /** Extremos por estação no período — alimenta a tabela de resumo do histórico. */
  public static async summary(sinceHours: number): Promise<
    Array<{ stationCode: string; minV: number; avgV: number; maxV: number; buckets: number }>
  > {
    const result = await db.query<{
      station_code: string;
      min_v: string;
      avg_v: string;
      max_v: string;
      buckets: string;
    }>(
      `SELECT station_code,
              MIN(min_v)::text AS min_v,
              AVG(avg_v)::text AS avg_v,
              MAX(max_v)::text AS max_v,
              COUNT(*)::text AS buckets
       FROM telemetry_samples
       WHERE bucket_at >= NOW() - ($1 || ' hours')::interval
       GROUP BY station_code
       ORDER BY station_code ASC`,
      [String(sinceHours)],
    );

    return result.rows.map((row) => ({
      stationCode: row.station_code,
      minV: Number(row.min_v),
      avgV: Number(Number(row.avg_v).toFixed(1)),
      maxV: Number(row.max_v),
      buckets: Number(row.buckets),
    }));
  }
}
