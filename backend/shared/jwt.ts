// backend/shared/jwt.ts
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

/**
 * Todo token assinado declara o seu propósito. Sem isso, um token de curta
 * duração emitido para uma etapa intermediária do login (2FA, troca de senha)
 * poderia ser apresentado como se fosse uma sessão completa.
 */
const PURPOSE = {
  access: 'access',
  mfaChallenge: 'mfa_challenge',
  passwordChange: 'password_change',
} as const;

export interface OperatorTokenPayload {
  operatorId: string;
  role: string;
  /** Identificador da sessão (claim `sid`), usado para revogar o token antes do vencimento. */
  sessionId: string;
}

export interface AccessTokenInput extends OperatorTokenPayload {
  expiresIn?: string;
}

export const signOperatorToken = ({ operatorId, role, sessionId, expiresIn }: AccessTokenInput): string =>
  jwt.sign({ operatorId, role, sid: sessionId, purpose: PURPOSE.access }, env.jwtSecret, {
    expiresIn: (expiresIn ?? env.jwtExpiresIn) as SignOptions['expiresIn'],
  });

/**
 * Retorna o payload do token ou `null` se ausente, inválido, expirado, de outro
 * propósito ou emitido antes da introdução das sessões revogáveis (sem `sid`).
 */
export const verifyOperatorToken = (token: string | undefined | null): OperatorTokenPayload | null => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string') return null;
    if (decoded.purpose !== PURPOSE.access) return null;
    if (!decoded.operatorId || !decoded.sid) return null;
    return {
      operatorId: String(decoded.operatorId),
      role: String(decoded.role ?? 'OPERADOR'),
      sessionId: String(decoded.sid),
    };
  } catch {
    return null;
  }
};

/** Assina um token de etapa intermediária: carrega só o `operatorId` e vive poucos minutos. */
const signStepToken = (operatorId: string, purpose: string, expiresIn: string): string =>
  jwt.sign({ operatorId, purpose }, env.jwtSecret, { expiresIn: expiresIn as SignOptions['expiresIn'] });

const verifyStepToken = (token: string | undefined | null, purpose: string): string | null => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string' || decoded.purpose !== purpose || !decoded.operatorId) return null;
    return String(decoded.operatorId);
  } catch {
    return null;
  }
};

/**
 * Token de curtíssima duração emitido entre a senha e o código do autenticador.
 * Carrega só o `operatorId` — nunca o `role`, que só é atribuído após o 2FA confirmado.
 */
export const signMfaChallengeToken = (operatorId: string): string =>
  signStepToken(operatorId, PURPOSE.mfaChallenge, env.mfaChallengeExpiresIn);

/** Retorna o `operatorId` do desafio, ou `null` se ausente, inválido, expirado ou de outro propósito. */
export const verifyMfaChallengeToken = (token: string | undefined | null): string | null =>
  verifyStepToken(token, PURPOSE.mfaChallenge);

/**
 * Token emitido quando a senha do operador está marcada para troca obrigatória.
 * Ele só abre a rota de definição de senha — nenhuma outra rota da API o aceita.
 */
export const signPasswordChangeToken = (operatorId: string): string =>
  signStepToken(operatorId, PURPOSE.passwordChange, env.passwordChangeExpiresIn);

export const verifyPasswordChangeToken = (token: string | undefined | null): string | null =>
  verifyStepToken(token, PURPOSE.passwordChange);

/** Extrai o token de um header `Authorization: Bearer <token>`. */
export const extractBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader?.startsWith('Bearer ')) return null;
  const token = authorizationHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
};
