-- Habilita a extensão TimescaleDB para suporte a séries temporais massivas
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Criação da tabela relacional estática para metadados da frota
CREATE TABLE IF NOT EXISTS tb_fleet_metadata (
    fleet_code VARCHAR(2) PRIMARY KEY,
    description VARCHAR(50) NOT NULL
);

-- Utilização de Upsert (ON CONFLICT) para evitar falhas em reinicializações do contêiner
INSERT INTO tb_fleet_metadata (fleet_code, description) VALUES 
('I', 'Frota I - Cobrasma/Francorail'), 
('J', 'Frota J - Bombardier'), 
('L', 'Frota L - Alstom')
ON CONFLICT (fleet_code) DO NOTHING;

-- Criação da tabela de telemetria CBTC orientada a eventos temporais
CREATE TABLE IF NOT EXISTS tb_cbtc_telemetry (
    event_time TIMESTAMPTZ NOT NULL,
    fleet_code VARCHAR(2) NOT NULL,
    train_id INT NOT NULL,
    speed_kmh NUMERIC(5,2) NOT NULL CHECK (speed_kmh >= 0),
    latitude NUMERIC(10,8) NOT NULL,
    longitude NUMERIC(11,8) NOT NULL,
    doors_open BOOLEAN NOT NULL,
    cbtc_sync_status VARCHAR(20) NOT NULL,
    CONSTRAINT fk_fleet FOREIGN KEY (fleet_code) REFERENCES tb_fleet_metadata (fleet_code)
);

-- Transmuta a tabela em Hypertable (com if_not_exists para idempotência)
SELECT create_hypertable('tb_cbtc_telemetry', 'event_time', if_not_exists => TRUE);

-- Índices otimizados para o motor de Analytics (Headway e Dwell Time)
CREATE INDEX IF NOT EXISTS ix_telemetry_fleet_time ON tb_cbtc_telemetry (fleet_code, event_time DESC);
CREATE INDEX IF NOT EXISTS ix_telemetry_train_doors ON tb_cbtc_telemetry (train_id, event_time DESC) WHERE doors_open = true;

-- ============================================================================
-- INTEGRAÇÃO SOLICITADA: MÓDULO DE ALERTAS E GESTÃO DE INCIDENTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS tb_alerts (
    alert_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    train_id INT NOT NULL,
    fleet_code VARCHAR(2) NOT NULL,
    severity VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    acknowledged BOOLEAN DEFAULT false,
    ack_by UUID,
    ack_at TIMESTAMPTZ,
    CONSTRAINT fk_alerts_fleet FOREIGN KEY (fleet_code) REFERENCES tb_fleet_metadata (fleet_code)
);

-- Índice parcial crucial: Acelera consultas da fila de eventos ativos no CCO
CREATE INDEX IF NOT EXISTS ix_alerts_unacknowledged ON tb_alerts (created_at DESC) WHERE acknowledged = false;