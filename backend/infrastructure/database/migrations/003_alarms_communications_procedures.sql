-- 003_alarms_communications_procedures.sql
-- Tabelas das seções Central de Alarmes, Comunicações e Procedimentos.

-- Histórico persistido de alarmes: o feed ao vivo do painel vive só na sessão do
-- navegador, então sem esta tabela um alarme desaparece ao recarregar a página.
CREATE TABLE IF NOT EXISTS alarms (
    id SERIAL PRIMARY KEY,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_by VARCHAR(50),
    acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alarms_created_at ON alarms (created_at DESC);

CREATE TABLE IF NOT EXISTS communications (
    id SERIAL PRIMARY KEY,
    channel VARCHAR(30) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    station_code VARCHAR(10),
    train_id VARCHAR(20),
    operator_id VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communications_created_at ON communications (created_at DESC);

CREATE TABLE IF NOT EXISTS procedures (
    id SERIAL PRIMARY KEY,
    category VARCHAR(40) NOT NULL,
    title VARCHAR(160) NOT NULL UNIQUE,
    summary TEXT NOT NULL,
    steps JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procedures_category ON procedures (category);
