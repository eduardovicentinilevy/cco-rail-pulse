// backend/infrastructure/repositories/pg-operator.repository.ts
import { db } from '../database/postgres';
import { createLogger } from '../../shared/logger';

const logger = createLogger('OPERATOR-REPO');

export interface OperatorEntity {
  id: string;
  name: string;
  role: string;
  password_hash: string;
  avatar_url: string | null;
  is_active: boolean;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  operatorId: string | null;
  action: string;
  target: string;
  status: string;
}

export interface AuditQuery {
  limit: number;
  offset: number;
  /** Filtro textual aplicado a operador, ação e alvo. */
  search?: string;
}

export interface AuditPage {
  items: AuditLogRecord[];
  total: number;
  limit: number;
  offset: number;
}

export class PgOperatorRepository {
  public async findById(operatorId: string): Promise<OperatorEntity | null> {
    const result = await db.query<OperatorEntity>(
      `SELECT id, name, role, password_hash, avatar_url, is_active
       FROM operators
       WHERE id = $1 AND is_active = TRUE`,
      [operatorId.trim().toUpperCase()],
    );
    return result.rows[0] ?? null;
  }

  public async updateAvatar(operatorId: string, avatarUrl: string): Promise<void> {
    await db.query(`UPDATE operators SET avatar_url = $2 WHERE id = $1`, [operatorId, avatarUrl]);
  }

  /**
   * Registra um evento na trilha de auditoria.
   * Nunca propaga erro: falhar ao auditar não pode derrubar a operação em curso.
   */
  public async logAudit(operatorId: string, action: string, target: string, status: string): Promise<void> {
    try {
      await db.query(
        `INSERT INTO audit_logs (operator_id, action, target, status) VALUES ($1, $2, $3, $4)`,
        [operatorId, action, target, status],
      );
    } catch (error) {
      logger.error('Falha ao gravar evento de auditoria.', error);
    }
  }

  public async listAudit({ limit, offset, search }: AuditQuery): Promise<AuditPage> {
    const filter = search?.trim() ? `%${search.trim()}%` : null;

    const [page, count] = await Promise.all([
      db.query(
        `SELECT id, operator_id, action, target, status, created_at
         FROM audit_logs
         WHERE $3::text IS NULL
            OR operator_id ILIKE $3 OR action ILIKE $3 OR target ILIKE $3 OR status ILIKE $3
         ORDER BY created_at DESC, id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, filter],
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total
         FROM audit_logs
         WHERE $1::text IS NULL
            OR operator_id ILIKE $1 OR action ILIKE $1 OR target ILIKE $1 OR status ILIKE $1`,
        [filter],
      ),
    ]);

    return {
      items: page.rows.map((row) => ({
        id: String(row.id),
        timestamp: new Date(row.created_at).toISOString(),
        operatorId: row.operator_id,
        action: row.action,
        target: row.target,
        status: row.status,
      })),
      total: Number(count.rows[0]?.total ?? 0),
      limit,
      offset,
    };
  }
}

export const operatorRepository = new PgOperatorRepository();
