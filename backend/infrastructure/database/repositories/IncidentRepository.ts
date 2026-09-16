// backend/infrastructure/database/repositories/IncidentRepository.ts
import { db } from '../postgres';
import { Incident } from '../../../domain/entities/Incident';
import type {
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
} from '../../../domain/entities/Incident';

interface IncidentRow {
  id: number | string;
  title: string;
  description: string;
  station_code: string | null;
  train_id: string | null;
  category: string;
  severity: string;
  status: string;
  opened_by: string;
  assigned_to: string | null;
  resolution_note: string | null;
  opened_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

const toEntity = (row: IncidentRow): Incident =>
  new Incident(
    String(row.id),
    row.title,
    row.description,
    row.station_code,
    row.train_id,
    row.category as IncidentCategory,
    row.severity as IncidentSeverity,
    row.status as IncidentStatus,
    row.opened_by,
    row.assigned_to,
    row.resolution_note,
    new Date(row.opened_at),
    new Date(row.updated_at),
    row.resolved_at ? new Date(row.resolved_at) : null,
  );

export interface CreateIncidentInput {
  title: string;
  description: string;
  stationCode: string | null;
  trainId: string | null;
  category: IncidentCategory;
  severity: IncidentSeverity;
  openedBy: string;
  assignedTo: string | null;
}

export interface IncidentQuery {
  limit: number;
  offset: number;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  search?: string;
}

export interface IncidentPage {
  items: Incident[];
  total: number;
  limit: number;
  offset: number;
}

export interface IncidentStats {
  open: number;
  inProgress: number;
  resolved: number;
  critical: number;
  /** Tempo médio de resolução (MTTR) em minutos, sobre ocorrências já resolvidas. */
  averageResolutionMinutes: number | null;
}

const SELECT_COLUMNS = `
  id, title, description, station_code, train_id, category, severity, status,
  opened_by, assigned_to, resolution_note, opened_at, updated_at, resolved_at
`;

export class IncidentRepository {
  public static async create(input: CreateIncidentInput): Promise<Incident> {
    const result = await db.query<IncidentRow>(
      `INSERT INTO incidents
         (title, description, station_code, train_id, category, severity, status, opened_by, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, 'ABERTA', $7, $8)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.title,
        input.description,
        input.stationCode,
        input.trainId,
        input.category,
        input.severity,
        input.openedBy,
        input.assignedTo,
      ],
    );
    return toEntity(result.rows[0]);
  }

  public static async findById(id: string): Promise<Incident | null> {
    // O id é SERIAL: uma entrada não numérica nunca casa e não deve chegar ao banco.
    const numericId = Number.parseInt(id, 10);
    if (!Number.isFinite(numericId)) return null;

    const result = await db.query<IncidentRow>(`SELECT ${SELECT_COLUMNS} FROM incidents WHERE id = $1`, [numericId]);
    return result.rows[0] ? toEntity(result.rows[0]) : null;
  }

  public static async list({ limit, offset, status, severity, search }: IncidentQuery): Promise<IncidentPage> {
    const filter = search?.trim() ? `%${search.trim()}%` : null;

    /** Monta o filtro com os índices de parâmetro que cada consulta usa. */
    const whereClause = (statusParam: number, severityParam: number, searchParam: number) => `
      ($${statusParam}::text IS NULL OR status = $${statusParam})
      AND ($${severityParam}::text IS NULL OR severity = $${severityParam})
      AND (
        $${searchParam}::text IS NULL
        OR title ILIKE $${searchParam}
        OR description ILIKE $${searchParam}
        OR station_code ILIKE $${searchParam}
        OR train_id ILIKE $${searchParam}
      )
    `;

    const [page, count] = await Promise.all([
      db.query<IncidentRow>(
        `SELECT ${SELECT_COLUMNS} FROM incidents
         WHERE ${whereClause(3, 4, 5)}
         ORDER BY
           CASE status WHEN 'ABERTA' THEN 0 WHEN 'EM_ANDAMENTO' THEN 1 ELSE 2 END,
           CASE severity WHEN 'CRÍTICA' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'MÉDIA' THEN 2 ELSE 3 END,
           opened_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, status ?? null, severity ?? null, filter],
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM incidents WHERE ${whereClause(1, 2, 3)}`,
        [status ?? null, severity ?? null, filter],
      ),
    ]);

    return {
      items: page.rows.map(toEntity),
      total: Number(count.rows[0]?.total ?? 0),
      limit,
      offset,
    };
  }

  public static async save(incident: Incident): Promise<void> {
    await db.query(
      `UPDATE incidents
       SET status = $2, severity = $3, assigned_to = $4, resolution_note = $5, updated_at = $6, resolved_at = $7
       WHERE id = $1`,
      [
        Number(incident.id),
        incident.status,
        incident.severity,
        incident.assignedTo,
        incident.resolutionNote,
        incident.updatedAt,
        incident.resolvedAt,
      ],
    );
  }

  public static async stats(): Promise<IncidentStats> {
    const result = await db.query<{
      open: string;
      in_progress: string;
      resolved: string;
      critical: string;
      avg_minutes: string | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'ABERTA')::text AS open,
         COUNT(*) FILTER (WHERE status = 'EM_ANDAMENTO')::text AS in_progress,
         COUNT(*) FILTER (WHERE status = 'RESOLVIDA')::text AS resolved,
         COUNT(*) FILTER (WHERE severity = 'CRÍTICA' AND status <> 'RESOLVIDA')::text AS critical,
         AVG(EXTRACT(EPOCH FROM (resolved_at - opened_at)) / 60)
           FILTER (WHERE resolved_at IS NOT NULL)::text AS avg_minutes
       FROM incidents`,
    );

    const row = result.rows[0];
    return {
      open: Number(row?.open ?? 0),
      inProgress: Number(row?.in_progress ?? 0),
      resolved: Number(row?.resolved ?? 0),
      critical: Number(row?.critical ?? 0),
      averageResolutionMinutes: row?.avg_minutes == null ? null : Math.round(Number(row.avg_minutes)),
    };
  }
}
