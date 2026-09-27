// backend/application/services/AuthSessionService.ts
import crypto from 'crypto';
import { isRefreshUsable, isSessionUsable, REVOCATION_REASONS } from '../../domain/entities/AuthSession';
import type { AuthSessionRecord, RevocationReason } from '../../domain/entities/AuthSession';
import { generateRefreshToken, hashRefreshToken } from '../../shared/refresh-token';
import { signOperatorToken } from '../../shared/jwt';
import { UnauthorizedError } from '../../shared/errors';

/** Porta de persistência das sessões — implementada em Postgres e em memória. */
export interface SessionStore {
  insert(record: AuthSessionRecord): Promise<void>;
  findById(id: string): Promise<AuthSessionRecord | null>;
  findByRefreshHash(hash: string): Promise<AuthSessionRecord | null>;
  markRotated(id: string, rotatedAt: Date): Promise<void>;
  revokeFamily(familyId: string, reason: RevocationReason, at: Date): Promise<number>;
  revokeOperator(operatorId: string, reason: RevocationReason, at: Date): Promise<number>;
  deleteExpired(now: Date): Promise<number>;
}

/** Consulta do operador na renovação: devolve `null` para credencial inexistente ou inativa. */
export type OperatorLookup = (operatorId: string) => Promise<{ id: string; role: string } | null>;

export interface SessionMetadata {
  ip?: string | null;
  userAgent?: string | null;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  /** Validade do access token, em segundos — o cliente usa isso para agendar a renovação. */
  expiresIn: number;
  sessionId: string;
  operatorId: string;
  role: string;
  refreshExpiresAt: Date;
}

export interface AuthSessionServiceOptions {
  accessTokenTtlMs: number;
  refreshTtlMs: number;
  absoluteTtlMs: number;
  /**
   * Janela em que reapresentar um refresh token recém-rotacionado é tratado como
   * corrida entre abas do mesmo operador — recusado, mas sem derrubar a sessão.
   * Passada essa janela, o reuso é tratado como token vazado.
   */
  reuseGraceMs?: number;
  now?: () => Date;
}

const invalidRefresh = (): never => {
  throw new UnauthorizedError('Sessão inválida ou expirada. Autentique-se novamente.');
};

/**
 * Emissão, renovação e revogação de sessões.
 *
 * O access token é curto e assinado; o refresh token é opaco, guardado apenas
 * como hash e rotacionado a cada uso. Revogar é uma escrita no banco, então vale
 * imediatamente para todas as instâncias — inclusive para access tokens ainda
 * dentro da validade, já que o middleware confere a sessão a cada requisição.
 */
export class AuthSessionService {
  private readonly now: () => Date;

  constructor(
    private readonly store: SessionStore,
    private readonly lookupOperator: OperatorLookup,
    private readonly options: AuthSessionServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async issue(operator: { id: string; role: string }, meta: SessionMetadata = {}): Promise<IssuedSession> {
    const now = this.now();
    const familyId = crypto.randomUUID();
    const absoluteExpiresAt = new Date(now.getTime() + this.options.absoluteTtlMs);

    return this.persist({
      familyId,
      operatorId: operator.id,
      role: operator.role,
      now,
      absoluteExpiresAt,
      meta,
    });
  }

  /**
   * Troca o refresh token por um par novo.
   *
   * Um token já rotacionado sendo apresentado de novo significa que alguém ficou
   * com uma cópia: a família inteira é revogada, derrubando tanto o atacante
   * quanto o cliente legítimo — que então refaz o login.
   */
  public async refresh(refreshToken: string, meta: SessionMetadata = {}): Promise<IssuedSession> {
    const now = this.now();
    const session = await this.store.findByRefreshHash(hashRefreshToken(refreshToken));

    if (!session) return invalidRefresh();

    if (session.rotatedAt !== null && session.revokedAt === null) {
      const grace = this.options.reuseGraceMs ?? 0;
      const sinceRotation = now.getTime() - session.rotatedAt.getTime();

      // Duas abas renovando ao mesmo tempo apresentam o mesmo token: a perdedora
      // leva 401 e reaproveita o par que a vencedora já gravou.
      if (grace > 0 && sinceRotation <= grace) return invalidRefresh();

      await this.store.revokeFamily(session.familyId, REVOCATION_REASONS.refreshReuse, now);
      throw new UnauthorizedError('Sessão encerrada por reuso de credencial de renovação. Autentique-se novamente.');
    }

    if (!isRefreshUsable(session, now)) return invalidRefresh();

    // A renovação reconfere o cadastro: operador desativado ou rebaixado não
    // continua com o perfil antigo só porque a sessão segue viva.
    const operator = await this.lookupOperator(session.operatorId);
    if (!operator) {
      await this.store.revokeFamily(session.familyId, REVOCATION_REASONS.operatorDisabled, now);
      return invalidRefresh();
    }

    await this.store.markRotated(session.id, now);

    return this.persist({
      familyId: session.familyId,
      operatorId: operator.id,
      role: operator.role,
      now,
      absoluteExpiresAt: session.absoluteExpiresAt,
      meta: { ip: meta.ip ?? session.ip, userAgent: meta.userAgent ?? session.userAgent },
    });
  }

  /** Sessão aceita para autenticar requisições? Consultado a cada requisição autenticada. */
  public async isActive(sessionId: string): Promise<boolean> {
    const session = await this.store.findById(sessionId);
    return session !== null && isSessionUsable(session, this.now());
  }

  /** Encerra a sessão apresentada e todas as suas renovações. */
  public async revokeSession(sessionId: string, reason: RevocationReason): Promise<void> {
    const session = await this.store.findById(sessionId);
    if (!session) return;
    await this.store.revokeFamily(session.familyId, reason, this.now());
  }

  /** Derruba todas as sessões do operador — usado na troca de senha e na desativação. */
  public async revokeOperator(operatorId: string, reason: RevocationReason): Promise<number> {
    return this.store.revokeOperator(operatorId, reason, this.now());
  }

  /** Remove sessões vencidas há tempo suficiente para não servirem nem de histórico. */
  public async purgeExpired(): Promise<number> {
    return this.store.deleteExpired(this.now());
  }

  private async persist(input: {
    familyId: string;
    operatorId: string;
    role: string;
    now: Date;
    absoluteExpiresAt: Date;
    meta: SessionMetadata;
  }): Promise<IssuedSession> {
    const { familyId, operatorId, role, now, absoluteExpiresAt, meta } = input;
    const { token, hash } = generateRefreshToken();
    const id = crypto.randomUUID();

    // A janela deslizante nunca ultrapassa o teto absoluto da família.
    const slidingExpiry = new Date(now.getTime() + this.options.refreshTtlMs);
    const expiresAt = slidingExpiry > absoluteExpiresAt ? absoluteExpiresAt : slidingExpiry;

    await this.store.insert({
      id,
      familyId,
      operatorId,
      refreshTokenHash: hash,
      createdAt: now,
      expiresAt,
      absoluteExpiresAt,
      rotatedAt: null,
      revokedAt: null,
      revokedReason: null,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return {
      accessToken: signOperatorToken({ operatorId, role, sessionId: id }),
      refreshToken: token,
      expiresIn: Math.round(this.options.accessTokenTtlMs / 1_000),
      sessionId: id,
      operatorId,
      role,
      refreshExpiresAt: expiresAt,
    };
  }
}
