// backend/infrastructure/auth/in-memory-session.store.ts
import type { SessionStore } from '../../application/services/AuthSessionService';
import type { AuthSessionRecord, RevocationReason } from '../../domain/entities/AuthSession';

/**
 * Implementação de referência da porta de sessões, usada pelos testes e por
 * execuções de processo único sem banco. Não serve a mais de uma instância —
 * em produção o store é o Postgres.
 */
export class InMemorySessionStore implements SessionStore {
  private readonly records = new Map<string, AuthSessionRecord>();

  public async insert(record: AuthSessionRecord): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  public async findById(id: string): Promise<AuthSessionRecord | null> {
    const record = this.records.get(id);
    return record ? { ...record } : null;
  }

  public async findByRefreshHash(hash: string): Promise<AuthSessionRecord | null> {
    for (const record of this.records.values()) {
      if (record.refreshTokenHash === hash) return { ...record };
    }
    return null;
  }

  public async markRotated(id: string, rotatedAt: Date): Promise<void> {
    const record = this.records.get(id);
    if (record) record.rotatedAt = rotatedAt;
  }

  public async revokeFamily(familyId: string, reason: RevocationReason, at: Date): Promise<number> {
    return this.revokeWhere((record) => record.familyId === familyId, reason, at);
  }

  public async revokeOperator(operatorId: string, reason: RevocationReason, at: Date): Promise<number> {
    return this.revokeWhere((record) => record.operatorId === operatorId, reason, at);
  }

  public async deleteExpired(now: Date): Promise<number> {
    let removed = 0;
    for (const [id, record] of this.records) {
      if (record.absoluteExpiresAt.getTime() <= now.getTime()) {
        this.records.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  /** Só para inspeção em testes. */
  public get size(): number {
    return this.records.size;
  }

  private revokeWhere(predicate: (record: AuthSessionRecord) => boolean, reason: RevocationReason, at: Date): number {
    let revoked = 0;
    for (const record of this.records.values()) {
      if (record.revokedAt === null && predicate(record)) {
        record.revokedAt = at;
        record.revokedReason = reason;
        revoked += 1;
      }
    }
    return revoked;
  }
}
