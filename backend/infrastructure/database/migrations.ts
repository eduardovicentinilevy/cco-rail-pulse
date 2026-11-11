// backend/infrastructure/database/migrations.ts
import bcrypt from 'bcrypt';
import type { PoolClient } from 'pg';
import { db, withTransaction } from './postgres';
import { env } from '../../config/env';
import { DEMO_TENANT_SEED, SEED_PROCEDURES, SEED_TEAM, SEED_TRAINS } from './seeds/linha-uni';
import type { LineSeed } from './seeds/linha-uni';
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
    -- Quanto a via é mais longa que a reta entre as estações. Calibra as
    -- distâncias para a extensão conhecida da linha; 1 = sem correção informada.
    alignment_factor NUMERIC(5, 3) NOT NULL DEFAULT 1,
    -- Qual malha esta linha representa. Para a linha semeada, é o identificador
    -- da malha que o deploy escreveu: quando ele muda, o estado operacional da
    -- malha anterior é descartado. Fica aqui, e não numa tabela de instalação,
    -- porque não existe "a malha" no singular — cada linha tem a sua.
    mesh_version VARCHAR(40),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
  );

  ALTER TABLE lines ADD COLUMN IF NOT EXISTS alignment_factor NUMERIC(5, 3) NOT NULL DEFAULT 1;
  ALTER TABLE lines ADD COLUMN IF NOT EXISTS mesh_version VARCHAR(40);

  CREATE TABLE IF NOT EXISTS stations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id             UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    code                VARCHAR(10) NOT NULL,
    name                VARCHAR(120) NOT NULL,
    position            INTEGER NOT NULL,
    substation          VARCHAR(20) NOT NULL,
    nominal_voltage_v   NUMERIC(6, 1) NOT NULL,
    connections         TEXT[] NOT NULL DEFAULT '{}',
    headway_seconds     INTEGER,
    map_x               NUMERIC(6, 5),
    map_y               NUMERIC(6, 5),
    -- Coordenadas geográficas (WGS 84): base das distâncias entre estações, e
    -- portanto da marcha simulada. Opcionais — uma linha recém-cadastrada opera
    -- com trecho de comprimento nominal até alguém informá-las.
    lat                 NUMERIC(9, 6),
    lon                 NUMERIC(9, 6),
    UNIQUE (line_id, code),
    UNIQUE (line_id, position)
  );

  -- Alcança bancos criados antes de a malha guardar coordenada geográfica.
  ALTER TABLE stations ADD COLUMN IF NOT EXISTS lat NUMERIC(9, 6);
  ALTER TABLE stations ADD COLUMN IF NOT EXISTS lon NUMERIC(9, 6);

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
    voltage_v             NUMERIC(6, 1) NOT NULL,
    status                VARCHAR(20) NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (line_id, train_id)
  );

  -- Estado de marcha (motor de operação). ADD COLUMN IF NOT EXISTS também alcança
  -- bancos criados antes destas colunas existirem.
  ALTER TABLE trains ADD COLUMN IF NOT EXISTS direction SMALLINT NOT NULL DEFAULT 1 CHECK (direction IN (1, -1));
  ALTER TABLE trains ADD COLUMN IF NOT EXISTS next_station_code VARCHAR(10);
  ALTER TABLE trains ADD COLUMN IF NOT EXISTS segment_progress REAL NOT NULL DEFAULT 0;
  ALTER TABLE trains ADD COLUMN IF NOT EXISTS progress_at TIMESTAMPTZ;
  ALTER TABLE trains ADD COLUMN IF NOT EXISTS remaining_ms INTEGER;
  ALTER TABLE trains ADD COLUMN IF NOT EXISTS hold_reason VARCHAR(160);

  -- Seções de alimentação do terceiro trilho, uma por subestação retificadora da
  -- linha. A SR é dado da malha: duas linhas podem ter uma SR-01 cada uma, sem
  -- relação entre elas, então a chave é (linha, subestação) — nunca a subestação só.
  CREATE TABLE IF NOT EXISTS power_sections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id     UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    substation  VARCHAR(20) NOT NULL,
    energized   BOOLEAN NOT NULL DEFAULT TRUE,
    reason      TEXT,
    changed_by  VARCHAR(50),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (line_id, substation)
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

  CREATE TABLE IF NOT EXISTS work_orders (
    id               SERIAL PRIMARY KEY,
    line_id          UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    title            VARCHAR(120) NOT NULL,
    description      TEXT NOT NULL,
    asset_code       VARCHAR(80),
    station_code     VARCHAR(10),
    category         VARCHAR(40) NOT NULL,
    priority         VARCHAR(20) NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'ABERTA',
    opened_by        VARCHAR(50) NOT NULL,
    assigned_to      VARCHAR(50),
    completion_note  TEXT,
    opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ,
    due_at           TIMESTAMPTZ
  );

  -- Série histórica agregada por janela: uma linha por estação por janela,
  -- em vez de uma linha por leitura (que geraria 5 escritas por segundo).
  CREATE TABLE IF NOT EXISTS telemetry_samples (
    id          BIGSERIAL PRIMARY KEY,
    station_id  UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    bucket_at   TIMESTAMPTZ NOT NULL,
    min_v       NUMERIC(6, 1) NOT NULL,
    avg_v       NUMERIC(6, 1) NOT NULL,
    max_v       NUMERIC(6, 1) NOT NULL,
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
  CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders (line_id, status, opened_at DESC);
  CREATE INDEX IF NOT EXISTS idx_work_orders_station ON work_orders (line_id, station_code);
  CREATE INDEX IF NOT EXISTS idx_telemetry_bucket ON telemetry_samples (station_id, bucket_at DESC);
  CREATE INDEX IF NOT EXISTS idx_alarms_created_at ON alarms (line_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_communications_created_at ON communications (line_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_procedures_category ON procedures (line_id, category);
  CREATE INDEX IF NOT EXISTS idx_power_sections_line ON power_sections (line_id, substation);
`;

/**
 * Bancos anteriores guardavam tensão de catenária em kV.
 *
 * A tração passou a ser por terceiro trilho em 750 Vcc, então as colunas de
 * tensão viram volts e ganham precisão. Vale para as três tabelas que a
 * guardam, inclusive `stations`, que é onde a tensão de referência do trecho
 * virou dado cadastrado. Cada bloco confere a própria coluna, então o DDL é
 * seguro num banco migrado pela metade, e em banco novo não faz nada. As
 * consultas olham só o schema corrente — o mesmo que o `ALTER TABLE` resolve —
 * para que uma cópia antiga em outro schema não dispare a renomeação.
 */
/**
 * As consultas olham só o schema corrente — o mesmo que o `ALTER TABLE` abaixo
 * resolve —, para que uma cópia antiga em outro schema não dispare a migração.
 */
const HAS_LEGACY_VOLTAGE_COLUMNS_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND ((table_name = 'trains' AND column_name = 'voltage_kv')
        OR (table_name = 'telemetry_samples' AND column_name = 'min_kv'))
  ) AS legacy
`;

const LEGACY_VOLTAGE_COLUMNS_DDL = `
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'trains' AND column_name = 'voltage_kv'
    ) THEN
      ALTER TABLE trains RENAME COLUMN voltage_kv TO voltage_v;
      ALTER TABLE trains ALTER COLUMN voltage_v TYPE NUMERIC(6, 1);
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'telemetry_samples' AND column_name = 'min_kv'
    ) THEN
      ALTER TABLE telemetry_samples RENAME COLUMN min_kv TO min_v;
      ALTER TABLE telemetry_samples RENAME COLUMN avg_kv TO avg_v;
      ALTER TABLE telemetry_samples RENAME COLUMN max_kv TO max_v;
      ALTER TABLE telemetry_samples
        ALTER COLUMN min_v TYPE NUMERIC(6, 1),
        ALTER COLUMN avg_v TYPE NUMERIC(6, 1),
        ALTER COLUMN max_v TYPE NUMERIC(6, 1);
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'stations' AND column_name = 'nominal_voltage_kv'
    ) THEN
      ALTER TABLE stations RENAME COLUMN nominal_voltage_kv TO nominal_voltage_v;
      ALTER TABLE stations ALTER COLUMN nominal_voltage_v TYPE NUMERIC(6, 1);
    END IF;
  END $$;

  ALTER TABLE stations ADD COLUMN IF NOT EXISTS connections TEXT[] NOT NULL DEFAULT '{}';
`;

/** O banco guarda tensão em kV (primeira versão do produto, catenária)? */
const hasLegacyVoltageColumns = async (): Promise<boolean> => {
  const result = await db.query<{ legacy: boolean }>(HAS_LEGACY_VOLTAGE_COLUMNS_SQL);
  return Boolean(result.rows[0]?.legacy);
};

const hasTable = async (table: string): Promise<boolean> => {
  const result = await db.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [table],
  );
  return (result.rowCount ?? 0) > 0;
};

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

/**
 * Adota a malha corrente nesta linha, descartando o que sobrou da anterior.
 *
 * O cenário é um banco que já rodou com outra malha na linha de demonstração:
 * a lista de estações mudou com o deploy, e composição, seção de energia ou
 * série histórica apontando para estação que não existe mais não tem como ser
 * exibida. A versão anterior disto varria o banco inteiro contra a lista fixa
 * de estações do código; aqui tudo é por linha, senão a limpeza de um cliente
 * alcançaria os dados do outro.
 *
 * O gatilho é o marcador de malha gravado na própria linha (`lines.mesh_version`),
 * e não a presença de resíduo: uma troca de malha que por acaso não deixe órfão
 * ainda precisa reiniciar as seções de energia, porque os nomes das SRs se
 * repetem entre malhas e passam a alimentar outras estações. Uma linha que o
 * cliente cadastrou tem o marcador dele e nunca entra aqui — só a linha semeada,
 * cuja malha o deploy move.
 *
 * Ocorrências, comunicações, alarmes e ordens de serviço ficam: são registro
 * histórico, e o código de estação neles é texto, não referência. A série
 * histórica das estações que ficaram também fica, exceto quando vem de um banco
 * em kV: ali os números foram medidos noutro sistema de tração, e a renomeação
 * das colunas os deixaria passar por volts.
 */
const MESH_MIGRATION_LOCK = 6_060_601;

interface LineMeshRow {
  mesh_version: string | null;
}

/**
 * Procedimentos de malhas anteriores, substituídos pela biblioteca corrente.
 *
 * A lista é explícita, e não "tudo que a semeadura não escreve": um procedimento
 * que o cliente escreveu na linha dele não é resíduo de deploy.
 */
const LEGACY_PROCEDURE_TITLES = [
  // Primeira versão do produto (catenária em kV, subestações TSS).
  'Desenergização de trecho da catenária',
  'Subtensão ou sobretensão em subestação (TSS)',
  'Risco de alagamento no entorno do Rio Tietê',
  'Falha de comunicação com o sistema ATS',
  // Biblioteca da Linha 2-Verde.
  'Falha de comunicação com o sistema ATS/CBTC',
  'Risco de alagamento na várzea do Tamanduateí',
];

/**
 * Adota como marcador da linha o registro de malha que a versão anterior mantinha
 * na instalação (`app_meta.key = 'line'`).
 *
 * Sem isto, um banco vindo daquela versão chegaria aqui como "malha não
 * registrada" e a adoção reiniciaria as seções de energia — uma seção que um
 * supervisor deixou desenergizada voltaria energizada no deploy, embora a malha
 * seja a mesma. O registro era da instalação porque lá havia uma linha só; aqui
 * ele passa a ser da linha semeada, que é de onde esses dados vieram.
 */
const adoptInstallationMeshMarker = async (lineId: string): Promise<void> => {
  if (!(await hasTable('app_meta'))) return;

  const adopted = await db.query(
    `UPDATE lines SET mesh_version = (SELECT value FROM app_meta WHERE key = 'line')
      WHERE id = $1 AND mesh_version IS NULL
        AND EXISTS (SELECT 1 FROM app_meta WHERE key = 'line')`,
    [lineId],
  );
  if (adopted.rowCount) {
    logger.info('Marcador de malha da instalação adotado pela linha semeada.');
  }
};

/** A linha representa outra malha (ou nenhuma) que não a que a semeadura escreve? */
const meshSuperseded = async (lineId: string, meshVersion: string): Promise<boolean> => {
  const row = await db.query<LineMeshRow>(`SELECT mesh_version FROM lines WHERE id = $1`, [lineId]);
  return (row.rows[0]?.mesh_version ?? null) !== meshVersion;
};

/**
 * Remove as estações que a malha nova não tem, antes de semear as dela.
 *
 * Vem antes da semeadura porque a posição é única dentro da linha: inserir a
 * estação de posição 1 da malha nova com a posição 1 da anterior ainda no lugar
 * é erro de chave, não semeadura aditiva. Com as estações saem, por cascata, as
 * séries históricas delas — a estação de outra malha não aparece em mapa nem em
 * relatório desta linha.
 *
 * O marcador de malha só é gravado no fim da adoção, então um processo que caia
 * entre os dois passos é refeito no boot seguinte.
 */
const removeSupersededStations = async (lineId: string, seed: LineSeed): Promise<void> => {
  if (!(await meshSuperseded(lineId, seed.meshVersion))) return;

  const codes = seed.stations.map((station) => station.code);
  const removed = await db.query(`DELETE FROM stations WHERE line_id = $1 AND code <> ALL($2::text[])`, [
    lineId,
    codes,
  ]);
  if (removed.rowCount) {
    logger.info(`Malha anterior da linha: ${removed.rowCount} estação(ões) que a malha nova não tem removida(s).`);
  }
};

/**
 * @param lineId linha semeada, a única cuja malha o deploy move.
 * @param meshVersion identificador da malha que a semeadura acabou de escrever.
 * @param alignmentFactor fator de traçado dessa malha, gravado junto com ela: a
 *   medida é do traçado, então troca quando o traçado troca.
 * @param fromLegacyVoltage o banco tinha colunas de tensão em kV neste boot.
 */
const adoptSeededMesh = async (lineId: string, seed: LineSeed, fromLegacyVoltage: boolean): Promise<void> => {
  const { meshVersion, alignmentFactor } = seed;
  const current = await db.query<LineMeshRow>(`SELECT mesh_version FROM lines WHERE id = $1`, [lineId]);
  if (current.rows[0]?.mesh_version === meshVersion && !fromLegacyVoltage) return;

  // Numa transação só: a linha nunca fica com parte da malha anterior removida.
  // O lock serializa duas instâncias subindo juntas; a releitura dentro dele é o
  // que evita a segunda fazer tudo de novo.
  await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [MESH_MIGRATION_LOCK, lineId]);
    const state = await client.query<LineMeshRow>(`SELECT mesh_version FROM lines WHERE id = $1 FOR UPDATE`, [lineId]);
    const previous = state.rows[0]?.mesh_version ?? null;
    if (previous === meshVersion && !fromLegacyVoltage) return;

    const trains = await client.query(
      `DELETE FROM trains
        WHERE line_id = $1
          AND (current_station_code NOT IN (SELECT code FROM stations WHERE line_id = $1)
            OR (next_station_code IS NOT NULL
                AND next_station_code NOT IN (SELECT code FROM stations WHERE line_id = $1)))`,
      [lineId],
    );
    const procedures = await client.query(`DELETE FROM procedures WHERE line_id = $1 AND title = ANY($2::text[])`, [
      lineId,
      LEGACY_PROCEDURE_TITLES,
    ]);
    // A categoria de OS de subestação de tração (TSS, em CA) virou subestação
    // retificadora (SR, em CC). As OSs ficam; só o rótulo da categoria muda.
    const workOrders = await client.query(
      `UPDATE work_orders SET category = 'SUBESTACAO_SR' WHERE line_id = $1 AND category = 'TSS_SUBESTACAO'`,
      [lineId],
    );
    // As seções desta linha são recriadas energizadas pela carga inicial: a SR-01
    // da malha nova não é a mesma instalação que a SR-01 da anterior, então a
    // manobra registrada lá não vale aqui.
    const sections = await client.query(`DELETE FROM power_sections WHERE line_id = $1`, [lineId]);
    // Leituras em kV não se convertem em leituras de trilho de alimentação.
    const samples = fromLegacyVoltage
      ? await client.query(
          `DELETE FROM telemetry_samples
            WHERE station_id IN (SELECT id FROM stations WHERE line_id = $1)`,
          [lineId],
        )
      : { rowCount: 0 };

    await client.query(`UPDATE lines SET mesh_version = $2, alignment_factor = $3 WHERE id = $1`, [
      lineId,
      meshVersion,
      alignmentFactor,
    ]);

    logger.info(
      `Malha da linha adotada (${previous ?? 'não registrada'} -> ${meshVersion}): ` +
        `${trains.rowCount ?? 0} composição(ões) removida(s), ` +
        `${procedures.rowCount ?? 0} procedimento(s) substituído(s), ` +
        `${workOrders.rowCount ?? 0} OS(s) recategorizada(s), ` +
        `${sections.rowCount ?? 0} seção(ões) de energia reiniciada(s)` +
        (fromLegacyVoltage ? `, ${samples.rowCount ?? 0} janela(s) de telemetria em kV descartada(s).` : '.'),
    );
  });
};

export const runMigrations = async (): Promise<void> => {
  await db.query(TENANCY_DDL);
  // A pergunta vem antes da renomeação, que é o que apaga o rastro dela: um banco
  // em kV mediu a tensão noutro sistema de tração, e os números não se convertem.
  const fromLegacyVoltage = await hasLegacyVoltageColumns();
  // Antes da semeadura: `stations` pode existir de uma versão anterior, com a
  // tensão em kV e sem as integrações, e o INSERT abaixo já usa as colunas novas.
  await db.query(LEGACY_VOLTAGE_COLUMNS_DDL);

  const { tenantId, lineId } = await seedTenancy();

  await db.query(OPERATIONAL_DDL);
  await upgradeLegacySchema(tenantId, lineId);
  // Depois do backfill: é ele que traz para esta linha os dados gravados antes
  // de existir noção de cliente, e é entre eles que pode haver malha anterior.
  await adoptSeededMesh(lineId, DEMO_TENANT_SEED.lines[0], fromLegacyVoltage);
  await db.query(INDEX_DDL);
  await renameLegacyOperatorRole();

  logger.info('Schema verificado (self-healing DDL aplicado).');

  await seedOperators(tenantId);
  await seedTrains(lineId);
  await seedPowerSections(lineId);
  await seedProcedures(lineId);

  logger.info('Carga inicial (auto-seeding) sincronizada.');
};

/** Cria o cliente de demonstração e a sua malha, se ainda não existirem. */
const seedTenancy = async (): Promise<{ tenantId: string; lineId: string }> => {
  const seed = DEMO_TENANT_SEED;

  // O cliente de demonstração mudou de nome quando a linha do produto mudou de
  // concessionária. Renomear o registro, e não semear um segundo, é o que
  // mantém os dados dele — e o destino do backfill — onde estavam. Idempotente:
  // num banco já renomeado não existe mais nenhum dos slugs anteriores.
  const renamed = await db.query(
    `UPDATE tenants SET slug = $1, name = $2
      WHERE slug = ANY($3::text[])
        AND NOT EXISTS (SELECT 1 FROM tenants WHERE slug = $1)`,
    [seed.slug, seed.name, [...seed.previousSlugs]],
  );
  if (renamed.rowCount) {
    logger.info(`Cliente de demonstração renomeado para "${seed.name}" (${seed.slug}).`);
  }

  const tenant = await db.query<{ id: string }>(
    `INSERT INTO tenants (slug, name) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
     RETURNING id`,
    [seed.slug, seed.name],
  );
  const tenantId = tenant.rows[0].id;

  const [lineSeed] = seed.lines;
  // Mesma regra do cliente: a linha de demonstração é renomeada, não duplicada.
  // Sem isto, trocar a malha do produto deixaria duas linhas no cliente — a
  // anterior com as estações, as composições e o histórico dela.
  const renamedLine = await db.query(
    `UPDATE lines SET code = $2, name = $3
      WHERE tenant_id = $1 AND code = ANY($4::text[])
        AND NOT EXISTS (SELECT 1 FROM lines WHERE tenant_id = $1 AND code = $2)`,
    [tenantId, lineSeed.code, lineSeed.name, [...lineSeed.previousCodes]],
  );
  if (renamedLine.rowCount) {
    logger.info(`Linha de demonstração renomeada para "${lineSeed.name}" (${lineSeed.code}).`);
  }

  const line = await db.query<{ id: string }>(
    `INSERT INTO lines (tenant_id, code, name) VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, code) DO UPDATE SET code = EXCLUDED.code
     RETURNING id`,
    [tenantId, lineSeed.code, lineSeed.name],
  );
  const lineId = line.rows[0].id;

  await adoptInstallationMeshMarker(lineId);
  await removeSupersededStations(lineId, lineSeed);

  // DO NOTHING e não DO UPDATE: a semeadura é ponto de partida, não fonte de
  // verdade. Uma estação ajustada pelo cliente não pode ser revertida no boot.
  for (const station of lineSeed.stations) {
    await db.query(
      `INSERT INTO stations
         (line_id, code, name, position, substation, nominal_voltage_v, connections, headway_seconds,
          map_x, map_y, lat, lon)
       VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11, $12)
       ON CONFLICT (line_id, code) DO NOTHING`,
      [
        lineId,
        station.code,
        station.name,
        station.position,
        station.substation,
        station.nominalVoltageV,
        [...station.connections],
        station.headwaySeconds,
        station.mapX,
        station.mapY,
        station.lat,
        station.lon,
      ],
    );
  }

  // A coordenada geográfica é coluna nova: onde ela está nula, ninguém a ajustou
  // ainda — é a malha semeada antes de a coluna existir. Preencher aí não é
  // sobrescrever cadastro do cliente, e é o que dá à linha as distâncias reais.
  for (const station of lineSeed.stations) {
    await db.query(
      `UPDATE stations SET lat = $3, lon = $4
        WHERE line_id = $1 AND code = $2 AND lat IS NULL AND lon IS NULL`,
      [lineId, station.code, station.lat, station.lon],
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

  // `power_sections` nasceu com a subestação como chave primária, de quando havia
  // uma linha só. A SR é dado da malha, então a seção pertence a uma linha: sem
  // isso, desenergizar a `SR-01` de um cliente apagaria a tensão da `SR-01` do outro.
  if (!(await hasColumn('power_sections', 'line_id'))) {
    const primaryKeys = await constraintNames('power_sections', 'p');
    await withTransaction(async (client) => {
      await client.query(`ALTER TABLE power_sections ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid()`);
      await client.query(`ALTER TABLE power_sections ADD COLUMN line_id UUID`);
      await client.query(`UPDATE power_sections SET line_id = $1 WHERE line_id IS NULL`, [lineId]);
      await client.query(`ALTER TABLE power_sections ALTER COLUMN line_id SET NOT NULL`);
      await dropConstraints(client, 'power_sections', primaryKeys);
      await client.query(`ALTER TABLE power_sections ADD PRIMARY KEY (id)`);
      await client.query(`ALTER TABLE power_sections ALTER COLUMN substation TYPE VARCHAR(20)`);
      await client.query(
        `ALTER TABLE power_sections ADD CONSTRAINT power_sections_line_substation_key UNIQUE (line_id, substation)`,
      );
      await client.query(
        `ALTER TABLE power_sections ADD CONSTRAINT power_sections_line_fkey
         FOREIGN KEY (line_id) REFERENCES lines(id) ON DELETE CASCADE`,
      );
    });
    logger.info('power_sections migrada: seção de energia amarrada à linha.');
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

  // As tabelas abaixo nasceram junto com as seções de Alarmes, Comunicações,
  // Procedimentos e Ordens de Serviço, antes de existir noção de cliente: num banco
  // que já rodou aquela versão elas existem sem `line_id`.
  for (const table of ['alarms', 'communications', 'work_orders'] as const) {
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
  // A tensão de partida de cada composição é a do trecho em que ela está, lida do
  // cadastro desta linha: a frota semeada não pode carregar a tensão de outra malha.
  const known = await db.query<{ code: string; nominal_voltage_v: string }>(
    `SELECT code, nominal_voltage_v FROM stations WHERE line_id = $1`,
    [lineId],
  );
  const voltageByCode = new Map(known.rows.map((row) => [row.code, Number(row.nominal_voltage_v)]));

  for (const [trainId, stationCode, direction, status] of SEED_TRAINS) {
    const nominalVoltageV = voltageByCode.get(stationCode);
    if (nominalVoltageV === undefined) continue;
    await db.query(
      `INSERT INTO trains (line_id, train_id, current_station_code, speed_kmh, voltage_v, status, direction)
       VALUES ($1, $2, $3, 0, $4, $5, $6)
       ON CONFLICT (line_id, train_id) DO NOTHING`,
      [lineId, trainId, stationCode, nominalVoltageV, status, direction],
    );
  }
};

/**
 * Uma seção de energia por subestação retificadora da malha desta linha.
 *
 * As SRs saem do cadastro das estações, não de uma lista em código: uma linha
 * nova ganha as seções dela sem que nada aqui mude. DO NOTHING porque o estado
 * de uma seção é operação — reiniciar o servidor não reenergiza, por engano, uma
 * seção que a manutenção mandou desligar.
 */
const seedPowerSections = async (lineId: string): Promise<void> => {
  await db.query(
    `INSERT INTO power_sections (line_id, substation)
     SELECT DISTINCT line_id, substation FROM stations WHERE line_id = $1
     ON CONFLICT (line_id, substation) DO NOTHING`,
    [lineId],
  );
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
