// backend/infrastructure/database/migrations.ts
import bcrypt from 'bcrypt';
import { db } from './postgres';
import { env } from '../../config/env';
import { LINE_STATIONS } from '../../domain/line';
import { createLogger } from '../../shared/logger';

const logger = createLogger('DB-MIGRATE');

const DDL = `
  CREATE TABLE IF NOT EXISTS operators (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'OPERADOR',
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    operator_id VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    target VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_operator ON audit_logs (operator_id);

  CREATE TABLE IF NOT EXISTS trains (
    train_id VARCHAR(20) PRIMARY KEY,
    current_station_code VARCHAR(10) NOT NULL,
    speed_kmh NUMERIC(5, 1) NOT NULL,
    voltage_kv NUMERIC(5, 2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    description TEXT NOT NULL,
    station_code VARCHAR(10),
    train_id VARCHAR(20),
    category VARCHAR(30) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ABERTA',
    opened_by VARCHAR(50) NOT NULL,
    assigned_to VARCHAR(50),
    resolution_note TEXT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  );

  CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status, opened_at DESC);
  CREATE INDEX IF NOT EXISTS idx_incidents_station ON incidents (station_code);

  -- Série histórica agregada por janela: uma linha por estação por janela,
  -- em vez de uma linha por leitura (que geraria 5 escritas por segundo).
  CREATE TABLE IF NOT EXISTS telemetry_samples (
    id BIGSERIAL PRIMARY KEY,
    station_code VARCHAR(10) NOT NULL,
    bucket_at TIMESTAMPTZ NOT NULL,
    min_kv NUMERIC(5, 2) NOT NULL,
    avg_kv NUMERIC(5, 2) NOT NULL,
    max_kv NUMERIC(5, 2) NOT NULL,
    readings INTEGER NOT NULL,
    UNIQUE (station_code, bucket_at)
  );

  CREATE INDEX IF NOT EXISTS idx_telemetry_bucket ON telemetry_samples (bucket_at DESC);
`;

/** Composições semeadas na malha, posicionadas em estações reais do traçado. */
const SEED_TRAINS: ReadonlyArray<[trainId: string, stationCode: string, speed: number, voltage: number, status: string]> = [
  ['T-01', 'BRA', 45, 24.6, 'NORMAL'],
  ['T-04', 'FGO', 30, 23.2, 'ATENÇÃO'],
  ['T-07', 'PDZ', 50, 24.5, 'NORMAL'],
  ['T-12', '14B', 48, 24.6, 'NORMAL'],
];

/** Equipe de plantão semeada para demonstrar o cadastro e os perfis de acesso. */
const SEED_TEAM: ReadonlyArray<[id: string, name: string, role: string]> = [
  ['MAR-109', 'Marina Rezende', 'OPERADOR'],
  ['SOU-012', 'Sousa Okamoto', 'OPERADOR'],
  ['LIV-551', 'Lívia Nakamura', 'SUPERVISOR'],
];

/**
 * Renomeia o perfil `OPERATOR_SOC` (jargão de centro de operações de segurança,
 * herdado por engano) para `OPERADOR`. Idempotente: em bancos novos não há
 * linhas a converter e o DEFAULT já nasce correto.
 */
const renameLegacyOperatorRole = async (): Promise<void> => {
  const updated = await db.query(`UPDATE operators SET role = 'OPERADOR' WHERE role = 'OPERATOR_SOC'`);

  // O DEFAULT do CREATE TABLE não alcança tabelas que já existem.
  await db.query(`ALTER TABLE operators ALTER COLUMN role SET DEFAULT 'OPERADOR'`);

  if (updated.rowCount && updated.rowCount > 0) {
    logger.info(`Perfil OPERATOR_SOC migrado para OPERADOR em ${updated.rowCount} operador(es).`);
  }
};

export const runMigrations = async (): Promise<void> => {
  await db.query(DDL);
  await renameLegacyOperatorRole();
  logger.info('Schema verificado (self-healing DDL aplicado).');

  const passwordHash = await bcrypt.hash(env.seedOperatorPassword, env.bcryptRounds);
  const seeded = await db.query(
    `INSERT INTO operators (id, name, role, password_hash, avatar_url, is_active)
     VALUES ($1, $2, $3, $4, NULL, TRUE)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [env.seedOperatorId, env.seedOperatorName, env.seedOperatorRole, passwordHash],
  );

  if (seeded.rowCount && seeded.rowCount > 0) {
    logger.info(`Operador padrão "${env.seedOperatorId}" criado como ${env.seedOperatorRole}.`);
  } else {
    // Mantém o perfil do operador de demonstração alinhado à configuração,
    // sem jamais sobrescrever a senha de uma conta já existente.
    await db.query(`UPDATE operators SET role = $2 WHERE id = $1 AND role <> $2`, [
      env.seedOperatorId,
      env.seedOperatorRole,
    ]);
  }

  // A equipe de plantão compartilha a senha padrão apenas em ambiente de demonstração.
  for (const [id, name, role] of SEED_TEAM) {
    await db.query(
      `INSERT INTO operators (id, name, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [id, name, role, passwordHash],
    );
  }

  const knownCodes = new Set(LINE_STATIONS.map((station) => station.code));
  for (const [trainId, stationCode, speed, voltage, status] of SEED_TRAINS) {
    if (!knownCodes.has(stationCode)) continue;
    await db.query(
      `INSERT INTO trains (train_id, current_station_code, speed_kmh, voltage_kv, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (train_id) DO NOTHING`,
      [trainId, stationCode, speed, voltage, status],
    );
  }

  logger.info('Carga inicial (auto-seeding) sincronizada.');
};
