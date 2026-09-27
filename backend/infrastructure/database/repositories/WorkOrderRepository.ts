// backend/infrastructure/database/repositories/WorkOrderRepository.ts
import { db } from '../postgres';
import { WorkOrder } from '../../../domain/entities/WorkOrder';
import type { WorkOrderCategory, WorkOrderPriority, WorkOrderStatus } from '../../../domain/entities/WorkOrder';

interface WorkOrderRow {
  id: number | string;
  title: string;
  description: string;
  asset_code: string | null;
  station_code: string | null;
  category: string;
  priority: string;
  status: string;
  opened_by: string;
  assigned_to: string | null;
  completion_note: string | null;
  opened_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  due_at: Date | null;
}

const toEntity = (row: WorkOrderRow): WorkOrder =>
  new WorkOrder(
    String(row.id),
    row.title,
    row.description,
    row.asset_code,
    row.station_code,
    row.category as WorkOrderCategory,
    row.priority as WorkOrderPriority,
    row.status as WorkOrderStatus,
    row.opened_by,
    row.assigned_to,
    row.completion_note,
    new Date(row.opened_at),
    new Date(row.updated_at),
    row.completed_at ? new Date(row.completed_at) : null,
    row.due_at ? new Date(row.due_at) : null,
  );

export interface CreateWorkOrderInput {
  title: string;
  description: string;
  assetCode: string | null;
  stationCode: string | null;
  category: WorkOrderCategory;
  priority: WorkOrderPriority;
  openedBy: string;
  assignedTo: string | null;
  dueAt: Date | null;
}

export interface WorkOrderQuery {
  limit: number;
  offset: number;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  search?: string;
}

export interface WorkOrderPage {
  items: WorkOrder[];
  total: number;
  limit: number;
  offset: number;
}

export interface WorkOrderStats {
  open: number;
  inProgress: number;
  completed: number;
  overdue: number;
  /** Tempo médio de conclusão em minutos, sobre OSs já concluídas. */
  averageCompletionMinutes: number | null;
}

const SELECT_COLUMNS = `
  id, title, description, asset_code, station_code, category, priority, status,
  opened_by, assigned_to, completion_note, opened_at, updated_at, completed_at, due_at
`;

export class WorkOrderRepository {
  public static async create(input: CreateWorkOrderInput): Promise<WorkOrder> {
    const result = await db.query<WorkOrderRow>(
      `INSERT INTO work_orders
         (title, description, asset_code, station_code, category, priority, status, opened_by, assigned_to, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ABERTA', $7, $8, $9)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.title,
        input.description,
        input.assetCode,
        input.stationCode,
        input.category,
        input.priority,
        input.openedBy,
        input.assignedTo,
        input.dueAt,
      ],
    );
    return toEntity(result.rows[0]);
  }

  public static async findById(id: string): Promise<WorkOrder | null> {
    const numericId = Number.parseInt(id, 10);
    if (!Number.isFinite(numericId)) return null;

    const result = await db.query<WorkOrderRow>(`SELECT ${SELECT_COLUMNS} FROM work_orders WHERE id = $1`, [numericId]);
    return result.rows[0] ? toEntity(result.rows[0]) : null;
  }

  public static async list({ limit, offset, status, priority, search }: WorkOrderQuery): Promise<WorkOrderPage> {
    const filter = search?.trim() ? `%${search.trim()}%` : null;

    const whereClause = (statusParam: number, priorityParam: number, searchParam: number) => `
      ($${statusParam}::text IS NULL OR status = $${statusParam})
      AND ($${priorityParam}::text IS NULL OR priority = $${priorityParam})
      AND (
        $${searchParam}::text IS NULL
        OR title ILIKE $${searchParam}
        OR description ILIKE $${searchParam}
        OR asset_code ILIKE $${searchParam}
        OR station_code ILIKE $${searchParam}
      )
    `;

    const [page, count] = await Promise.all([
      db.query<WorkOrderRow>(
        `SELECT ${SELECT_COLUMNS} FROM work_orders
         WHERE ${whereClause(3, 4, 5)}
         ORDER BY
           CASE status WHEN 'ABERTA' THEN 0 WHEN 'EM_ANDAMENTO' THEN 1 ELSE 2 END,
           CASE priority WHEN 'URGENTE' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'MÉDIA' THEN 2 ELSE 3 END,
           opened_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, status ?? null, priority ?? null, filter],
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM work_orders WHERE ${whereClause(1, 2, 3)}`,
        [status ?? null, priority ?? null, filter],
      ),
    ]);

    return {
      items: page.rows.map(toEntity),
      total: Number(count.rows[0]?.total ?? 0),
      limit,
      offset,
    };
  }

  public static async save(workOrder: WorkOrder): Promise<void> {
    await db.query(
      `UPDATE work_orders
       SET status = $2, priority = $3, assigned_to = $4, completion_note = $5, updated_at = $6, completed_at = $7
       WHERE id = $1`,
      [
        Number(workOrder.id),
        workOrder.status,
        workOrder.priority,
        workOrder.assignedTo,
        workOrder.completionNote,
        workOrder.updatedAt,
        workOrder.completedAt,
      ],
    );
  }

  public static async stats(): Promise<WorkOrderStats> {
    const result = await db.query<{
      open: string;
      in_progress: string;
      completed: string;
      overdue: string;
      avg_minutes: string | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'ABERTA')::text AS open,
         COUNT(*) FILTER (WHERE status = 'EM_ANDAMENTO')::text AS in_progress,
         COUNT(*) FILTER (WHERE status = 'CONCLUÍDA')::text AS completed,
         COUNT(*) FILTER (WHERE due_at IS NOT NULL AND due_at < NOW() AND status IN ('ABERTA', 'EM_ANDAMENTO'))::text AS overdue,
         AVG(EXTRACT(EPOCH FROM (completed_at - opened_at)) / 60)
           FILTER (WHERE completed_at IS NOT NULL)::text AS avg_minutes
       FROM work_orders`,
    );

    const row = result.rows[0];
    return {
      open: Number(row?.open ?? 0),
      inProgress: Number(row?.in_progress ?? 0),
      completed: Number(row?.completed ?? 0),
      overdue: Number(row?.overdue ?? 0),
      averageCompletionMinutes: row?.avg_minutes == null ? null : Math.round(Number(row.avg_minutes)),
    };
  }
}
