-- 005_work_orders.sql
-- Tabela das Ordens de Serviço: manutenção planejada e corretiva sobre os ativos da malha.

CREATE TABLE IF NOT EXISTS work_orders (
    id SERIAL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    description TEXT NOT NULL,
    asset_code VARCHAR(80),
    station_code VARCHAR(10),
    category VARCHAR(40) NOT NULL,
    priority VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ABERTA',
    opened_by VARCHAR(50) NOT NULL,
    assigned_to VARCHAR(50),
    completion_note TEXT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    due_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders (status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_orders_station ON work_orders (station_code);
