// backend/infrastructure/database/repositories/TelemetryRepository.ts
import { db } from '../postgres';

export interface TelemetryBucket {
  /** Chave da estação na malha — a série pende da estação, não do código solto. */
  stationId: string;
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
      values.push(bucket.stationId, bucket.bucketAt, bucket.minV, bucket.avgV, bucket.maxV, bucket.readings);
      return `($${base + 1}::uuid, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    });

    await db.query(
      `INSERT INTO telemetry_samples (station_id, bucket_at, min_v, avg_v, max_v, readings)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (station_id, bucket_at) DO UPDATE
       SET min_v = LEAST(telemetry_samples.min_v, EXCLUDED.min_v),
           max_v = GREATEST(telemetry_samples.max_v, EXCLUDED.max_v),
           avg_v = EXCLUDED.avg_v,
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
      min_v: string;
      avg_v: string;
      max_v: string;
    }>(
      // O JOIN com stations é o que escopa a série à linha: não existe leitura
      // de telemetria que não pertença a uma estação de alguma linha.
      `SELECT s.code AS station_code, t.bucket_at, t.min_v, t.avg_v, t.max_v
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
      minV: Number(row.min_v),
      avgV: Number(row.avg_v),
      maxV: Number(row.max_v),
    }));
  }

  /** Extremos por estação no período — alimenta a tabela de resumo do histórico. */
  public static async summary(
    lineId: string,
    sinceHours: number,
  ): Promise<Array<{ stationCode: string; minV: number; avgV: number; maxV: number; buckets: number }>> {
    const result = await db.query<{
      station_code: string;
      min_v: string;
      avg_v: string;
      max_v: string;
      buckets: string;
    }>(
      `SELECT s.code AS station_code,
              MIN(t.min_v)::text AS min_v,
              AVG(t.avg_v)::text AS avg_v,
              MAX(t.max_v)::text AS max_v,
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
      minV: Number(row.min_v),
      avgV: Number(Number(row.avg_v).toFixed(1)),
      maxV: Number(row.max_v),
      buckets: Number(row.buckets),
    }));
  }
}
