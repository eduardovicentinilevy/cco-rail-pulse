// backend/infrastructure/repositories/pg-session.repository.ts
import { db } from '../database/postgres';
import type { SessionStore } from '../../application/services/AuthSessionService';
import type { AuthSessionRecord, RevocationReason } from '../../domain/entities/AuthSession';

interface SessionRow {
  id: string;
  family_id: string;
  operator_id: string;
  refresh_token_hash: string;
  created_at: Date;
  expires_at: Date;
  absolute_expires_at: Date;
  rotated_at: Date | null;
  revoked_at: Date | null;
  revoked_reason: string | null;
  ip: string | null;
  user_agent: string | null;
}

const toRecord = (row: SessionRow): AuthSessionRecord => ({
  id: row.id,
  familyId: row.family_id,
  operatorId: row.operator_id,
  refreshTokenHash: row.refresh_token_hash,
  createdAt: new Date(row.created_at),
  expiresAt: new Date(row.expires_at),
  absoluteExpiresAt: new Date(row.absolute_expires_at),
  rotatedAt: row.rotated_at ? new Date(row.rotated_at) : null,
  revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  revokedReason: row.revoked_reason,
  ip: row.ip,
  userAgent: row.user_agent,
});

const COLUMNS = `id, family_id, operator_id, refresh_token_hash, created_at, expires_at,
                 absolute_expires_at, rotated_at, revoked_at, revoked_reason, ip, user_agent`;

/** Sessões persistidas no Postgres: revogação e rotação valem para todas as instâncias. */
export class PgSessionStore implements SessionStore {
  public async insert(record: AuthSessionRecord): Promise<void> {
    await db.query(
      `INSERT INTO auth_sessions
         (id, family_id, operator_id, refresh_token_hash, created_at, expires_at, absolute_expires_at, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.id,
        record.familyId,
        record.operatorId,
        record.refreshTokenHash,
        record.createdAt,
        record.expiresAt,
        record.absoluteExpiresAt,
        record.ip,
        record.userAgent,
      ],
    );
  }

  public async findById(id: string): Promise<AuthSessionRecord | null> {
    const result = await db.query<SessionRow>(`SELECT ${COLUMNS} FROM auth_sessions WHERE id = $1`, [id]);
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  public async findByRefreshHash(hash: string): Promise<AuthSessionRecord | null> {
    const result = await db.query<SessionRow>(`SELECT ${COLUMNS} FROM auth_sessions WHERE refresh_token_hash = $1`, [hash]);
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  public async markRotated(id: string, rotatedAt: Date): Promise<void> {
    await db.query(`UPDATE auth_sessions SET rotated_at = $2 WHERE id = $1 AND rotated_at IS NULL`, [id, rotatedAt]);
  }

  public async revokeFamily(familyId: string, reason: RevocationReason, at: Date): Promise<number> {
    const result = await db.query(
      `UPDATE auth_sessions SET revoked_at = $2, revoked_reason = $3 WHERE family_id = $1 AND revoked_at IS NULL`,
      [familyId, at, reason],
    );
    return result.rowCount ?? 0;
  }

  public async revokeOperator(operatorId: string, reason: RevocationReason, at: Date): Promise<number> {
    const result = await db.query(
      `UPDATE auth_sessions SET revoked_at = $2, revoked_reason = $3 WHERE operator_id = $1 AND revoked_at IS NULL`,
      [operatorId, at, reason],
    );
    return result.rowCount ?? 0;
  }

  public async deleteExpired(now: Date): Promise<number> {
    const result = await db.query(`DELETE FROM auth_sessions WHERE absolute_expires_at <= $1`, [now]);
    return result.rowCount ?? 0;
  }
}

export const sessionStore = new PgSessionStore();
