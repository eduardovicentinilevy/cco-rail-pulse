import path from 'path';
import dotenv from 'dotenv';
import { PASSWORD_MIN_LENGTH, describeViolations, validatePassword } from '../domain/password-policy';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const DEV_JWT_SECRET = 'railpulse_cco_dev_only_secret_change_me';

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'sim'].includes(value.trim().toLowerCase());
};

const toList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  // Fail-fast: em produção nunca podemos assinar tokens com um segredo público.
  throw new Error('[CONFIG] JWT_SECRET é obrigatório quando NODE_ENV=production.');
}

/** Origens liberadas no CORS. Vazio (default em dev) libera qualquer origem. */
const corsOrigins = toList(process.env.CORS_ORIGIN);

const passwordMinLength = Math.max(toInt(process.env.PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH), PASSWORD_MIN_LENGTH);

/**
 * Senha do operador inicial. Não existe valor padrão: sem esta variável o boot
 * sorteia uma senha de primeiro acesso e a imprime uma única vez no log.
 * Quando informada, precisa passar pela mesma política exigida dos operadores.
 */
const seedOperatorPassword = process.env.SEED_OPERATOR_PASSWORD?.trim() || undefined;
const seedOperatorId = process.env.SEED_OPERATOR_ID ?? 'EDP-042';
const seedOperatorName = process.env.SEED_OPERATOR_NAME ?? 'Eduardo Vicentini Levy';

if (seedOperatorPassword) {
  const violations = validatePassword(
    seedOperatorPassword,
    { operatorId: seedOperatorId, name: seedOperatorName },
    { minLength: passwordMinLength },
  );
  if (violations.length > 0) {
    throw new Error(`[CONFIG] SEED_OPERATOR_PASSWORD recusada. ${describeViolations(violations)}`);
  }
}

export const env = {
  nodeEnv,
  isProduction,
  port: toInt(process.env.PORT, 3333),
  jwtSecret: process.env.JWT_SECRET ?? DEV_JWT_SECRET,
  /** Validade do access token. Curta de propósito: a renovação é feita pelo refresh token. */
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  /** Validade do desafio emitido entre a senha e o código do autenticador. */
  mfaChallengeExpiresIn: process.env.MFA_CHALLENGE_EXPIRES_IN ?? '5m',
  /** Validade do token que libera apenas a definição de senha no primeiro acesso. */
  passwordChangeExpiresIn: process.env.PASSWORD_CHANGE_EXPIRES_IN ?? '10m',
  /** Janela deslizante do refresh token, renovada a cada rotação. */
  refreshTokenTtlDays: toInt(process.env.REFRESH_TOKEN_TTL_DAYS, 7),
  /** Teto absoluto da sessão: nem com uso contínuo o refresh sobrevive além disso. */
  refreshTokenAbsoluteTtlDays: toInt(process.env.REFRESH_TOKEN_ABSOLUTE_TTL_DAYS, 30),
  /**
   * Tolerância para duas abas renovarem ao mesmo tempo. Dentro dela o reuso é
   * apenas recusado; fora dela é tratado como token vazado e derruba a sessão.
   */
  refreshReuseGraceSeconds: toInt(process.env.REFRESH_REUSE_GRACE_SECONDS, 20),
  corsOrigin: corsOrigins.length > 0 ? corsOrigins : '*',
  bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 12),
  passwordMinLength,
  telemetryIntervalMs: toInt(process.env.TELEMETRY_INTERVAL_MS, 3000),
  /** Intervalo entre avanços de uma estação na simulação de deslocamento das composições. */
  trainMotionIntervalMs: toInt(process.env.TRAIN_MOTION_INTERVAL_MS, 4000),
  seedOperatorId,
  seedOperatorName,
  seedOperatorPassword,
  seedOperatorRole: process.env.SEED_OPERATOR_ROLE ?? 'SUPERVISOR',
  /** Equipe fictícia de vitrine: nunca semeada em produção. */
  seedDemoTeam: toBool(process.env.SEED_DEMO_TEAM, !isProduction),
  /** Janela de agregação da série histórica de telemetria, em segundos. */
  telemetryBucketSeconds: toInt(process.env.TELEMETRY_BUCKET_SECONDS, 60),
  /** Retenção da série histórica, em dias. */
  telemetryRetentionDays: toInt(process.env.TELEMETRY_RETENTION_DAYS, 7),
  /** Tentativas de login permitidas por credencial dentro da janela. */
  loginMaxAttempts: toInt(process.env.LOGIN_MAX_ATTEMPTS, 8),
  loginWindowMs: toInt(process.env.LOGIN_WINDOW_MS, 60_000),
  /** Teto global de requisições por origem, aplicado a toda a API. */
  apiMaxRequests: toInt(process.env.API_MAX_REQUESTS, 600),
  apiWindowMs: toInt(process.env.API_WINDOW_MS, 60_000),
  /**
   * Onde o rate limit guarda os contadores. `postgres` (padrão) mantém o limite
   * válido com várias instâncias atrás do balanceador; `memory` só serve a
   * processos isolados e a testes.
   */
  rateLimitStore: (process.env.RATE_LIMIT_STORE ?? 'postgres') as 'postgres' | 'memory',
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST ?? 'localhost',
    port: toInt(process.env.DB_PORT, 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? 'postgres',
    name: process.env.DB_NAME ?? 'railpulse_cco',
  },
} as const;
