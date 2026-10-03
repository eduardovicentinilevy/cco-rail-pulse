// backend/shared/refresh-token.ts
import crypto from 'crypto';

/**
 * Refresh tokens do CCO.
 *
 * São opacos (não carregam claims) e nunca são gravados em claro: o banco guarda
 * apenas o SHA-256. Vazar um dump do banco, portanto, não entrega sessões vivas.
 * O SHA-256 basta aqui — diferente de senha, o segredo tem 384 bits de entropia
 * e não é passível de força bruta offline.
 */

const REFRESH_TOKEN_BYTES = 48;

export interface RefreshTokenPair {
  /** Valor entregue ao cliente; só existe em memória e na resposta HTTP. */
  token: string;
  /** Valor persistido. */
  hash: string;
}

export const hashRefreshToken = (token: string): string =>
  crypto.createHash('sha256').update(token, 'utf8').digest('hex');

export const generateRefreshToken = (): RefreshTokenPair => {
  const token = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
};

/** Comparação em tempo constante entre dois hashes de refresh token. */
export const refreshTokenHashEquals = (a: string, b: string): boolean => {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};
