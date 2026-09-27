-- backend/infrastructure/database/schema.sql
-- Referência do schema. As mesmas DDLs são aplicadas automaticamente no boot por
-- backend/infrastructure/database/migrations.ts (self-healing DDL + auto-seeding),
-- que também converte bancos criados antes do multi-tenant.

-- ===========================================================================
-- Cliente, linha e malha
-- ===========================================================================
-- A malha deixou de ser constante de código (backend/domain/line.ts) e virou
-- dado. Um cliente pode ter mais de uma linha; uma linha tem as suas estações.

CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        VARCHAR(40) UNIQUE NOT NULL,      -- Ex: 'linha-uni'
    name        VARCHAR(120) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code        VARCHAR(20) NOT NULL,             -- Ex: 'L6'
    name        VARCHAR(120) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS stations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id             UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    code                VARCHAR(10) NOT NULL,     -- Código ATS de 3 caracteres
    name                VARCHAR(120) NOT NULL,
    position            INTEGER NOT NULL,         -- Ordem física ('order' é reservada)
    substation          VARCHAR(20) NOT NULL,
    nominal_voltage_kv  NUMERIC(5, 2) NOT NULL,
    headway_seconds     INTEGER,
    map_x               NUMERIC(6, 5),            -- Posição normalizada (0–1) no traçado
    map_y               NUMERIC(6, 5),
    UNIQUE (line_id, code),
    UNIQUE (line_id, position)
);

CREATE INDEX IF NOT EXISTS idx_lines_tenant ON lines (tenant_id);
CREATE INDEX IF NOT EXISTS idx_stations_line ON stations (line_id, position);

-- ===========================================================================
-- Operação
-- ===========================================================================
-- Dados da linha pendem de `line_id`; dados de pessoas pendem de `tenant_id`,
-- porque um supervisor pode responder por mais de uma linha do mesmo cliente.

CREATE TABLE IF NOT EXISTS operators (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    login_id       VARCHAR(50) NOT NULL,          -- Crachá digitado no login. Ex: 'EDP-042'
    name           VARCHAR(100) NOT NULL,
    role           VARCHAR(50) NOT NULL DEFAULT 'OPERADOR',  -- OPERADOR | SUPERVISOR | ADMIN
    password_hash  VARCHAR(255) NOT NULL,         -- bcrypt
    avatar_url     TEXT,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mfa_secret     TEXT,
    mfa_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    -- A credencial só precisa ser única dentro do cliente: dois clientes podem
    -- ter um EDP-042 cada, e o id interno é quem os distingue.
    UNIQUE (tenant_id, login_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id           SERIAL PRIMARY KEY,
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    operator_id  VARCHAR(50),                     -- O crachá: a trilha é lida por humanos
    action       VARCHAR(100) NOT NULL,
    target       VARCHAR(100) NOT NULL,
    status       VARCHAR(50) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trains (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id               UUID NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
    train_id              VARCHAR(20) NOT NULL,   -- Ex: 'T-01'
    current_station_code  VARCHAR(10) NOT NULL,
    speed_kmh             NUMERIC(5, 1) NOT NULL,
    voltage_kv            NUMERIC(5, 2) NOT NULL,
    status                VARCHAR(20) NOT NULL,   -- NORMAL | ATENÇÃO | EMERGÊNCIA
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

-- Todo índice começa pelo discriminador de cliente: é por ele que toda consulta filtra.
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_operator ON audit_logs (tenant_id, operator_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (line_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_station ON incidents (line_id, station_code);
CREATE INDEX IF NOT EXISTS idx_telemetry_bucket ON telemetry_samples (station_id, bucket_at DESC);
