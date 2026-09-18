// backend/shared/jwt.ts
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface OperatorTokenPayload {
  operatorId: string;
  role: string;
}

export const signOperatorToken = (payload: OperatorTokenPayload): string =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'] });

/** Retorna o payload do token ou `null` se ausente, inválido ou expirado. */
export const verifyOperatorToken = (token: string | undefined | null): OperatorTokenPayload | null => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string' || !decoded.operatorId) return null;
    return { operatorId: String(decoded.operatorId), role: String(decoded.role ?? 'OPERADOR') };
  } catch {
    return null;
  }
};

const MFA_CHALLENGE_PURPOSE = 'mfa_challenge';

/**
 * Token de curtíssima duração emitido entre a senha e o código do autenticador.
 * Carrega só o `operatorId` — nunca o `role`, que só é atribuído após o 2FA confirmado.
 */
export const signMfaChallengeToken = (operatorId: string): string =>
  jwt.sign({ operatorId, purpose: MFA_CHALLENGE_PURPOSE }, env.jwtSecret, { expiresIn: '5m' });

/** Retorna o `operatorId` do desafio, ou `null` se ausente, inválido, expirado ou de outro propósito. */
export const verifyMfaChallengeToken = (token: string | undefined | null): string | null => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string' || decoded.purpose !== MFA_CHALLENGE_PURPOSE || !decoded.operatorId) return null;
    return String(decoded.operatorId);
  } catch {
    return null;
  }
};

/** Extrai o token de um header `Authorization: Bearer <token>`. */
export const extractBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader?.startsWith('Bearer ')) return null;
  const token = authorizationHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
};
