// backend/shared/jwt.ts
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

/**
 * Identidade de uma sessão do CCO.
 *
 * `operatorId` é a chave interna (UUID) e nunca sai do backend; `credential` é o
 * crachá que o operador digita e que aparece na trilha de auditoria. `tenantId` e
 * `lineId` são o escopo da sessão: todo repositório filtra por eles, e é o que
 * impede uma sessão de um cliente alcançar dado de outro.
 */
export interface OperatorTokenPayload {
  operatorId: string;
  credential: string;
  role: string;
  tenantId: string;
  lineId: string;
}

export const signOperatorToken = (payload: OperatorTokenPayload): string =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'] });

/** Retorna o payload do token ou `null` se ausente, inválido, expirado ou sem escopo. */
export const verifyOperatorToken = (token: string | undefined | null): OperatorTokenPayload | null => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string') return null;

    // Um token sem cliente e linha não tem escopo: recusamos em vez de assumir
    // um padrão, que abriria a porta do cliente errado.
    if (!decoded.operatorId || !decoded.tenantId || !decoded.lineId) return null;

    return {
      operatorId: String(decoded.operatorId),
      credential: String(decoded.credential ?? decoded.operatorId),
      role: String(decoded.role ?? 'OPERADOR'),
      tenantId: String(decoded.tenantId),
      lineId: String(decoded.lineId),
    };
  } catch {
    return null;
  }
};

const MFA_CHALLENGE_PURPOSE = 'mfa_challenge';

interface MfaChallenge {
  operatorId: string;
  tenantId: string;
}

/**
 * Token de curtíssima duração emitido entre a senha e o código do autenticador.
 * Carrega só a identidade e o cliente — nunca o `role`, que só é atribuído após
 * o 2FA confirmado.
 */
export const signMfaChallengeToken = ({ operatorId, tenantId }: MfaChallenge): string =>
  jwt.sign({ operatorId, tenantId, purpose: MFA_CHALLENGE_PURPOSE }, env.jwtSecret, { expiresIn: '5m' });

/** Retorna a identidade do desafio, ou `null` se ausente, inválido, expirado ou de outro propósito. */
export const verifyMfaChallengeToken = (token: string | undefined | null): MfaChallenge | null => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string' || decoded.purpose !== MFA_CHALLENGE_PURPOSE) return null;
    if (!decoded.operatorId || !decoded.tenantId) return null;
    return { operatorId: String(decoded.operatorId), tenantId: String(decoded.tenantId) };
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
