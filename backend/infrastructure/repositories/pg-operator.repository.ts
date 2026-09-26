// backend/infrastructure/repositories/pg-operator.repository.ts
import type { PoolClient } from 'pg';
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
  mfa_secret: string | null;
  mfa_enabled: boolean;
  mfa_last_used_step: string | null;
}

/** Projeção pública do operador — nunca carrega o hash da senha. */
export interface OperatorProfile {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
  /** Último login bem-sucedido, derivado da trilha de auditoria. */
  lastLoginAt: string | null;
}

export interface CreateOperatorInput {
  id: string;
  name: string;
  role: string;
  passwordHash: string;
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
      `SELECT id, name, role, password_hash, avatar_url, is_active, mfa_secret, mfa_enabled, mfa_last_used_step
       FROM operators
       WHERE id = $1 AND is_active = TRUE`,
      [operatorId.trim().toUpperCase()],
    );
    return result.rows[0] ?? null;
  }

  public async updateAvatar(operatorId: string, avatarUrl: string): Promise<void> {
    await db.query(`UPDATE operators SET avatar_url = $2 WHERE id = $1`, [operatorId, avatarUrl]);
  }

  // --- Autenticação em duas etapas (2FA/TOTP) -------------------------------

  /** Grava um segredo pendente de confirmação — o 2FA só passa a ser exigido após `confirmMfa`. */
  public async setPendingMfaSecret(operatorId: string, secret: string): Promise<void> {
    await db.query(`UPDATE operators SET mfa_secret = $2, mfa_enabled = FALSE WHERE id = $1`, [operatorId, secret]);
  }

  public async confirmMfa(operatorId: string): Promise<void> {
    await db.query(`UPDATE operators SET mfa_enabled = TRUE WHERE id = $1`, [operatorId]);
  }

  public async disableMfa(operatorId: string): Promise<void> {
    await db.query(
      `UPDATE operators SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_last_used_step = NULL WHERE id = $1`,
      [operatorId],
    );
  }

  /** Registra o passo TOTP aceito — qualquer código de passo igual ou anterior passa a ser recusado. */
  public async setMfaLastUsedStep(operatorId: string, step: number): Promise<void> {
    await db.query(`UPDATE operators SET mfa_last_used_step = $2 WHERE id = $1`, [operatorId, step]);
  }

  /**
   * Cadastro completo da equipe, com o último login trazido da trilha de auditoria
   * por LATERAL — evita N+1 e mantém a leitura em uma única ida ao banco.
   */
  public async listAll(): Promise<OperatorProfile[]> {
    const result = await db.query<{
      id: string;
      name: string;
      role: string;
      avatar_url: string | null;
      is_active: boolean;
      created_at: Date;
      last_login_at: Date | null;
    }>(
      `SELECT o.id, o.name, o.role, o.avatar_url, o.is_active, o.created_at, last_login.created_at AS last_login_at
       FROM operators o
       LEFT JOIN LATERAL (
         SELECT created_at
         FROM audit_logs
         WHERE operator_id = o.id AND action = 'LOGIN_SUCCESS'
         ORDER BY created_at DESC
         LIMIT 1
       ) AS last_login ON TRUE
       ORDER BY o.is_active DESC, o.id ASC`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      avatarUrl: row.avatar_url,
      isActive: row.is_active,
      createdAt: new Date(row.created_at).toISOString(),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    }));
  }

  public async exists(operatorId: string): Promise<boolean> {
    const result = await db.query(`SELECT 1 FROM operators WHERE id = $1`, [operatorId]);
    return (result.rowCount ?? 0) > 0;
  }

  public async create(input: CreateOperatorInput): Promise<void> {
    await db.query(
      `INSERT INTO operators (id, name, role, password_hash, is_active) VALUES ($1, $2, $3, $4, TRUE)`,
      [input.id, input.name, input.role, input.passwordHash],
    );
  }

  public async updateRole(operatorId: string, role: string): Promise<void> {
    await db.query(`UPDATE operators SET role = $2 WHERE id = $1`, [operatorId, role]);
  }

  public async setActive(operatorId: string, isActive: boolean): Promise<void> {
    await db.query(`UPDATE operators SET is_active = $2 WHERE id = $1`, [operatorId, isActive]);
  }

  /** Nomes por id, usados para exibir responsáveis sem um segundo round-trip. */
  public async namesById(): Promise<Map<string, string>> {
    const result = await db.query<{ id: string; name: string }>(`SELECT id, name FROM operators`);
    return new Map(result.rows.map((row) => [row.id, row.name]));
  }

  /**
   * Registra um evento na trilha de auditoria.
   *
   * Sem `client`: nunca propaga erro — falhar ao auditar não pode derrubar a operação
   * em curso (uso normal, fora de transação). Com `client`: roda dentro da transação do
   * chamador e propaga qualquer erro de propósito — usado por comandos de segurança
   * (ex.: comandos de trem sob lock pessimista) onde a auditoria faz parte da atomicidade
   * da operação: ou o estado e o registro persistem juntos, ou nenhum dos dois persiste.
   */
  public async logAudit(
    operatorId: string,
    action: string,
    target: string,
    status: string,
    client?: Pick<PoolClient, 'query'>,
  ): Promise<void> {
    const query = `INSERT INTO audit_logs (operator_id, action, target, status) VALUES ($1, $2, $3, $4)`;
    const params = [operatorId, action, target, status];

    if (client) {
      await client.query(query, params);
      return;
    }

    try {
      await db.query(query, params);
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
