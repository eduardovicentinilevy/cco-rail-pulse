-- backend/infrastructure/database/schema.sql
-- Referência do schema criado automaticamente pelo bootstrap() em presentation/http/server.ts

CREATE TABLE IF NOT EXISTS operators (
    id VARCHAR(50) PRIMARY KEY, -- Ex: 'EDP-042'
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'OPERATOR_SOC',
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    operator_id VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    target VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trains (
    train_id VARCHAR(20) PRIMARY KEY, -- Ex: 'T-01'
    current_station_code VARCHAR(10) NOT NULL,
    speed_kmh NUMERIC(5, 1) NOT NULL,
    voltage_kv NUMERIC(5, 2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
