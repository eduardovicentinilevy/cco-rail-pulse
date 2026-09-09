-- backend/infrastructure/database/schema.sql
-- Referência do schema. As mesmas DDLs são aplicadas automaticamente no boot por
-- backend/infrastructure/database/migrations.ts (self-healing DDL + auto-seeding).

CREATE TABLE IF NOT EXISTS operators (
    id VARCHAR(50) PRIMARY KEY,                       -- Ex: 'EDP-042'
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'OPERATOR_SOC',
    password_hash VARCHAR(255) NOT NULL,              -- bcrypt
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

-- A trilha é sempre lida por recência; o índice evita full scan quando a tabela cresce.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_operator ON audit_logs (operator_id);

CREATE TABLE IF NOT EXISTS trains (
    train_id VARCHAR(20) PRIMARY KEY,                 -- Ex: 'T-01'
    current_station_code VARCHAR(10) NOT NULL,        -- Código ATS de 3 caracteres
    speed_kmh NUMERIC(5, 1) NOT NULL,
    voltage_kv NUMERIC(5, 2) NOT NULL,
    status VARCHAR(20) NOT NULL,                      -- NORMAL | ATENÇÃO | EMERGÊNCIA
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
