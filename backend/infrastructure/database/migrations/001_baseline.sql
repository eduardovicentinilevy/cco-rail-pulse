-- 001_baseline.sql
-- Linha de base do schema do RailPulse CCO.
--
-- Corresponde ao estado que o antigo DDL auto-aplicado (self-healing) produzia,
-- de modo que bancos já em operação adotam esta migração sem recriar nada:
-- todos os objetos são criados com IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS operators (
    id VARCHAR(50) PRIMARY KEY,                     -- Ex.: 'EDP-042'
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'OPERADOR',   -- OPERADOR | SUPERVISOR | ADMIN
    password_hash VARCHAR(255) NOT NULL,            -- bcrypt
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mfa_secret TEXT,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    operator_id VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    target VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A trilha é sempre lida por recência; o índice evita full scan quando a tabela cresce.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_operator ON audit_logs (operator_id);

CREATE TABLE IF NOT EXISTS trains (
    train_id VARCHAR(20) PRIMARY KEY,               -- Ex.: 'T-01'
    current_station_code VARCHAR(10) NOT NULL,      -- Código ATS da malha
    speed_kmh NUMERIC(5, 1) NOT NULL,
    voltage_kv NUMERIC(5, 2) NOT NULL,
    status VARCHAR(20) NOT NULL,                    -- NORMAL | ATENÇÃO | EMERGÊNCIA
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
