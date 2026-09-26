// backend/infrastructure/auth/session-service.ts
import { AuthSessionService } from '../../application/services/AuthSessionService';
import { sessionStore } from '../repositories/pg-session.repository';
import { operatorRepository } from '../repositories/pg-operator.repository';
import { env } from '../../config/env';
import { parseDurationMs } from '../../shared/duration';

const DAY_MS = 86_400_000;

/**
 * Serviço de sessões da aplicação.
 *
 * A consulta ao operador devolve `null` para credencial inativa ou removida, de
 * modo que desativar alguém no cadastro corta a renovação da sessão dessa pessoa.
 */
export const authSessionService = new AuthSessionService(
  sessionStore,
  async (operatorId) => {
    const operator = await operatorRepository.findById(operatorId);
    return operator ? { id: operator.id, role: operator.role } : null;
  },
  {
    accessTokenTtlMs: parseDurationMs(env.jwtExpiresIn),
    refreshTtlMs: env.refreshTokenTtlDays * DAY_MS,
    absoluteTtlMs: env.refreshTokenAbsoluteTtlDays * DAY_MS,
    reuseGraceMs: env.refreshReuseGraceSeconds * 1_000,
  },
);
