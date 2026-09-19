// backend/infrastructure/database/repositories/AlarmRepository.ts
import { db } from '../postgres';
import type { AlarmSeverity, AlarmSnapshot } from '../../../domain/alarms';

interface AlarmRow {
  id: number;
  severity: string;
  message: string;
  created_at: Date;
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
}

const toSnapshot = (row: AlarmRow): AlarmSnapshot => ({
  id: String(row.id),
  severity: row.severity as AlarmSeverity,
  message: row.message,
  createdAt: row.created_at.toISOString(),
  acknowledgedBy: row.acknowledged_by,
  acknowledgedAt: row.acknowledged_at ? row.acknowledged_at.toISOString() : null,
});

export interface CreateAlarmInput {
  lineId: string;
  severity: AlarmSeverity;
  message: string;
}

export interface AlarmQuery {
  lineId: string;
  limit: number;
  offset: number;
  severity?: AlarmSeverity;
  /** `true` filtra só as pendentes, `false` só as reconhecidas; ausente traz todas. */
  acknowledged?: boolean;
  search?: string;
}

export interface AlarmPage {
  items: AlarmSnapshot[];
  total: number;
  limit: number;
  offset: number;
}

export interface AlarmStats {
  total: number;
  unacknowledged: number;
  criticalUnacknowledged: number;
  last24h: number;
}

const SELECT_COLUMNS = 'id, severity, message, created_at, acknowledged_by, acknowledged_at';

export class AlarmRepository {
  public static async create(input: CreateAlarmInput): Promise<AlarmSnapshot> {
    const result = await db.query<AlarmRow>(
      `INSERT INTO alarms (line_id, severity, message) VALUES ($1, $2, $3) RETURNING ${SELECT_COLUMNS}`,
      [input.lineId, input.severity, input.message],
    );
    return toSnapshot(result.rows[0]);
  }

  public static async list({ lineId, limit, offset, severity, acknowledged, search }: AlarmQuery): Promise<AlarmPage> {
    const filter = search?.trim() ? `%${search.trim()}%` : null;

    const whereClause = (lineParam: number, severityParam: number, ackParam: number, searchParam: number) => `
      line_id = $${lineParam}
      AND ($${severityParam}::text IS NULL OR severity = $${severityParam})
      AND (
        $${ackParam}::boolean IS NULL
        OR ($${ackParam}::boolean IS TRUE AND acknowledged_at IS NOT NULL)
        OR ($${ackParam}::boolean IS FALSE AND acknowledged_at IS NULL)
      )
      AND ($${searchParam}::text IS NULL OR message ILIKE $${searchParam})
    `;

    const [page, count] = await Promise.all([
      db.query<AlarmRow>(
        `SELECT ${SELECT_COLUMNS} FROM alarms
         WHERE ${whereClause(3, 4, 5, 6)}
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, lineId, severity ?? null, acknowledged ?? null, filter],
      ),
      db.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM alarms WHERE ${whereClause(1, 2, 3, 4)}`, [
        lineId,
        severity ?? null,
        acknowledged ?? null,
        filter,
      ]),
    ]);

    return {
      items: page.rows.map(toSnapshot),
      total: Number(count.rows[0]?.total ?? 0),
      limit,
      offset,
    };
  }

  /**
   * O id do alarme é sequencial e compartilhado entre clientes, então a linha
   * entra no WHERE: sem ela, um id chutado reconheceria o alarme de outro.
   */
  public static async acknowledge(lineId: string, id: string, credential: string): Promise<AlarmSnapshot | null> {
    const numericId = Number.parseInt(id, 10);
    if (!Number.isFinite(numericId)) return null;

    const result = await db.query<AlarmRow>(
      `UPDATE alarms SET acknowledged_by = $3, acknowledged_at = NOW()
       WHERE id = $1 AND line_id = $2 AND acknowledged_at IS NULL
       RETURNING ${SELECT_COLUMNS}`,
      [numericId, lineId, credential],
    );
    return result.rows[0] ? toSnapshot(result.rows[0]) : null;
  }

  public static async stats(lineId: string): Promise<AlarmStats> {
    const result = await db.query<{
      total: string;
      unacknowledged: string;
      critical_unacknowledged: string;
      last_24h: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE acknowledged_at IS NULL)::text AS unacknowledged,
         COUNT(*) FILTER (WHERE acknowledged_at IS NULL AND severity = 'CRITICAL')::text AS critical_unacknowledged,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::text AS last_24h
       FROM alarms
       WHERE line_id = $1`,
      [lineId],
    );

    const row = result.rows[0];
    return {
      total: Number(row?.total ?? 0),
      unacknowledged: Number(row?.unacknowledged ?? 0),
      criticalUnacknowledged: Number(row?.critical_unacknowledged ?? 0),
      last24h: Number(row?.last_24h ?? 0),
    };
  }
}
