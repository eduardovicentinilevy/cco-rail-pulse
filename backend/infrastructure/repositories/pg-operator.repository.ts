// backend/infrastructure/repositories/pg-operator.repository.ts
import type { PoolClient } from 'pg';
import { db } from '../database/postgres';
import { createLogger } from '../../shared/logger';

const logger = createLogger('OPERATOR-REPO');

export interface OperatorEntity {
  /** Chave interna (UUID). Nunca sai do backend. */
  id: string;
  tenant_id: string;
  /** Crachá digitado no login, único dentro do cliente. Ex.: 'EDP-042'. */
  login_id: string;
  name: string;
  role: string;
  password_hash: string;
  avatar_url: string | null;
  is_active: boolean;
  mfa_secret: string | null;
  mfa_enabled: boolean;
  mfa_last_used_step: string | null;
}

/** Projeção pública do operador — nunca carrega o hash da senha nem o id interno. */
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
  tenantId: string;
  credential: string;
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
  tenantId: string;
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

export interface AuditEvent {
  tenantId: string;
  /** Crachá do operador, não o id interno: a trilha é lida por humanos. */
  credential: string;
  action: string;
  target: string;
  status: string;
}

const ENTITY_COLUMNS = `
  id, tenant_id, login_id, name, role, password_hash, avatar_url, is_active,
  mfa_secret, mfa_enabled, mfa_last_used_step
`;

/**
 * Cadastro de operadores.
 *
 * Todo método recebe `tenantId` explicitamente, em vez de ler de um contexto
 * implícito: um filtro esquecido aqui é vazamento de dados entre clientes, e
 * parâmetro obrigatório o compilador cobra.
 */
export class PgOperatorRepository {
  /** Busca pelo crachá dentro do cliente — o caminho do login. */
  public async findByCredential(tenantId: string, credential: string): Promise<OperatorEntity | null> {
    const result = await db.query<OperatorEntity>(
      `SELECT ${ENTITY_COLUMNS} FROM operators
       WHERE tenant_id = $1 AND login_id = $2 AND is_active = TRUE`,
      [tenantId, credential.trim().toUpperCase()],
    );
    return result.rows[0] ?? null;
  }

  /** Busca pela chave interna — o caminho de toda requisição já autenticada. */
  public async findById(tenantId: string, operatorId: string): Promise<OperatorEntity | null> {
    const result = await db.query<OperatorEntity>(
      `SELECT ${ENTITY_COLUMNS} FROM operators
       WHERE tenant_id = $1 AND id = $2 AND is_active = TRUE`,
      [tenantId, operatorId],
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
   * Cadastro completo da equipe do cliente, com o último login trazido da trilha
   * de auditoria por LATERAL — evita N+1 e mantém a leitura em uma única ida ao banco.
   */
  public async listAll(tenantId: string): Promise<OperatorProfile[]> {
    const result = await db.query<{
      login_id: string;
      name: string;
      role: string;
      avatar_url: string | null;
      is_active: boolean;
      created_at: Date;
      last_login_at: Date | null;
    }>(
      `SELECT o.login_id, o.name, o.role, o.avatar_url, o.is_active, o.created_at,
              last_login.created_at AS last_login_at
       FROM operators o
       LEFT JOIN LATERAL (
         SELECT created_at
         FROM audit_logs
         WHERE tenant_id = o.tenant_id AND operator_id = o.login_id AND action = 'LOGIN_SUCCESS'
         ORDER BY created_at DESC
         LIMIT 1
       ) AS last_login ON TRUE
       WHERE o.tenant_id = $1
       ORDER BY o.is_active DESC, o.login_id ASC`,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.login_id,
      name: row.name,
      role: row.role,
      avatarUrl: row.avatar_url,
      isActive: row.is_active,
      createdAt: new Date(row.created_at).toISOString(),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    }));
  }

  public async exists(tenantId: string, credential: string): Promise<boolean> {
    const result = await db.query(`SELECT 1 FROM operators WHERE tenant_id = $1 AND login_id = $2`, [
      tenantId,
      credential,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  public async create(input: CreateOperatorInput): Promise<void> {
    await db.query(
      `INSERT INTO operators (tenant_id, login_id, name, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [input.tenantId, input.credential, input.name, input.role, input.passwordHash],
    );
  }

  public async updateRole(tenantId: string, credential: string, role: string): Promise<void> {
    await db.query(`UPDATE operators SET role = $3 WHERE tenant_id = $1 AND login_id = $2`, [
      tenantId,
      credential,
      role,
    ]);
  }

  /**
   * Devolve a chave interna da linha alterada: quem desativa precisa dela para
   * derrubar o socket já aberto, e o crachá sozinho não identifica o operador
   * fora do cliente.
   */
  public async setActive(tenantId: string, credential: string, isActive: boolean): Promise<string | null> {
    const result = await db.query<{ id: string }>(
      `UPDATE operators SET is_active = $3 WHERE tenant_id = $1 AND login_id = $2 RETURNING id`,
      [tenantId, credential, isActive],
    );
    return result.rows[0]?.id ?? null;
  }

  /** Nomes por crachá, usados para exibir responsáveis sem um segundo round-trip. */
  public async namesByCredential(tenantId: string): Promise<Map<string, string>> {
    const result = await db.query<{ login_id: string; name: string }>(
      `SELECT login_id, name FROM operators WHERE tenant_id = $1`,
      [tenantId],
    );
    return new Map(result.rows.map((row) => [row.login_id, row.name]));
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
  /**
   * Grava um evento na trilha.
   *
   * Sem `client`, é fail-open: uma falha de log nunca derruba a operação que a
   * gerou, que é o comportamento usado em todo o resto do app. Com `client`, a
   * escrita entra na transação de quem chamou e o erro é propagado de propósito
   * — lá a trilha faz parte da atomicidade da operação.
   */
  public async logAudit(
    { tenantId, credential, action, target, status }: AuditEvent,
    client?: Pick<PoolClient, 'query'>,
  ): Promise<void> {
    const query = `INSERT INTO audit_logs (tenant_id, operator_id, action, target, status) VALUES ($1, $2, $3, $4, $5)`;
    const params = [tenantId, credential, action, target, status];

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

  public async listAudit({ tenantId, limit, offset, search }: AuditQuery): Promise<AuditPage> {
    const filter = search?.trim() ? `%${search.trim()}%` : null;

    const [page, count] = await Promise.all([
      db.query(
        `SELECT id, operator_id, action, target, status, created_at
         FROM audit_logs
         WHERE tenant_id = $1
           AND ($4::text IS NULL
                OR operator_id ILIKE $4 OR action ILIKE $4 OR target ILIKE $4 OR status ILIKE $4)
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset, filter],
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total
         FROM audit_logs
         WHERE tenant_id = $1
           AND ($2::text IS NULL
                OR operator_id ILIKE $2 OR action ILIKE $2 OR target ILIKE $2 OR status ILIKE $2)`,
        [tenantId, filter],
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
