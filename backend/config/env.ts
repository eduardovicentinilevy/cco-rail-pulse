import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const DEV_JWT_SECRET = 'railpulse_cco_dev_only_secret_change_me';

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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

export const env = {
  nodeEnv,
  isProduction,
  port: toInt(process.env.PORT, 3333),
  jwtSecret: process.env.JWT_SECRET ?? DEV_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  corsOrigin: corsOrigins.length > 0 ? corsOrigins : '*',
  bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 10),
  telemetryIntervalMs: toInt(process.env.TELEMETRY_INTERVAL_MS, 3000),
  seedOperatorId: process.env.SEED_OPERATOR_ID ?? 'EDP-042',
  seedOperatorName: process.env.SEED_OPERATOR_NAME ?? 'Eduardo Vicentini Levy',
  seedOperatorPassword: process.env.SEED_OPERATOR_PASSWORD ?? '123456',
  /** Tentativas de login permitidas por credencial dentro da janela. */
  loginMaxAttempts: toInt(process.env.LOGIN_MAX_ATTEMPTS, 8),
  loginWindowMs: toInt(process.env.LOGIN_WINDOW_MS, 60_000),
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST ?? 'localhost',
    port: toInt(process.env.DB_PORT, 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? 'postgres',
    name: process.env.DB_NAME ?? 'railpulse_cco',
  },
} as const;
