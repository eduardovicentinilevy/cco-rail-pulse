// backend/infrastructure/database/repositories/TelemetryRepository.ts
import { db } from '../postgres';

export interface TelemetryBucket {
  /** Chave da estação na malha — a série pende da estação, não do código solto. */
  stationId: string;
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
      values.push(bucket.stationId, bucket.bucketAt, bucket.minKV, bucket.avgKV, bucket.maxKV, bucket.readings);
      return `($${base + 1}::uuid, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    });

    await db.query(
      `INSERT INTO telemetry_samples (station_id, bucket_at, min_kv, avg_kv, max_kv, readings)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (station_id, bucket_at) DO UPDATE
       SET min_kv = LEAST(telemetry_samples.min_kv, EXCLUDED.min_kv),
           max_kv = GREATEST(telemetry_samples.max_kv, EXCLUDED.max_kv),
           avg_kv = EXCLUDED.avg_kv,
           readings = telemetry_samples.readings + EXCLUDED.readings`,
      values,
    );
  }

  /**
   * Remove janelas fora do período de retenção. Retorna quantas linhas saíram.
   * A poda é por tempo e vale para todos os clientes — não há o que escopar aqui.
   */
  public static async prune(retentionDays: number): Promise<number> {
    const result = await db.query(
      `DELETE FROM telemetry_samples WHERE bucket_at < NOW() - ($1 || ' days')::interval`,
      [String(retentionDays)],
    );
    return result.rowCount ?? 0;
  }

  public static async history(lineId: string, stationCodes: string[], sinceHours: number): Promise<HistorySample[]> {
    const result = await db.query<{
      station_code: string;
      bucket_at: Date;
      min_kv: string;
      avg_kv: string;
      max_kv: string;
    }>(
      // O JOIN com stations é o que escopa a série à linha: não existe leitura
      // de telemetria que não pertença a uma estação de alguma linha.
      `SELECT s.code AS station_code, t.bucket_at, t.min_kv, t.avg_kv, t.max_kv
       FROM telemetry_samples t
       JOIN stations s ON s.id = t.station_id
       WHERE s.line_id = $1
         AND t.bucket_at >= NOW() - ($3 || ' hours')::interval
         AND ($2::text[] IS NULL OR s.code = ANY($2))
       ORDER BY t.bucket_at ASC`,
      [lineId, stationCodes.length > 0 ? stationCodes : null, String(sinceHours)],
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
  public static async summary(
    lineId: string,
    sinceHours: number,
  ): Promise<Array<{ stationCode: string; minKV: number; avgKV: number; maxKV: number; buckets: number }>> {
    const result = await db.query<{
      station_code: string;
      min_kv: string;
      avg_kv: string;
      max_kv: string;
      buckets: string;
    }>(
      `SELECT s.code AS station_code,
              MIN(t.min_kv)::text AS min_kv,
              AVG(t.avg_kv)::text AS avg_kv,
              MAX(t.max_kv)::text AS max_kv,
              COUNT(*)::text AS buckets
       FROM telemetry_samples t
       JOIN stations s ON s.id = t.station_id
       WHERE s.line_id = $1 AND t.bucket_at >= NOW() - ($2 || ' hours')::interval
       GROUP BY s.code
       ORDER BY s.code ASC`,
      [lineId, String(sinceHours)],
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
