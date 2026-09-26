// backend/infrastructure/database/migrations.ts
import bcrypt from 'bcrypt';
import type { PoolClient } from 'pg';
import { db, withTransaction } from './postgres';
import { env } from '../../config/env';
import { LINHA_UNI_SEED, SEED_PROCEDURES, SEED_TEAM, SEED_TRAINS } from './seeds/linha-uni';
import { createLogger } from '../../shared/logger';

const logger = createLogger('DB-MIGRATE');

/**
 * Tabelas de cliente e malha.
 *
 * `tenants` → `lines` → `stations` é a hierarquia que substitui a constante
 * `LINE_STATIONS`: a malha passa a ser dado, e um cliente pode ter mais de uma
 * linha. `position` em vez de `order` porque ORDER é palavra reservada em SQL.
 */
const TENANCY_DDL = `
  CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        VARCHAR(40) UNIQUE NOT NULL,
    name        VARCHAR(120) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code        VARCHAR(20) NOT NULL,
    name        VARCHAR(120) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
  );

  CREATE TABLE IF NOT EXISTS stations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id             UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    code                VARCHAR(10) NOT NULL,
    name                VARCHAR(120) NOT NULL,
    position            INTEGER NOT NULL,
    substation          VARCHAR(20) NOT NULL,
    nominal_voltage_kv  NUMERIC(5, 2) NOT NULL,
    headway_seconds     INTEGER,
    map_x               NUMERIC(6, 5),
    map_y               NUMERIC(6, 5),
    UNIQUE (line_id, code),
    UNIQUE (line_id, position)
  );

  CREATE INDEX IF NOT EXISTS idx_lines_tenant ON lines (tenant_id);
  CREATE INDEX IF NOT EXISTS idx_stations_line ON stations (line_id, position);
`;

/**
 * Tabelas operacionais no formato multi-tenant.
 *
 * Só têm efeito em banco novo: onde elas já existem no formato antigo, quem
 * converte é `upgradeLegacySchema`. Dados da linha (`trains`, `incidents`,
 * `telemetry_samples`) pendem de `line_id`; dados de pessoas (`operators`,
 * `audit_logs`) pendem de `tenant_id`, porque um supervisor pode responder por
 * mais de uma linha do mesmo cliente.
 */
const OPERATIONAL_DDL = `
  CREATE TABLE IF NOT EXISTS operators (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    login_id       VARCHAR(50) NOT NULL,
    name           VARCHAR(100) NOT NULL,
    role           VARCHAR(50) NOT NULL DEFAULT 'OPERADOR',
    password_hash  VARCHAR(255) NOT NULL,
    avatar_url     TEXT,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mfa_secret     TEXT,
    mfa_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    -- Último passo TOTP aceito: impede reusar o mesmo código dentro da tolerância (±30s).
    mfa_last_used_step BIGINT,
    UNIQUE (tenant_id, login_id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id           SERIAL PRIMARY KEY,
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    operator_id  VARCHAR(50),
    action       VARCHAR(100) NOT NULL,
    target       VARCHAR(100) NOT NULL,
    status       VARCHAR(50) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS trains (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id               UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    train_id              VARCHAR(20) NOT NULL,
    current_station_code  VARCHAR(10) NOT NULL,
    speed_kmh             NUMERIC(5, 1) NOT NULL,
    voltage_kv            NUMERIC(5, 2) NOT NULL,
    status                VARCHAR(20) NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (line_id, train_id)
  );

  CREATE TABLE IF NOT EXISTS incidents (
    id               SERIAL PRIMARY KEY,
    line_id          UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    title            VARCHAR(120) NOT NULL,
    description      TEXT NOT NULL,
    station_code     VARCHAR(10),
    train_id         VARCHAR(20),
    category         VARCHAR(30) NOT NULL,
    severity         VARCHAR(20) NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'ABERTA',
    opened_by        VARCHAR(50) NOT NULL,
    assigned_to      VARCHAR(50),
    resolution_note  TEXT,
    opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at      TIMESTAMPTZ
  );

  -- Série histórica agregada por janela: uma linha por estação por janela,
  -- em vez de uma linha por leitura (que geraria 5 escritas por segundo).
  CREATE TABLE IF NOT EXISTS telemetry_samples (
    id          BIGSERIAL PRIMARY KEY,
    station_id  UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    bucket_at   TIMESTAMPTZ NOT NULL,
    min_kv      NUMERIC(5, 2) NOT NULL,
    avg_kv      NUMERIC(5, 2) NOT NULL,
    max_kv      NUMERIC(5, 2) NOT NULL,
    readings    INTEGER NOT NULL,
    UNIQUE (station_id, bucket_at)
  );

  -- Histórico persistido de alarmes: o feed ao vivo do painel vive só na sessão do
  -- navegador, então sem esta tabela um alarme desaparece ao recarregar a página.
  -- Um alarme nasce da telemetria de uma estação, então pende da linha.
  CREATE TABLE IF NOT EXISTS alarms (
    id               SERIAL PRIMARY KEY,
    line_id          UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    severity         VARCHAR(20) NOT NULL,
    message          TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_by  VARCHAR(50),
    acknowledged_at  TIMESTAMPTZ
  );

  -- Registro de comunicação do CCO com maquinistas e estações da própria linha.
  CREATE TABLE IF NOT EXISTS communications (
    id            SERIAL PRIMARY KEY,
    line_id       UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    channel       VARCHAR(30) NOT NULL,
    direction     VARCHAR(20) NOT NULL,
    station_code  VARCHAR(10),
    train_id      VARCHAR(20),
    operator_id   VARCHAR(50) NOT NULL,
    message       TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Biblioteca de procedimentos. Também pende da linha: o texto cita estações,
  -- subestações e acidentes geográficos da malha a que pertence.
  CREATE TABLE IF NOT EXISTS procedures (
    id          SERIAL PRIMARY KEY,
    line_id     UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    category    VARCHAR(40) NOT NULL,
    title       VARCHAR(160) NOT NULL,
    summary     TEXT NOT NULL,
    steps       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (line_id, title)
  );
`;

/** Índices das tabelas operacionais — sempre com o discriminador de cliente à frente. */
const INDEX_DDL = `
  CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_operator ON audit_logs (tenant_id, operator_id);
  CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (line_id, status, opened_at DESC);
  CREATE INDEX IF NOT EXISTS idx_incidents_station ON incidents (line_id, station_code);
  CREATE INDEX IF NOT EXISTS idx_telemetry_bucket ON telemetry_samples (station_id, bucket_at DESC);
  CREATE INDEX IF NOT EXISTS idx_alarms_created_at ON alarms (line_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_communications_created_at ON communications (line_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_procedures_category ON procedures (line_id, category);
`;

const hasColumn = async (table: string, column: string): Promise<boolean> => {
  const result = await db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return (result.rowCount ?? 0) > 0;
};

/** Nomes das constraints de um tipo (`p` = primária, `u` = única) — os gerados pelo Postgres variam. */
const constraintNames = async (table: string, type: 'p' | 'u'): Promise<string[]> => {
  const result = await db.query<{ conname: string }>(
    `SELECT c.conname
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE t.relname = $1 AND n.nspname = current_schema() AND c.contype = $2`,
    [table, type],
  );
  return result.rows.map((row) => row.conname);
};

const dropConstraints = async (client: PoolClient, table: string, names: string[]): Promise<void> => {
  for (const name of names) {
    await client.query(`ALTER TABLE ${table} DROP CONSTRAINT "${name}"`);
  }
};

export const runMigrations = async (): Promise<void> => {
  await db.query(TENANCY_DDL);

  const { tenantId, lineId } = await seedTenancy();

  await db.query(OPERATIONAL_DDL);
  await upgradeLegacySchema(tenantId, lineId);
  await db.query(INDEX_DDL);
  await renameLegacyOperatorRole();

  logger.info('Schema verificado (self-healing DDL aplicado).');

  await seedOperators(tenantId);
  await seedTrains(lineId);
  await seedProcedures(lineId);

  logger.info('Carga inicial (auto-seeding) sincronizada.');
};

/** Cria o cliente de demonstração e a sua malha, se ainda não existirem. */
const seedTenancy = async (): Promise<{ tenantId: string; lineId: string }> => {
  const seed = LINHA_UNI_SEED;

  const tenant = await db.query<{ id: string }>(
    `INSERT INTO tenants (slug, name) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
     RETURNING id`,
    [seed.slug, seed.name],
  );
  const tenantId = tenant.rows[0].id;

  const [lineSeed] = seed.lines;
  const line = await db.query<{ id: string }>(
    `INSERT INTO lines (tenant_id, code, name) VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, code) DO UPDATE SET code = EXCLUDED.code
     RETURNING id`,
    [tenantId, lineSeed.code, lineSeed.name],
  );
  const lineId = line.rows[0].id;

  // DO NOTHING e não DO UPDATE: a semeadura é ponto de partida, não fonte de
  // verdade. Uma estação ajustada pelo cliente não pode ser revertida no boot.
  for (const station of lineSeed.stations) {
    await db.query(
      `INSERT INTO stations
         (line_id, code, name, position, substation, nominal_voltage_kv, headway_seconds, map_x, map_y)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (line_id, code) DO NOTHING`,
      [
        lineId,
        station.code,
        station.name,
        station.position,
        station.substation,
        station.nominalVoltageKV,
        station.headwaySeconds,
        station.mapX,
        station.mapY,
      ],
    );
  }

  return { tenantId, lineId };
};

/**
 * Converte um banco criado antes do multi-tenant.
 *
 * Cada passo é guardado pela ausência da coluna nova, então rodar duas vezes não
 * faz nada na segunda. O backfill aponta tudo que já existia para o cliente de
 * demonstração, que é de onde esses dados vieram.
 */
const upgradeLegacySchema = async (tenantId: string, lineId: string): Promise<void> => {
  if (!(await hasColumn('operators', 'login_id'))) {
    const primaryKeys = await constraintNames('operators', 'p');
    await withTransaction(async (client) => {
      await client.query(`ALTER TABLE operators RENAME COLUMN id TO login_id`);
      await client.query(`ALTER TABLE operators ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid()`);
      await client.query(`ALTER TABLE operators ADD COLUMN tenant_id UUID`);
      await client.query(`UPDATE operators SET tenant_id = $1 WHERE tenant_id IS NULL`, [tenantId]);
      await client.query(`ALTER TABLE operators ALTER COLUMN tenant_id SET NOT NULL`);
      await dropConstraints(client, 'operators', primaryKeys);
      await client.query(`ALTER TABLE operators ADD PRIMARY KEY (id)`);
      await client.query(`ALTER TABLE operators ADD CONSTRAINT operators_tenant_login_key UNIQUE (tenant_id, login_id)`);
      await client.query(
        `ALTER TABLE operators ADD CONSTRAINT operators_tenant_fkey
         FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
      );
    });
    logger.info('operators migrada: id interno (UUID) e credencial única por cliente.');
  }

  // Colunas do 2FA em bancos anteriores à autenticação em duas etapas.
  await db.query(`ALTER TABLE operators ADD COLUMN IF NOT EXISTS mfa_secret TEXT`);
  await db.query(`ALTER TABLE operators ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
  // E a coluna anti-reuso de código TOTP, em bancos anteriores a ela.
  await db.query(`ALTER TABLE operators ADD COLUMN IF NOT EXISTS mfa_last_used_step BIGINT`);

  if (!(await hasColumn('audit_logs', 'tenant_id'))) {
    await withTransaction(async (client) => {
      await client.query(`ALTER TABLE audit_logs ADD COLUMN tenant_id UUID`);
      await client.query(`UPDATE audit_logs SET tenant_id = $1 WHERE tenant_id IS NULL`, [tenantId]);
      await client.query(`ALTER TABLE audit_logs ALTER COLUMN tenant_id SET NOT NULL`);
      await client.query(
        `ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_tenant_fkey
         FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
      );
    });
    logger.info('audit_logs migrada: trilha amarrada ao cliente.');
  }

  if (!(await hasColumn('trains', 'line_id'))) {
    const primaryKeys = await constraintNames('trains', 'p');
    await withTransaction(async (client) => {
      await client.query(`ALTER TABLE trains ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid()`);
      await client.query(`ALTER TABLE trains ADD COLUMN line_id UUID`);
      await client.query(`UPDATE trains SET line_id = $1 WHERE line_id IS NULL`, [lineId]);
      await client.query(`ALTER TABLE trains ALTER COLUMN line_id SET NOT NULL`);
      await dropConstraints(client, 'trains', primaryKeys);
      await client.query(`ALTER TABLE trains ADD PRIMARY KEY (id)`);
      await client.query(`ALTER TABLE trains ADD CONSTRAINT trains_line_train_key UNIQUE (line_id, train_id)`);
      await client.query(
        `ALTER TABLE trains ADD CONSTRAINT trains_line_fkey
         FOREIGN KEY (line_id) REFERENCES lines(id) ON DELETE CASCADE`,
      );
    });
    logger.info('trains migrada: numeração de composição única por linha.');
  }

  if (!(await hasColumn('incidents', 'line_id'))) {
    await withTransaction(async (client) => {
      await client.query(`ALTER TABLE incidents ADD COLUMN line_id UUID`);
      await client.query(`UPDATE incidents SET line_id = $1 WHERE line_id IS NULL`, [lineId]);
      await client.query(`ALTER TABLE incidents ALTER COLUMN line_id SET NOT NULL`);
      await client.query(
        `ALTER TABLE incidents ADD CONSTRAINT incidents_line_fkey
         FOREIGN KEY (line_id) REFERENCES lines(id) ON DELETE CASCADE`,
      );
    });
    logger.info('incidents migrada: ocorrências amarradas à linha.');
  }

  if (!(await hasColumn('telemetry_samples', 'station_id'))) {
    const uniques = await constraintNames('telemetry_samples', 'u');
    await withTransaction(async (client) => {
      await client.query(`ALTER TABLE telemetry_samples ADD COLUMN station_id UUID`);
      await client.query(
        `UPDATE telemetry_samples t SET station_id = s.id
         FROM stations s
         WHERE s.line_id = $1 AND s.code = t.station_code AND t.station_id IS NULL`,
        [lineId],
      );
      // Janelas de estações que não existem mais na malha não têm para onde ir.
      // A série tem 7 dias de retenção, então a perda é de histórico recente órfão.
      const orphans = await client.query(`DELETE FROM telemetry_samples WHERE station_id IS NULL`);
      if (orphans.rowCount) {
        logger.info(`Série histórica: ${orphans.rowCount} janela(s) sem estação correspondente descartada(s).`);
      }
      await client.query(`ALTER TABLE telemetry_samples ALTER COLUMN station_id SET NOT NULL`);
      await dropConstraints(client, 'telemetry_samples', uniques);
      await client.query(`ALTER TABLE telemetry_samples DROP COLUMN station_code`);
      await client.query(
        `ALTER TABLE telemetry_samples ADD CONSTRAINT telemetry_samples_station_bucket_key
         UNIQUE (station_id, bucket_at)`,
      );
      await client.query(
        `ALTER TABLE telemetry_samples ADD CONSTRAINT telemetry_samples_station_fkey
         FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE`,
      );
    });
    logger.info('telemetry_samples migrada: série amarrada à estação da linha.');
  }

  // As três tabelas abaixo nasceram junto com as seções de Alarmes, Comunicações
  // e Procedimentos, antes de existir noção de cliente: num banco que já rodou
  // aquela versão elas existem sem `line_id`.
  for (const table of ['alarms', 'communications'] as const) {
    if (await hasColumn(table, 'line_id')) continue;
    await withTransaction(async (client) => {
      await client.query(`ALTER TABLE ${table} ADD COLUMN line_id UUID`);
      await client.query(`UPDATE ${table} SET line_id = $1 WHERE line_id IS NULL`, [lineId]);
      await client.query(`ALTER TABLE ${table} ALTER COLUMN line_id SET NOT NULL`);
      await client.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${table}_line_fkey
         FOREIGN KEY (line_id) REFERENCES lines(id) ON DELETE CASCADE`,
      );
    });
    logger.info(`${table} migrada: amarrada à linha.`);
  }

  if (!(await hasColumn('procedures', 'line_id'))) {
    // O título era único no banco inteiro; passa a ser único dentro da linha,
    // senão dois clientes não podem ter o mesmo procedimento no seu manual.
    const uniques = await constraintNames('procedures', 'u');
    await withTransaction(async (client) => {
      await client.query(`ALTER TABLE procedures ADD COLUMN line_id UUID`);
      await client.query(`UPDATE procedures SET line_id = $1 WHERE line_id IS NULL`, [lineId]);
      await client.query(`ALTER TABLE procedures ALTER COLUMN line_id SET NOT NULL`);
      await dropConstraints(client, 'procedures', uniques);
      await client.query(`ALTER TABLE procedures ADD CONSTRAINT procedures_line_title_key UNIQUE (line_id, title)`);
      await client.query(
        `ALTER TABLE procedures ADD CONSTRAINT procedures_line_fkey
         FOREIGN KEY (line_id) REFERENCES lines(id) ON DELETE CASCADE`,
      );
    });
    logger.info('procedures migrada: manual por linha, título único dentro dela.');
  }
};


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

const seedOperators = async (tenantId: string): Promise<void> => {
  const passwordHash = await bcrypt.hash(env.seedOperatorPassword, env.bcryptRounds);

  const seeded = await db.query(
    `INSERT INTO operators (tenant_id, login_id, name, role, password_hash, avatar_url, is_active)
     VALUES ($1, $2, $3, $4, $5, NULL, TRUE)
     ON CONFLICT (tenant_id, login_id) DO NOTHING
     RETURNING id`,
    [tenantId, env.seedOperatorId, env.seedOperatorName, env.seedOperatorRole, passwordHash],
  );

  if (seeded.rowCount && seeded.rowCount > 0) {
    logger.info(`Operador padrão "${env.seedOperatorId}" criado como ${env.seedOperatorRole}.`);
  } else {
    // Mantém o perfil do operador de demonstração alinhado à configuração,
    // sem jamais sobrescrever a senha de uma conta já existente.
    await db.query(
      `UPDATE operators SET role = $3 WHERE tenant_id = $1 AND login_id = $2 AND role <> $3`,
      [tenantId, env.seedOperatorId, env.seedOperatorRole],
    );
  }

  // A equipe de plantão compartilha a senha padrão apenas em ambiente de demonstração.
  for (const [credential, name, role] of SEED_TEAM) {
    await db.query(
      `INSERT INTO operators (tenant_id, login_id, name, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (tenant_id, login_id) DO NOTHING`,
      [tenantId, credential, name, role, passwordHash],
    );
  }
};

const seedTrains = async (lineId: string): Promise<void> => {
  const known = await db.query<{ code: string }>(`SELECT code FROM stations WHERE line_id = $1`, [lineId]);
  const knownCodes = new Set(known.rows.map((row) => row.code));

  for (const [trainId, stationCode, speed, voltage, status] of SEED_TRAINS) {
    if (!knownCodes.has(stationCode)) continue;
    await db.query(
      `INSERT INTO trains (line_id, train_id, current_station_code, speed_kmh, voltage_kv, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (line_id, train_id) DO NOTHING`,
      [lineId, trainId, stationCode, speed, voltage, status],
    );
  }
};

/**
 * Biblioteca de procedimentos da linha.
 *
 * DO NOTHING pelo mesmo motivo das estações: um procedimento ajustado pelo
 * cliente não pode ser sobrescrito pela carga inicial a cada boot.
 */
const seedProcedures = async (lineId: string): Promise<void> => {
  for (const procedure of SEED_PROCEDURES) {
    await db.query(
      `INSERT INTO procedures (line_id, category, title, summary, steps)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (line_id, title) DO NOTHING`,
      [lineId, procedure.category, procedure.title, procedure.summary, JSON.stringify(procedure.steps)],
    );
  }
};
