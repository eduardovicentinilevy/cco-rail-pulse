// backend/domain/entities/AuthSession.ts

/**
 * Sessão de autenticação: uma linha por geração de refresh token.
 *
 * Cada renovação cria uma nova linha e marca a anterior como rotacionada,
 * mantendo a mesma `familyId`. Guardar o histórico é o que permite detectar o
 * reuso de um refresh token já trocado — sinal clássico de token roubado.
 */
export interface AuthSessionRecord {
  /** Identificador desta geração — vai no claim `sid` do access token. */
  id: string;
  /** Constante ao longo de todas as renovações do mesmo login. */
  familyId: string;
  operatorId: string;
  refreshTokenHash: string;
  createdAt: Date;
  /** Validade do refresh token corrente (janela deslizante). */
  expiresAt: Date;
  /** Teto absoluto da família: nem com uso contínuo a sessão passa disso. */
  absoluteExpiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  ip: string | null;
  userAgent: string | null;
}

/** Motivos de revogação registrados na trilha de auditoria. */
export const REVOCATION_REASONS = {
  logout: 'LOGOUT',
  logoutAll: 'LOGOUT_ALL',
  passwordChanged: 'PASSWORD_CHANGED',
  refreshReuse: 'REFRESH_TOKEN_REUSE',
  operatorDisabled: 'OPERATOR_DISABLED',
  adminRevoked: 'ADMIN_REVOKED',
} as const;

export type RevocationReason = (typeof REVOCATION_REASONS)[keyof typeof REVOCATION_REASONS];

/** Uma sessão só autentica enquanto não foi revogada e não passou do teto absoluto. */
export const isSessionUsable = (session: AuthSessionRecord, now: Date): boolean =>
  session.revokedAt === null && session.absoluteExpiresAt.getTime() > now.getTime();

/** O refresh token corrente exige, além disso, não ter sido rotacionado nem vencido. */
export const isRefreshUsable = (session: AuthSessionRecord, now: Date): boolean =>
  isSessionUsable(session, now) && session.rotatedAt === null && session.expiresAt.getTime() > now.getTime();
